// Estado de la app y acceso a datos. Un único cliente Supabase (el de auth.js).
// Ningún error se silencia: cada operación que falla lanza un Error con un
// mensaje que la interfaz puede mostrar tal cual.

import { db } from './auth.js';
import { EDGE_BASE, ASSET_META } from './config.js';
import { summarize, monthStart } from './core/portfolio.js';
import { applyTrade, removeTrade, validateTrade, sameTrade } from './core/trades.js';
import { PROFILES } from './core/advice.js';

function fresh() {
  return {
    user: null,
    positions: {},
    market: {},          // por ticker interno (VISA, no V)
    marketAt: null,      // Date de la última actualización de precios
    history: [],
    cash: 0,
    profile: 'equilibrado',
    status: { positions: 'idle', market: 'idle', history: 'idle' },
    errors: {},
  };
}
export const state = fresh();

// Borra TODO lo de la cuenta anterior. Se llama al salir y al entrar: sin esto
// la cartera de una cuenta se veía (y podía guardarse) en la siguiente.
// Cada reset abre una "generación" nueva. Toda operación asíncrona captura la
// suya y, al volver, sólo toca el estado si sigue siendo la vigente: una carga
// o escritura lenta de la sesión anterior (aunque sea del mismo usuario tras
// salir y entrar) no puede escribir en la actual.
let generation = 0;
export function resetState(user = null) {
  generation++;
  Object.assign(state, fresh(), { user });
}
export function currentGen() { return generation; }
function stillCurrent(gen) { return gen === generation && !!state.user; }
class StaleLoad extends Error {}
export function isStale(err) { return err instanceof StaleLoad; }

const profileKey = uid => `investsmart-profile:${uid}`;

// ── Nombres y símbolos ───────────────────────────────────────
export function yfOf(t) { return ASSET_META[t]?.yfTicker ?? t; }
export function nameOf(t) {
  return ASSET_META[t]?.full ?? state.market[t]?.name ?? t;
}

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Edge Functions ───────────────────────────────────────────
export async function edge(fn, body) {
  const { data: { session } } = await db.auth.getSession();
  let res;
  try {
    res = await fetch(`${EDGE_BASE}/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
  }
  let json = null;
  try { json = await res.json(); } catch { /* cuerpo vacío o no JSON */ }
  if (!res.ok) {
    if (res.status === 429) throw new Error(json?.error ?? 'Llegaste al límite de consultas. Espera unos minutos.');
    if (res.status === 401) throw new Error('Tu sesión caducó. Vuelve a entrar.');
    throw new Error(json?.error ?? `El servidor respondió con un error (${res.status}).`);
  }
  if (json && !Array.isArray(json) && json.error) throw new Error(json.error);
  return json;
}

// ── Carga inicial ────────────────────────────────────────────
export async function loadUserPrefs() {
  const gen = generation, uid = state.user.id;
  const { data: { user } } = await db.auth.getUser();
  if (!stillCurrent(gen) || user?.id !== uid) throw new StaleLoad();
  const meta = user?.user_metadata ?? {};
  state.cash = Number(meta.last_cash) > 0 ? Number(meta.last_cash) : 0;
  let profile = meta.profile;
  if (!PROFILES[profile]) { try { profile = localStorage.getItem(profileKey(uid)); } catch { profile = null; } }
  state.profile = PROFILES[profile] ? profile : 'equilibrado';
}

export async function loadPositions() {
  const gen = generation, uid = state.user.id;
  state.status.positions = 'loading';
  const { data, error } = await db.from('user_positions').select('data').eq('user_id', uid).maybeSingle();
  if (!stillCurrent(gen)) throw new StaleLoad();
  if (error) { state.status.positions = 'error'; state.errors.positions = error.message; throw new Error('No se pudieron cargar tus acciones.'); }
  state.positions = data?.data && typeof data.data === 'object' ? data.data : {};
  state.status.positions = 'ok';
}

export async function loadHistory() {
  const gen = generation, uid = state.user.id;
  state.status.history = 'loading';
  const { data, error } = await db.from('sessions')
    .select('fecha,fase,valor_total_usd,rendimientos')
    .eq('user_id', uid)
    .order('fecha', { ascending: true })
    .order('created_at', { ascending: true });
  if (!stillCurrent(gen)) throw new StaleLoad();
  if (error) { state.status.history = 'error'; throw new Error('No se pudo cargar tu historial.'); }
  // Un registro por día: si hay duplicados de versiones anteriores, gana el último.
  const byDate = new Map();
  for (const r of data ?? []) byDate.set(r.fecha, { ...r, valor_total_usd: Number(r.valor_total_usd) });
  state.history = [...byDate.values()];
  state.status.history = 'ok';
}

export async function loadMarket(extra = []) {
  const gen = generation;
  const tickers = [...new Set([...Object.keys(state.positions), ...extra])];
  if (!tickers.length) { state.status.market = 'ok'; return; }
  state.status.market = 'loading';
  // El precio de inicio de mes no cambia en todo el mes: se pide sólo cuando
  // falta, y con el mes del USUARIO (el servidor está en UTC y el último día
  // del mes por la tarde ya estaría en el siguiente).
  const ms = monthStart(todayStr());
  try {
    const out = {};
    // market-data admite hasta 20 símbolos por llamada.
    for (let i = 0; i < tickers.length; i += 20) {
      const chunk = tickers.slice(i, i + 20);
      const back = Object.fromEntries(chunk.map(t => [yfOf(t), t]));
      const needMonth = chunk.some(t => state.market[t]?.monthOf !== ms);
      const items = await edge('market-data', { tickers: chunk.map(yfOf), ...(needMonth ? { monthStart: ms } : {}) });
      for (const it of items ?? []) {
        if (!it || it.error || !(it.currentPrice > 0)) continue;
        const key = back[it.ticker] ?? it.ticker;
        const prev = state.market[key];
        const msp = it.monthStartPrice > 0 ? it.monthStartPrice : prev?.monthOf === ms ? prev.monthStartPrice : null;
        // Se marca el mes como consultado aunque Yahoo no tenga el dato: se
        // reintenta al volver a abrir la app, no en cada refresco.
        out[key] = { ...it, monthStartPrice: msp, monthOf: needMonth ? ms : prev?.monthOf ?? null };
      }
    }
    if (!stillCurrent(gen)) throw new StaleLoad();
    state.market = { ...state.market, ...out };
    state.marketAt = new Date();
    state.status.market = 'ok';
    delete state.errors.market;
  } catch (err) {
    if (err instanceof StaleLoad || !stillCurrent(gen)) throw new StaleLoad();
    state.status.market = 'error';
    state.errors.market = err.message;
    throw err;
  }
}

export async function quote(ticker) {
  const items = await edge('market-data', { tickers: [yfOf(ticker)] });
  const it = items?.[0];
  if (!it || it.error || !(it.currentPrice > 0)) throw new Error(`No encontré "${ticker}". Revisa el símbolo (ej.: AAPL, BRK-B).`);
  return it;
}

export async function searchTickers(q) {
  const items = await edge('market-data', { search: q });
  return Array.isArray(items) ? items : [];
}

// ── Escrituras ───────────────────────────────────────────────
// Las posiciones son un único JSON por usuario. Para no perder operaciones
// hechas en otro dispositivo, cada escritura es condicional (compare-and-set):
// se lee el JSON y su updated_at, se aplica el cambio sobre ESE JSON y se
// actualiza sólo si updated_at no cambió entretanto. Si cambió, se reintenta
// con lo nuevo. Sin fila todavía, se inserta (user_id es clave primaria: una
// inserción simultánea choca y también se reintenta).
const MAX_TRIES = 4;

async function updatePositions(mutate) {
  const gen = generation, uid = state.user.id;
  const fail = () => new Error('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
  for (let i = 0; i < MAX_TRIES; i++) {
    const { data: row, error: readErr } = await db.from('user_positions')
      .select('data,updated_at').eq('user_id', uid).maybeSingle();
    if (!stillCurrent(gen)) throw new StaleLoad();
    if (readErr) throw fail();
    const latest = row?.data && typeof row.data === 'object' ? row.data : {};
    const next = mutate(latest);
    const stamp = new Date().toISOString();

    let ok;
    if (row) {
      const { data: upd, error } = await db.from('user_positions')
        .update({ data: next, updated_at: stamp })
        .eq('user_id', uid).eq('updated_at', row.updated_at)
        .select('user_id');
      if (error) throw fail();
      ok = (upd ?? []).length > 0;
    } else {
      const { error } = await db.from('user_positions').insert({ user_id: uid, data: next, updated_at: stamp });
      if (error && error.code !== '23505') throw fail();
      ok = !error;
    }
    if (!stillCurrent(gen)) throw new StaleLoad();
    if (ok) { state.positions = next; return; }
  }
  throw new Error('Tus datos cambiaron en otro dispositivo mientras guardabas. Inténtalo de nuevo.');
}

export async function addTrade(trade) {
  await updatePositions(latest => {
    // Se valida otra vez contra lo último guardado (p. ej. una venta que otro
    // dispositivo ya registró).
    const r = validateTrade(trade, latest, todayStr());
    if (!r.ok) throw new Error(r.error);
    return applyTrade(latest, r.trade);
  });
}

export async function deleteTrade(ticker, kind, idx) {
  const key = kind === 'sell' ? 'sales' : 'purchases';
  const mine = state.positions[ticker]?.[key]?.[idx];
  await updatePositions(latest => {
    if (!sameTrade(mine, latest[ticker]?.[key]?.[idx])) {
      state.positions = latest;
      throw new Error('Tus operaciones cambiaron en otro dispositivo. Revisa la lista e inténtalo de nuevo.');
    }
    return removeTrade(latest, ticker, kind, idx);
  });
}

export async function setCash(amount) {
  const gen = generation;
  const n = Math.max(0, Number(amount) || 0);
  const { error } = await db.auth.updateUser({ data: { last_cash: n > 0 ? n : null } });
  if (!stillCurrent(gen)) throw new StaleLoad();
  if (error) throw new Error('No se pudo guardar el efectivo.');
  state.cash = n;
}

export async function setProfile(profile) {
  if (!PROFILES[profile]) return;
  const gen = generation;
  state.profile = profile;
  try { localStorage.setItem(profileKey(state.user.id), profile); } catch { /* sólo comodidad */ }
  const { error } = await db.auth.updateUser({ data: { profile } });
  if (!stillCurrent(gen)) throw new StaleLoad();
  if (error) throw new Error('El perfil se aplicó aquí, pero no se guardó en tu cuenta.');
}

// Un registro por día con el valor total. Si hoy ya hay un registro
// AUTOMÁTICO se actualiza en lugar de duplicarlo; un registro manual (o de
// versiones anteriores de la app) nunca se toca. Sólo se guarda cuando todos
// los precios están al día: un valor parcial ensuciaría el gráfico.
const AUTO = 'Registro automático';

export async function snapshotToday() {
  const gen = generation, uid = state.user?.id;
  if (!uid) return false;
  const s = summarize({ positions: state.positions, market: state.market, cash: state.cash });
  if (!s.holdings.length || !s.complete || !(s.total > 0)) return false;
  const fecha = todayStr();
  const rendimientos = Object.fromEntries(s.holdings.map(h => [h.ticker, +h.gainPct.toFixed(2)]));
  const row = { fecha, fase: AUTO, valor_total_usd: +s.total.toFixed(2), rendimientos };

  // Se consulta la base (no sólo la memoria): otra pestaña pudo guardar hoy.
  const { data: existing, error: readErr } = await db.from('sessions')
    .select('fecha,fase').eq('user_id', uid).eq('fecha', fecha);
  if (!stillCurrent(gen)) return false;
  if (readErr) throw new Error('No se pudo guardar el registro de hoy.');
  if ((existing ?? []).some(r => r.fase !== AUTO)) return false;

  const q = existing?.length
    ? db.from('sessions').update(row).eq('user_id', uid).eq('fecha', fecha).eq('fase', AUTO)
    : db.from('sessions').insert({ user_id: uid, ...row });
  const { error } = await q;
  if (!stillCurrent(gen)) return false;
  if (error) throw new Error('No se pudo guardar el registro de hoy.');
  state.history = [...state.history.filter(r => r.fecha !== fecha), row].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return true;
}

// Registro manual del valor total, para quien no carga sus acciones.
export async function recordManualValue(fecha, valor) {
  const gen = generation;
  const v = Number(valor);
  if (!(v > 0)) throw new Error('El valor debe ser mayor que 0.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > todayStr()) throw new Error('Elige una fecha válida, que no sea futura.');
  const row = { fecha, fase: 'Registro manual', valor_total_usd: +v.toFixed(2), rendimientos: {} };
  const exists = state.history.some(r => r.fecha === fecha);
  const q = exists
    ? db.from('sessions').update({ valor_total_usd: row.valor_total_usd, fase: row.fase }).eq('user_id', state.user.id).eq('fecha', fecha)
    : db.from('sessions').insert({ user_id: state.user.id, ...row });
  const { error } = await q;
  if (!stillCurrent(gen)) throw new StaleLoad();
  if (error) throw new Error('No se pudo guardar el registro.');
  const prev = state.history.find(r => r.fecha === fecha);
  state.history = [...state.history.filter(r => r.fecha !== fecha), { ...(prev ?? row), valor_total_usd: row.valor_total_usd }]
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export async function deleteHistory() {
  const gen = generation;
  const { error } = await db.from('sessions').delete().eq('user_id', state.user.id);
  if (!stillCurrent(gen)) throw new StaleLoad();
  if (error) throw new Error('No se pudo borrar el historial.');
  state.history = [];
}

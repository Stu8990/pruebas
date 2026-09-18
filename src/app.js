// Punto de entrada: acceso, navegación, eventos y ciclo de carga.
// Sin handlers en línea: todo va por delegación con data-action.

import { db, signIn, signUp, sendReset, changePassword, signOut } from './auth.js';
import {
  state, resetState, isStale, currentGen, loadUserPrefs, loadPositions, loadHistory, loadMarket, quote, searchTickers,
  addTrade, deleteTrade, setCash, setProfile, snapshotToday, recordManualValue, deleteHistory,
  edge, nameOf, todayStr,
} from './data.js';
import { model } from './model.js';
import { validateTrade, TICKER_RE, parseNum } from './core/trades.js';
import { monthName, timeAgo, esc } from './format.js';
import { openSheet, closeSheet, sheetBody, isSheetOpen } from './ui/sheet.js';
import { renderHome, setRange } from './views/home.js';
import { renderHoldings, holdingSheet, tradeForm } from './views/holdings.js';
import { renderPlan, planState } from './views/plan.js';
import { renderMore } from './views/more.js';

const $ = (sel, root = document) => root.querySelector(sel);
const TABS = { inicio: renderHome, acciones: renderHoldings, plan: renderPlan, mas: renderMore };
const TITLES = { inicio: 'Inicio', acciones: 'Mis acciones', plan: 'Tu plan', mas: 'Más' };

// ── Toast ──────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${kind ? 'toast--' + kind : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3800);
}

// ── Render ─────────────────────────────────────────────────
function currentTab() {
  const t = location.hash.slice(1);
  return TABS[t] ? t : 'inicio';
}

let lastM = null;
// preserveDrafts: sólo para re-renders que el usuario no pidió (refresco de
// precios). Tras un envío o un chip, lo que manda es el estado nuevo.
function render({ focus = false, preserveDrafts = false } = {}) {
  if (!state.user) return;
  const tab = currentTab();
  lastM = model();
  const view = $('#view');
  const y = window.scrollY;
  const ps = state.status.positions;
  // Un re-render (p. ej. el refresco de precios cada 5 min) no debe borrar lo
  // que el usuario está escribiendo: se guardan los valores tecleados y el
  // foco, y se restauran si la misma pestaña sigue en pantalla.
  const sameTab = preserveDrafts && view.dataset.tab === tab;
  const drafts = sameTab ? [...view.querySelectorAll('input[id]')]
    .filter(i => i.type !== 'radio' && i.value !== i.defaultValue)
    .map(i => [i.id, i.value]) : [];
  const focusId = sameTab && view.contains(document.activeElement) ? document.activeElement.id : null;
  const sel = focusId ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  view.innerHTML = ps === 'ok' ? TABS[tab](lastM)
    : ps === 'error' ? loadError()
    : loadingView();
  for (const [id, v] of drafts) { const el = document.getElementById(id); if (el) el.value = v; }
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(...sel); } catch { /* no es texto */ } }
  }
  view.dataset.tab = tab;
  document.title = `${TITLES[tab]} · InvestSmart`;
  document.querySelectorAll('.tab').forEach(a => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (focus) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }
  else window.scrollTo(0, y);
  updateRefreshLabel();
}

function loadingView() {
  return `
    <section class="hero" aria-busy="true">
      <p class="hero__line skeleton" style="width:72%">&nbsp;</p>
      <p class="hero__line skeleton" style="width:92%">&nbsp;</p>
      <p class="hero__line skeleton" style="width:50%">&nbsp;</p>
      <p class="sr-only">Cargando tus datos…</p>
    </section>
    <button class="btn btn--quiet btn--block" data-action="signout">Cerrar sesión</button>`;
}

function loadError() {
  return `
    <section class="empty">
      <h1 class="display">No pude cargar tus acciones.</h1>
      <p class="lead">Revisa tu conexión a internet. Tus datos siguen guardados.</p>
      <button class="btn btn--primary btn--block" data-action="reload">Reintentar</button>
      <button class="btn btn--quiet btn--block" data-action="signout">Cerrar sesión</button>
    </section>`;
}

function rerenderSheetHolding() {
  const b = sheetBody();
  const t = b?.dataset.holding;
  if (t && isSheetOpen()) b.innerHTML = holdingSheet(t, model());
}

window.addEventListener('hashchange', () => { closeSheet(); render({ focus: true }); });

// ── Precios ────────────────────────────────────────────────
// Qué generación está refrescando (null = nadie). Un refresco pendiente de la
// sesión anterior no bloquea ni pinta la nueva.
let refreshingGen = null;
const isRefreshing = () => refreshingGen === currentGen();
function updateRefreshLabel() {
  const l = $('#refresh-label');
  if (!l) return;
  const btn = l.closest('.refresh');
  const refreshing = isRefreshing();
  btn.classList.toggle('is-busy', refreshing);
  btn.classList.toggle('is-error', state.status.market === 'error');
  l.textContent = refreshing ? 'Actualizando…'
    : state.status.market === 'error' ? 'Sin precios · Reintentar'
    : state.marketAt ? `Precios ${timeAgo(state.marketAt)}` : 'Actualizar';
}

async function refreshPrices({ quiet = false } = {}) {
  if (isRefreshing() || !state.user) return;
  const gen = currentGen();
  refreshingGen = gen; updateRefreshLabel();
  try {
    await loadMarket();
    try { await snapshotToday(); } catch (e) { if (!isStale(e)) toast(e.message, 'bad'); }
    if (!quiet) toast('Precios actualizados');
  } catch (e) {
    if (!isStale(e)) toast(e.message, 'bad');
  } finally {
    if (refreshingGen === gen) refreshingGen = null;
    if (gen === currentGen()) {
      render({ preserveDrafts: true });
      rerenderSheetHolding();
    }
  }
}

const EVERY = 5 * 60 * 1000;
let timer = null;
function startTimer() { stopTimer(); timer = setInterval(() => refreshPrices({ quiet: true }), EVERY); }
function stopTimer() { if (timer) clearInterval(timer); timer = null; }
document.addEventListener('visibilitychange', () => {
  if (!state.user) return;
  if (document.visibilityState === 'hidden') stopTimer();
  else {
    if (!state.marketAt || Date.now() - state.marketAt.getTime() > EVERY) refreshPrices({ quiet: true });
    startTimer();
  }
});
setInterval(updateRefreshLabel, 30_000);

// ── Arranque ───────────────────────────────────────────────
function resetUi() {
  Object.assign(planState, { amount: '', candidate: null, candidateError: '', candidateLoading: false, ai: null, aiLoading: false, aiError: '' });
  lastM = null;
  closeSheet();
  $('#view').innerHTML = '';
}

async function startApp(user) {
  if (state.user?.id === user.id) return;
  resetUi();
  resetState(user);
  document.body.dataset.auth = 'in';
  $('#auth').hidden = true;
  $('#app').hidden = false;
  if (!location.hash) history.replaceState(null, '', '#inicio');
  render();

  const results = await Promise.allSettled([loadUserPrefs(), loadPositions(), loadHistory()]);
  if (state.user?.id !== user.id) return; // salió o entró otra cuenta mientras cargaba
  const failed = results.find(r => r.status === 'rejected' && !isStale(r.reason));
  if (failed) toast(failed.reason?.message ?? 'No se pudieron cargar tus datos.', 'bad');
  render();
  // Los precios necesitan las posiciones ya cargadas (antes el registro
  // automático corría antes que ellas y casi nunca se guardaba).
  if (state.status.positions === 'ok') await refreshPrices({ quiet: true });
  startTimer();
}

function showAuth() {
  resetState();
  resetUi();
  stopTimer();
  document.body.dataset.auth = 'out';
  $('#app').hidden = true;
  $('#auth').hidden = false;
  closeSheet();
}

db.auth.onAuthStateChange((event, session) => {
  if (session?.user) startApp(session.user);
  else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') showAuth();
});

// ── Acceso ─────────────────────────────────────────────────
function authView(v) {
  for (const id of ['login', 'signup', 'forgot']) $(`#form-${id}`).hidden = id !== v;
  $(`#form-${v} input`)?.focus();
}

function formMsg(form, { error, info } = {}) {
  const p = form.querySelector('.form-msg');
  if (!p) return;
  p.hidden = !(error || info);
  p.textContent = error || info || '';
  p.classList.toggle('form-msg--ok', !!info && !error);
}

async function busy(btn, label, fn) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
}

$('#form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget;
  const r = await busy(f.querySelector('[type=submit]'), 'Entrando…', () => signIn(f.email.value.trim(), f.password.value));
  formMsg(f, r);
});
$('#form-signup').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget;
  const r = await busy(f.querySelector('[type=submit]'), 'Creando…', () => signUp(f.email.value.trim(), f.password.value, f.password2.value));
  formMsg(f, r);
});
$('#form-forgot').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget;
  const r = await busy(f.querySelector('[type=submit]'), 'Enviando…', () => sendReset(f.email.value.trim()));
  formMsg(f, r);
});

// ── Hojas ──────────────────────────────────────────────────
function openHolding(ticker) {
  const body = openSheet(nameOf(ticker), holdingSheet(ticker, lastM ?? model()));
  body.dataset.holding = ticker;
}

function openTrade({ kind = 'buy', ticker = '', amount = '' } = {}) {
  const price = ticker && state.market[ticker]?.currentPrice ? String(state.market[ticker].currentPrice) : '';
  const body = openSheet(kind === 'sell' ? 'Anotar venta' : 'Anotar compra', tradeForm({ kind, ticker, today: todayStr(), price }));
  delete body.dataset.holding;
  const f = $('#trade-form', body);
  if (amount) f.amount.value = amount;
  wireTradeForm(f);
}

function wireTradeForm(f) {
  let t = null;
  const box = $('[data-suggest]', f);
  f.addEventListener('change', e => {
    if (e.target.name === 'kind') {
      const sell = e.target.value === 'sell';
      f.querySelector('[type=submit]').textContent = sell ? 'Guardar venta' : 'Guardar compra';
      f.querySelector('legend').textContent = `¿Cuánto ${sell ? 'vendiste' : 'compraste'}?`;
    }
  });
  f.ticker.addEventListener('input', () => {
    clearTimeout(t);
    const q = f.ticker.value.trim();
    if (q.length < 2 || state.positions[q.toUpperCase()]) { box.hidden = true; return; }
    t = setTimeout(async () => {
      try {
        const res = await searchTickers(q);
        box.innerHTML = res.slice(0, 6).map(r => `
          <button type="button" class="suggest__opt" data-action="pick-ticker" data-ticker="${esc(r.ticker)}">
            <strong>${esc(r.ticker)}</strong> <span>${esc(r.name)}</span></button>`).join('');
        box.hidden = !res.length;
      } catch { box.hidden = true; }
    }, 350);
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const input = Object.fromEntries(new FormData(f));
    // La venta no puede ser de algo sin fecha futura; validateTrade lo comprueba todo.
    const r = validateTrade(input, state.positions, todayStr());
    if (!r.ok) { formMsg(f, { error: r.error }); return; }
    const btn = f.querySelector('[type=submit]');
    try {
      await busy(btn, 'Guardando…', () => addTrade(r.trade));
      closeSheet();
      toast(r.trade.kind === 'sell' ? `Venta de ${r.trade.ticker} guardada` : `Compra de ${r.trade.ticker} guardada`, 'good');
      render();
      if (!state.market[r.trade.ticker]) refreshPrices({ quiet: true });
      else snapshotToday().catch(err => { if (!isStale(err)) toast(err.message, 'bad'); });
    } catch (err) {
      if (!isStale(err)) formMsg(f, { error: err.message });
    }
  });
}

function openCash() {
  openSheet('Efectivo en XTB', `
    <form id="cash-form" class="stack" novalidate>
      <p class="muted">El dinero que tienes en tu cuenta de XTB sin invertir. Lo ves en XTB como «Margen libre» o «Saldo disponible».</p>
      <label class="field"><span class="field__label">Efectivo (USD)</span>
        <input name="cash" type="text" inputmode="decimal" autocomplete="off" value="${state.cash || ''}" autofocus></label>
      <p class="form-msg" role="alert" hidden></p>
      <button class="btn btn--primary btn--block" type="submit">Guardar efectivo</button>
    </form>`);
  $('#cash-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget;
    const v = f.cash.value.trim() ? parseNum(f.cash.value) : 0;
    if (!(v >= 0) || !Number.isFinite(v)) { formMsg(f, { error: 'Escribe un monto válido.' }); return; }
    try {
      await busy(f.querySelector('[type=submit]'), 'Guardando…', () => setCash(v));
      closeSheet(); toast('Efectivo guardado', 'good'); render();
      snapshotToday().catch(err => { if (!isStale(err)) toast(err.message, 'bad'); });
    } catch (err) { formMsg(f, { error: err.message }); }
  });
}

function openPassword() {
  openSheet('Cambiar contraseña', `
    <form id="pwd-form" class="stack" novalidate>
      <label class="field"><span class="field__label">Nueva contraseña</span>
        <input name="p1" type="password" autocomplete="new-password" minlength="6" required autofocus></label>
      <label class="field"><span class="field__label">Repítela</span>
        <input name="p2" type="password" autocomplete="new-password" minlength="6" required></label>
      <p class="form-msg" role="alert" hidden></p>
      <button class="btn btn--primary btn--block" type="submit">Guardar contraseña</button>
    </form>`);
  $('#pwd-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget;
    const r = await busy(f.querySelector('[type=submit]'), 'Guardando…', () => changePassword(f.p1.value, f.p2.value));
    if (r.error) formMsg(f, r); else { closeSheet(); toast(r.info, 'good'); }
  });
}

function openManual() {
  openSheet('Anotar valor a mano', `
    <form id="manual-form" class="stack" novalidate>
      <p class="muted">Útil si no anotas tus acciones: escribe el valor total de tu cuenta de XTB («Valor de la cuenta»).</p>
      <label class="field"><span class="field__label">Fecha</span>
        <input name="fecha" type="date" value="${todayStr()}" max="${todayStr()}" required></label>
      <label class="field"><span class="field__label">Valor total (USD)</span>
        <input name="valor" type="text" inputmode="decimal" autocomplete="off" required autofocus></label>
      <p class="form-msg" role="alert" hidden></p>
      <button class="btn btn--primary btn--block" type="submit">Guardar valor</button>
    </form>`);
  $('#manual-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      await busy(f.querySelector('[type=submit]'), 'Guardando…', () => recordManualValue(f.fecha.value, parseNum(f.valor.value)));
      closeSheet(); toast('Valor guardado', 'good'); render();
    } catch (err) { formMsg(f, { error: err.message }); }
  });
}

function openWipe() {
  openSheet('Borrar historial', `
    <div class="stack">
      <p>Se borrarán los ${state.history.length} registros diarios del valor de tu cuenta. Tus acciones y operaciones no se tocan.</p>
      <p><strong>No se puede deshacer.</strong> Si quieres, descarga antes tus datos.</p>
      <button class="btn btn--danger btn--block" data-action="wipe-confirm">Borrar historial</button>
      <button class="btn btn--quiet btn--block" data-sheet-close>Cancelar</button>
    </div>`);
}

function exportData() {
  const blob = new Blob([JSON.stringify({ exportado: new Date().toISOString(), posiciones: state.positions, historial: state.history, efectivo: state.cash }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `investsmart-${todayStr()}.json` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Datos descargados', 'good');
}

// ── IA ─────────────────────────────────────────────────────
async function ask(q) {
  q = String(q ?? '').trim().slice(0, 400);
  if (!q || planState.aiLoading) return;
  const gen = currentGen();
  planState.aiLoading = true; planState.aiError = ''; render();
  const m = model();
  const s = m.summary;
  try {
    const res = await edge('ai-analysis', {
      mode: 'advisor',
      question: q,
      positions: s.holdings.map(h => {
        const mk = state.market[h.ticker] ?? {};
        const r = mk.week52High > mk.week52Low ? Math.round((h.price - mk.week52Low) / (mk.week52High - mk.week52Low) * 100) : null;
        return {
          ticker: h.ticker, shares: +h.shares.toFixed(4), avgPrice: +h.avgPrice.toFixed(2), costBasis: +h.cost.toFixed(2),
          currentPrice: h.price, pnlUSD: h.gain === null ? null : +h.gain.toFixed(2), pnlPct: h.gainPct === null ? null : +h.gainPct.toFixed(2),
          changeToday: h.changePercent, pe: mk.pe ?? null, forwardPe: mk.forwardPe ?? null, analystRating: mk.analystRating ?? null,
          week52High: mk.week52High ?? null, week52Low: mk.week52Low ?? null, rangePct: r,
        };
      }),
      portfolio: { totalInvested: +s.invested.toFixed(2), totalValue: +s.stocksValue.toFixed(2) },
      facts: {
        profile: state.profile,
        cash: +s.cash.toFixed(2),
        totalGain: +s.totalGain.toFixed(2),
        realized: +s.realized.toFixed(2),
        today: +s.today.toFixed(2),
        monthName: monthName(m.today),
        monthTotal: m.month.total === null ? null : +m.month.total.toFixed(2),
        monthByTicker: m.month.byTicker.slice(0, 8).map(x => ({ ticker: x.ticker, usd: +x.usd.toFixed(2) })),
        verdicts: Object.entries(m.verdicts).map(([ticker, v]) => ({ ticker, action: v.label, amount: v.amount ? Math.round(v.amount) : null, reason: v.reasons[0] })),
      },
    });
    if (gen !== currentGen()) return; // la sesión cambió mientras respondía
    planState.ai = { q, a: String(res?.answer ?? 'Sin respuesta.') };
  } catch (err) {
    if (gen !== currentGen()) return;
    planState.aiError = `No pude responder: ${err.message}`;
  } finally {
    if (gen === currentGen()) { planState.aiLoading = false; render(); }
  }
}

async function checkCandidate(raw) {
  const key = String(raw ?? '').trim().toUpperCase();
  if (!TICKER_RE.test(key)) { planState.candidateError = 'Escribe un símbolo válido, como AAPL o BRK-B.'; planState.candidate = null; render(); return; }
  const gen = currentGen();
  planState.candidateLoading = true; planState.candidateError = ''; render();
  try {
    const q = await quote(key);
    if (gen !== currentGen()) return;
    planState.candidate = { key, quote: q };
  } catch (err) {
    if (gen !== currentGen()) return;
    planState.candidate = null; planState.candidateError = err.message;
  } finally {
    if (gen === currentGen()) { planState.candidateLoading = false; render(); }
  }
}

// ── Delegación de eventos ──────────────────────────────────
const actions = {
  'auth-view': b => authView(b.dataset.view),
  go: b => { location.hash = b.dataset.tab; },
  refresh: () => refreshPrices(),
  reload: async () => {
    state.status.positions = 'loading'; render();
    try { await Promise.all([loadPositions(), loadHistory()]); } catch (err) { toast(err.message, 'bad'); }
    render();
    if (state.status.positions === 'ok') refreshPrices({ quiet: true });
  },
  range: b => { setRange(b.dataset.range); render(); },
  holding: b => openHolding(b.dataset.ticker),
  trade: b => openTrade({ kind: b.dataset.kind, ticker: b.dataset.ticker ?? '', amount: b.dataset.amount ?? '' }),
  cash: () => openCash(),
  password: () => openPassword(),
  manual: () => openManual(),
  wipe: () => openWipe(),
  export: () => exportData(),
  signout: async () => { await signOut(); toast('Sesión cerrada'); },
  amount: b => { planState.amount = b.dataset.amount; render(); },
  ask: b => ask(b.dataset.q),
  'pick-ticker': b => {
    const f = $('#trade-form');
    f.ticker.value = b.dataset.ticker;
    $('[data-suggest]', f).hidden = true;
    f.price.focus();
  },
  'use-price': async b => {
    const f = $('#trade-form');
    const tk = f.ticker.value.trim().toUpperCase();
    if (!TICKER_RE.test(tk)) { formMsg(f, { error: 'Primero escribe el símbolo.' }); return; }
    try {
      const q = state.market[tk] ?? await busy(b, 'Buscando…', () => quote(tk));
      f.price.value = (+q.currentPrice).toFixed(2);
      formMsg(f, {});
    } catch (err) { formMsg(f, { error: err.message }); }
  },
  'del-trade': async b => {
    // Dos toques: el primero pide confirmación en el propio botón.
    if (b.dataset.armed !== '1') {
      b.dataset.armed = '1';
      b.classList.add('is-armed');
      b.setAttribute('aria-label', 'Toca otra vez para borrar');
      setTimeout(() => { b.dataset.armed = ''; b.classList.remove('is-armed'); }, 3000);
      toast('Toca otra vez para borrar');
      return;
    }
    try {
      await deleteTrade(b.dataset.ticker, b.dataset.kind, +b.dataset.idx);
      toast('Operación borrada');
      render(); rerenderSheetHolding();
      snapshotToday().catch(err => { if (!isStale(err)) toast(err.message, 'bad'); });
    } catch (err) { toast(err.message, 'bad'); }
  },
  'wipe-confirm': async b => {
    try {
      await busy(b, 'Borrando…', () => deleteHistory());
      closeSheet(); toast('Historial borrado'); render();
    } catch (err) { toast(err.message, 'bad'); }
  },
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.action];
  if (!fn) return;
  if (b.tagName === 'INPUT') return; // radios: se manejan en 'change'
  e.preventDefault();
  fn(b);
});

document.addEventListener('change', async e => {
  if (e.target.dataset.action === 'profile') {
    try { await setProfile(e.target.value); } catch (err) { toast(err.message, 'bad'); }
    render();
  }
});

document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  if (f.dataset.form === 'contribution') { const n = parseNum(f.amount.value); planState.amount = Number.isFinite(n) ? String(n) : f.amount.value; render(); }
  if (f.dataset.form === 'candidate') checkCandidate(f.ticker.value);
  if (f.dataset.form === 'ask') { const q = f.q.value; f.q.value = ''; ask(q); }
});

// ── Service worker ─────────────────────────────────────────
// Recarga sólo cuando una versión NUEVA toma el control. En la primera visita
// no había controlador: recargar ahí borraba lo que el usuario estaba
// escribiendo (p. ej. el correo en el acceso). Y si está escribiendo, espera a
// que salga de la app para no perderle el formulario.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/pruebas/sw.js', { scope: '/pruebas/' })
      .then(reg => reg.update())
      .catch(err => console.warn('[SW] registro fallido:', err));
  });
  let reloaded = false;
  const reload = () => { if (!reloaded) { reloaded = true; window.location.reload(); } };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    const typing = document.activeElement?.matches?.('input, textarea, select') || isSheetOpen();
    if (!typing) { reload(); return; }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') reload(); }, { once: true });
  });
}

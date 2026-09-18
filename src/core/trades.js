// Compras y ventas: validación y cambios inmutables sobre el objeto de
// posiciones que se guarda en user_positions.data.
//   { TICKER: { purchases: [{date, shares, price}], sales: [{date, shares, price}] } }

import { ledger } from './portfolio.js';

export const TICKER_RE = /^[A-Z0-9.-]{1,10}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const round6 = n => Math.round(n * 1e6) / 1e6;

// Date.parse acepta «2026-02-31» (lo pasa a marzo): se exige que la fecha
// reconstruida sea exactamente la escrita.
function validDate(iso) {
  if (!DATE_RE.test(iso)) return false;
  const d = new Date(iso + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

// Misma operación, sin depender del orden de las claves del JSON.
export function sameTrade(a, b) {
  if (!a || !b) return false;
  return (a.date || '') === (b.date || '') && +a.shares === +b.shares && +a.price === +b.price;
}

// Números escritos por personas: «12,5» (coma decimal, habitual en
// Latinoamérica), «1,234.50» o «1.234,50» (con miles). La última coma o punto
// es el separador decimal si va seguida de 1-2 cifras, o de 3+ cuando es el
// único separador que aparece (p. ej. «0,5», «0,125»).
export function parseNum(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/\s|\$/g, '');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Los dos aparecen: el que va último es el decimal.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    const parts = s.split(',');
    // «1,234» (una coma y 3 cifras detrás) es ambiguo; con varias comas son miles.
    s = parts.length > 2 ? parts.join('') : parts.join('.');
  }
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

export function validateTrade(input, positions, today) {
  const kind = input.kind === 'sell' ? 'sell' : 'buy';
  const ticker = String(input.ticker ?? '').trim().toUpperCase();
  const date = String(input.date ?? '').trim();
  const price = parseNum(input.price);
  let shares = parseNum(input.shares);
  const amount = parseNum(input.amount);

  if (!TICKER_RE.test(ticker)) return { ok: false, error: 'Escribe un símbolo válido, como VOO, NVDA o BRK-B.' };
  if (!validDate(date)) return { ok: false, error: 'Elige una fecha válida.' };
  if (date > today) return { ok: false, error: 'La fecha no puede ser futura.' };
  if (!(price > 0) || !Number.isFinite(price)) return { ok: false, error: 'El precio por acción debe ser mayor que 0.' };
  if (!(shares > 0) && amount > 0) shares = amount / price;
  shares = round6(shares);
  if (!(shares > 0) || !Number.isFinite(shares)) return { ok: false, error: 'Indica cuántas acciones (o el monto en USD).' };

  const trade = { kind, ticker, date, shares, price };
  if (kind === 'sell') {
    // Se valida contra lo que había EN ESA FECHA, no hoy, y se comprueba que
    // ninguna venta posterior quede sin acciones al insertar ésta.
    const heldThen = ledger(positions?.[ticker], { until: date }).shares;
    if (!(heldThen > 0)) {
      return { ok: false, error: sharesNow(positions, ticker) > 0
        ? `El ${prettyDate(date)} todavía no tenías acciones de ${ticker}. Revisa la fecha.`
        : `No tienes acciones de ${ticker} para vender.` };
    }
    if (shares > heldThen + 1e-9) {
      return { ok: false, error: date === today
        ? `Sólo tienes ${+heldThen.toFixed(6)} acciones de ${ticker}.`
        : `El ${prettyDate(date)} tenías ${+heldThen.toFixed(6)} acciones de ${ticker}.` };
    }
    if (!consistent(applyTrade(positions, trade)[ticker])) {
      return { ok: false, error: `Con esta venta, otra venta posterior de ${ticker} quedaría sin acciones. Revisa la fecha o la cantidad.` };
    }
  }
  return { ok: true, trade };
}

function sharesNow(positions, ticker) { return ledger(positions?.[ticker]).shares; }

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function prettyDate(iso) { return `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`; }

function clone(positions) {
  return JSON.parse(JSON.stringify(positions ?? {}));
}

export function applyTrade(positions, trade) {
  const next = clone(positions);
  const p = next[trade.ticker] ?? { purchases: [] };
  const key = trade.kind === 'sell' ? 'sales' : 'purchases';
  p[key] = [...(p[key] ?? []), { date: trade.date, shares: trade.shares, price: trade.price }];
  next[trade.ticker] = p;
  return next;
}

// Comprueba en orden cronológico que ninguna venta supere lo que se tenía.
function consistent(position) {
  const ev = [
    ...(position.purchases ?? []).map(p => ({ d: p.date || '', q: +p.shares, b: 0 })),
    ...(position.sales ?? []).map(p => ({ d: p.date || '', q: -p.shares, b: 1 })),
  ].sort((a, b) => a.d.localeCompare(b.d) || a.b - b.b);
  let held = 0;
  for (const e of ev) { held += e.q; if (held < -1e-9) return false; }
  return true;
}

export function removeTrade(positions, ticker, kind, idx) {
  const next = clone(positions);
  const p = next[ticker];
  if (!p) return next;
  const key = kind === 'sell' ? 'sales' : 'purchases';
  p[key] = (p[key] ?? []).filter((_, i) => i !== idx);
  if (!consistent(p)) throw new Error('No puedes borrar esta compra: una venta posterior quedaría sin acciones. Borra primero la venta.');
  if (!(p.purchases ?? []).length && !(p.sales ?? []).length) delete next[ticker];
  else if (!(p.purchases ?? []).length) throw new Error('Borra primero las ventas de este activo.');
  return next;
}

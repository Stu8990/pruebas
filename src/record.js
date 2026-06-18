import { db } from './auth.js';
import { ASSET_META, EDGE_BASE } from './config.js';
import { getPositions, getAvgPrice, getTotalShares, hasPositions } from './positions.js';
import { getAllAssets } from './assets.js';
import { generateDescription } from './learn.js';
import { toast } from './utils.js';

const CASH_KEY = 'investsmart-last-cash';
let _qrData = null;

export async function quickRecord() {
  if (!hasPositions()) {
    toast('Agrega tus posiciones primero en la sección "Mis posiciones"');
    return;
  }
  const btn = document.getElementById('btn-quick-record');
  if (btn) { btn.disabled = true; btn.textContent = 'Calculando…'; }

  try {
    const positions = getPositions();
    const tickers   = Object.keys(positions);

    const toYf = {}, fromYf = {};
    for (const t of tickers) {
      const yf = ASSET_META[t]?.yfTicker ?? t;
      toYf[t] = yf; fromYf[yf] = t;
    }

    const { data: { session } } = await db.auth.getSession();
    const res = await fetch(`${EDGE_BASE}/market-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ tickers: tickers.map(t => toYf[t]) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    const byTicker = Object.fromEntries(items.map(i => [fromYf[i.ticker] ?? i.ticker, i]));

    let stocksValue = 0;
    const rendimientosCalc = {};
    for (const ticker of tickers) {
      const market = byTicker[ticker];
      if (!market?.currentPrice) continue;
      const avgPrice = getAvgPrice(ticker), totalShares = getTotalShares(ticker);
      if (!avgPrice || !totalShares) continue;
      stocksValue += totalShares * market.currentPrice;
      rendimientosCalc[ticker] = +( ((market.currentPrice - avgPrice) / avgPrice) * 100 ).toFixed(2);
    }

    _qrData = { stocksValue, rendimientosCalc };

    const savedCash = parseFloat(localStorage.getItem(CASH_KEY) || '') || 0;
    if (savedCash > 0) {
      _applyWithCash(savedCash);
    } else {
      const cashRow  = document.getElementById('qr-cash-row');
      const stocksEl = document.getElementById('qr-stocks-value');
      if (stocksEl) stocksEl.textContent = `$${stocksValue.toFixed(2)}`;
      if (cashRow)   cashRow.style.display = 'block';
    }
  } catch (err) {
    toast('Error al calcular precios: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Calcular y registrar'; }
  }
}

export function applyQuickRecord() {
  const cash = parseFloat(document.getElementById('qr-cash')?.value || '0') || 0;
  _applyWithCash(cash);
}

export function clearSavedCash() {
  localStorage.removeItem(CASH_KEY);
  _saveCashCloud(0);
  _updateCashHint(0);
  const cashRow = document.getElementById('qr-cash-row');
  if (cashRow) cashRow.style.display = 'none';
  toast('Capital en efectivo borrado. Ingrésalo en el próximo cálculo.');
}

export function autoDesc() {
  const fecha = document.getElementById('f-fecha')?.value;
  const valor = parseFloat(document.getElementById('f-valor')?.value || '0');
  if (!fecha || !valor) return;
  const rend = {};
  getAllAssets().forEach(({ ticker: t }) => {
    const v = document.getElementById('inp-' + t)?.value;
    rend[t] = (v === '' || v === undefined) ? null : +v;
  });
  const desc = generateDescription({ fecha, valor_total_usd: valor, rendimientos: rend });
  const ta = document.getElementById('f-fase');
  if (ta) ta.value = desc;
}

export async function refreshCashHint() {
  const cash = await _loadCashCloud();
  _updateCashHint(cash);
}

function _updateCashHint(cash) {
  const hint = document.getElementById('qr-cash-hint');
  if (!hint) return;
  if (cash > 0) {
    hint.innerHTML = `Capital en efectivo guardado: <strong>$${(+cash).toFixed(2)}</strong> · <a href="#" onclick="clearSavedCash();return false;" style="color:var(--primary);">¿Cambió?</a>`;
    hint.style.display = 'block';
  } else {
    hint.innerHTML = 'Sin capital guardado — ingrésalo una vez y quedará guardado.';
    hint.style.display = 'block';
  }
}

async function _saveCashCloud(amount) {
  try {
    await db.auth.updateUser({ data: { last_cash: amount > 0 ? amount : null } });
  } catch { /* localStorage ya guardó, cloud es best-effort */ }
}

async function _loadCashCloud() {
  try {
    const { data: { user } } = await db.auth.getUser();
    const cloud = user?.user_metadata?.last_cash;
    if (cloud > 0) {
      localStorage.setItem(CASH_KEY, String(cloud));
      return cloud;
    }
  } catch { /* fallback a localStorage */ }
  return parseFloat(localStorage.getItem(CASH_KEY) || '') || 0;
}

function _applyWithCash(cash) {
  if (!_qrData) return;
  const { stocksValue, rendimientosCalc } = _qrData;
  if (cash > 0) { localStorage.setItem(CASH_KEY, cash.toFixed(2)); _saveCashCloud(cash); }

  const total = stocksValue + cash;
  const valorEl = document.getElementById('f-valor');
  if (valorEl) { valorEl.value = total.toFixed(2); valorEl.dispatchEvent(new Event('input')); }

  for (const [ticker, rend] of Object.entries(rendimientosCalc)) {
    const inp = document.getElementById('inp-' + ticker);
    if (inp) inp.value = rend;
  }

  const cashRow = document.getElementById('qr-cash-row');
  if (cashRow) cashRow.style.display = 'none';
  document.getElementById('qr-cash').value = '';
  _qrData = null;
  _updateCashHint(cash);
  autoDesc();
  toast(`✓ Listo — acciones $${stocksValue.toFixed(2)} + efectivo $${cash.toFixed(2)} = $${total.toFixed(2)}`);
  document.getElementById('record-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

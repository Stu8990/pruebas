import { esc } from './utils.js';

const POS_KEY = 'investsmart-positions';

export function getPositions() {
  try { return JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch { return {}; }
}

function _save(pos) {
  localStorage.setItem(POS_KEY, JSON.stringify(pos));
}

export function addPurchase(ticker, date, shares, price) {
  const pos = getPositions();
  if (!pos[ticker]) pos[ticker] = { purchases: [] };
  pos[ticker].purchases.push({ date, shares: +shares, price: +price });
  _save(pos);
}

export function removePurchase(ticker, idx) {
  const pos = getPositions();
  if (!pos[ticker]) return;
  pos[ticker].purchases.splice(idx, 1);
  if (!pos[ticker].purchases.length) delete pos[ticker];
  _save(pos);
}

export function getAvgPrice(ticker) {
  const p = getPositions()[ticker];
  if (!p?.purchases?.length) return null;
  const totalShares = p.purchases.reduce((s, x) => s + x.shares, 0);
  const totalCost   = p.purchases.reduce((s, x) => s + x.shares * x.price, 0);
  return totalShares > 0 ? totalCost / totalShares : null;
}

export function getTotalShares(ticker) {
  const p = getPositions()[ticker];
  if (!p?.purchases?.length) return 0;
  return p.purchases.reduce((s, x) => s + x.shares, 0);
}

export function hasPositions() {
  return Object.keys(getPositions()).length > 0;
}

export function renderPositionsPanel() {
  const el = document.getElementById('positions-list');
  if (!el) return;

  const pos = getPositions();
  const tickers = Object.keys(pos);

  if (!tickers.length) {
    el.innerHTML = `<p style="font-size:12px;color:var(--text-3);padding:10px 0;">Sin posiciones registradas. Agrega tu primera compra para activar el registro rápido.</p>`;
    return;
  }

  el.innerHTML = tickers.map(ticker => {
    const avg    = getAvgPrice(ticker);
    const shares = getTotalShares(ticker);
    const buys   = pos[ticker].purchases;

    const buyRows = buys.map((b, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0 5px 12px;border-left:2px solid var(--border);">
        <div style="flex:1;font-size:11px;color:var(--text-3);">
          ${b.shares.toFixed(4)} vol. @ <strong style="color:var(--text-2);">$${(+b.price).toFixed(2)}</strong>
        </div>
        <button onclick="removePurchaseEntry('${esc(ticker)}',${i})" class="btn btn-ghost btn-sm" style="padding:2px 7px;font-size:11px;color:var(--danger);">✕</button>
      </div>`
    ).join('');

    return `
      <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="width:32px;height:32px;background:#f5f3ff;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="font-size:11px;font-weight:800;color:var(--primary);">${esc(ticker.slice(0,3))}</span>
          </div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;">${esc(ticker)}</div>
            <div style="font-size:11px;color:var(--text-3);">${shares} acc. · avg $${avg?.toFixed(2) ?? '—'}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;">${buyRows}</div>
      </div>`;
  }).join('');
}

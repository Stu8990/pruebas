import { EDGE_BASE } from './config.js';
import { Store } from './store.js';
import { db } from './auth.js';
import { esc } from './utils.js';
import { getPositions, getAvgPrice, getTotalShares } from './positions.js';
import { priceCache, marketCache } from './prices.js';

const CACHE_KEY = 'investsmart-ai-cache';
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!raw || Date.now() - raw.ts > CACHE_TTL) return null;
    return raw.data;
  } catch { return null; }
}

function saveCache(data) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
}

export function clearAiCache() {
  localStorage.removeItem(CACHE_KEY);
}

// Build cost-basis breakdown from saved positions
function getPositionValues() {
  const pos = getPositions();
  return Object.keys(pos).map(ticker => {
    const shares   = getTotalShares(ticker);
    const avgPrice = getAvgPrice(ticker) ?? 0;
    return { ticker, shares: +shares.toFixed(6), avgPrice: +avgPrice.toFixed(2), costBasis: +(shares * avgPrice).toFixed(2) };
  });
}

// Collect current market data already rendered in the DOM
function getMarketSnapshot() {
  try {
    const grid = document.getElementById('market-grid');
    if (!grid) return [];
    return [...grid.querySelectorAll('[data-ticker]')].map(el => ({
      ticker:        el.dataset.ticker,
      currentPrice:  parseFloat(el.dataset.price  || '0') || null,
      changePercent: parseFloat(el.dataset.change || '0') || null,
      pe:            parseFloat(el.dataset.pe     || '0') || null,
      analystRating: el.dataset.rating || null,
    }));
  } catch { return []; }
}

export async function fetchAiAnalysis(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = loadCache();
    if (cached) return cached;
  }

  const history = Store.history;
  if (history.length < 2) return null;

  const { data: { session } } = await db.auth.getSession();
  const res = await fetch(`${EDGE_BASE}/ai-analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ history: history.slice(-20), market: getMarketSnapshot(), positions: getPositionValues() }),
  });

  if (!res.ok) throw new Error(`ai-analysis HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  saveCache(data);
  return data;
}

export async function askAdvisor(question) {
  const pos     = getPositions();
  const tickers = Object.keys(pos);

  let totalInvested = 0, totalValue = 0;
  const positionData = tickers.map(ticker => {
    const shares    = getTotalShares(ticker);
    const avg       = getAvgPrice(ticker) ?? 0;
    const costBasis = shares * avg;
    const live      = priceCache.get(ticker);
    const mkt       = marketCache.get(ticker);
    const curValue  = live != null ? shares * live : null;
    const pnlUSD    = curValue != null ? curValue - costBasis : null;
    const pnlPct    = pnlUSD != null && costBasis > 0 ? (pnlUSD / costBasis * 100) : null;
    let rangePct = null;
    if (mkt?.week52High && mkt?.week52Low && live) {
      rangePct = +((live - mkt.week52Low) / (mkt.week52High - mkt.week52Low) * 100).toFixed(0);
    }
    totalInvested += costBasis;
    if (curValue != null) totalValue += curValue;
    return {
      ticker,
      shares:         +shares.toFixed(4),
      avgPrice:       +avg.toFixed(2),
      costBasis:      +costBasis.toFixed(2),
      currentPrice:   live != null ? +live.toFixed(2) : null,
      pnlUSD:         pnlUSD != null ? +pnlUSD.toFixed(2)  : null,
      pnlPct:         pnlPct != null ? +pnlPct.toFixed(2)  : null,
      changeToday:    mkt?.changePercent != null ? +mkt.changePercent.toFixed(2) : null,
      pe:             mkt?.pe != null ? +mkt.pe.toFixed(1) : null,
      forwardPe:      mkt?.forwardPe != null ? +mkt.forwardPe.toFixed(1) : null,
      analystRating:  mkt?.analystRating ?? null,
      week52High:     mkt?.week52High != null ? +mkt.week52High.toFixed(2) : null,
      week52Low:      mkt?.week52Low  != null ? +mkt.week52Low.toFixed(2)  : null,
      rangePct,
    };
  });

  const history = Store.history;
  const histSummary = history.length >= 2 ? {
    sessions:   history.length,
    firstValue: history[0].valor_total_usd,
    lastValue:  history.at(-1).valor_total_usd,
    growth:     ((history.at(-1).valor_total_usd - history[0].valor_total_usd) / history[0].valor_total_usd * 100).toFixed(1),
  } : null;

  const { data: { session } } = await db.auth.getSession();
  const res = await fetch(`${EDGE_BASE}/ai-analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({
      mode: 'advisor',
      question,
      positions: positionData,
      portfolio: {
        totalInvested: +totalInvested.toFixed(2),
        totalValue:    totalValue > 0 ? +totalValue.toFixed(2) : null,
      },
      history: histSummary,
    }),
  });

  if (!res.ok) throw new Error(`ai-analysis HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.answer;
}

export function renderAiPage(data) {
  _renderInsight(data);
  _renderRecommendations(data.recommendations ?? []);
  _renderPulse(data.pulse ?? []);
}

function _renderInsight(data) {
  const el = document.getElementById('daily-insight');
  if (el && data.insight) el.textContent = data.insight;
  // Show full confidence at 95 for LLM analysis
  const f = document.getElementById('conf-fill'), v = document.getElementById('conf-val');
  if (f) f.style.width = '95%';
  if (v) v.textContent = '95%';
}

function _renderRecommendations(recs) {
  const el = document.getElementById('recommendations');
  if (!el) return;
  el.innerHTML = recs.map(r => {
    const conf = r.conf ?? 80;
    const actionHtml = r.action
      ? `<div style="margin-top:10px;padding:8px 12px;background:rgba(0,0,0,.06);border-radius:8px;font-size:11px;font-weight:700;letter-spacing:.01em;">→ ${esc(r.action)}</div>`
      : '';
    return `<div class="rec2 rec2-${r.type ?? 'blue'}">
      <div class="rec2-bar"></div>
      <div class="rec2-body">
        <div class="rec2-head">
          <div class="rec2-icon">${esc(r.icon ?? '📊')}</div>
          <div class="rec2-meta">
            <div class="rec2-title">${esc(r.title)}</div>
            <span class="rec2-conf-pill">✦ ${conf.toFixed(0)}% confianza</span>
          </div>
        </div>
        <p class="rec2-text">${esc(r.body)}</p>
        ${actionHtml}
        <div class="rec2-footer">
          <div class="cbar"><div class="cbar-fill" style="width:${conf}%;"></div></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function _renderPulse(pulse) {
  const el = document.getElementById('pulse-cards');
  if (!el || !pulse.length) return;
  el.innerHTML = pulse.map(p =>
    `<div class="pulse-card pulse-card--${p.up ? 'up' : 'down'}">
      <div class="pulse-card__label">${esc(p.label)}</div>
      <div class="pulse-card__value mono">${esc(p.value)}</div>
      <div class="pulse-card__trend">${p.up ? '▲' : '▼'}</div>
      <div class="pulse-card__desc">${esc(p.desc ?? '')}</div>
    </div>`
  ).join('');
}

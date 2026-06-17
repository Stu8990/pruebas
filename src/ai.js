import { EDGE_BASE } from './config.js';
import { Store } from './store.js';
import { db } from './auth.js';
import { esc } from './utils.js';

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
    body: JSON.stringify({ history: history.slice(-20), market: getMarketSnapshot() }),
  });

  if (!res.ok) throw new Error(`ai-analysis HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  saveCache(data);
  return data;
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
  const cfg = {
    green:  { bg:'rec-green',  tc:'#065f46' },
    red:    { bg:'rec-red',    tc:'#7f1d1d' },
    blue:   { bg:'rec-blue',   tc:'#0c4a6e' },
    amber:  { bg:'rec-amber',  tc:'#78350f' },
    purple: { bg:'rec-purple', tc:'#4c1d95' },
  };
  el.innerHTML = recs.map(r => {
    const c = cfg[r.type] || cfg.blue;
    return `<div class="rec ${c.bg}">
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:18px;flex-shrink:0;">${esc(r.icon ?? '📊')}</span>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:${c.tc};margin-bottom:4px;">${esc(r.title)}</div>
          <p style="font-size:12px;color:${c.tc};opacity:.9;line-height:1.7;margin:0;">${esc(r.body)}</p>
          <div style="display:flex;align-items:center;gap:7px;margin-top:8px;">
            <div class="cbar" style="width:70px;"><div class="cbar-fill" style="width:${r.conf ?? 80}%;"></div></div>
            <span style="font-size:10px;font-weight:600;color:var(--primary);">Confianza ${(r.conf ?? 80).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function _renderPulse(pulse) {
  const el = document.getElementById('pulse-cards');
  if (!el || !pulse.length) return;
  el.innerHTML = pulse.map(p =>
    `<div style="background:white;border:1px solid var(--border);border-radius:10px;padding:12px;">
      <div style="font-size:10px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">${esc(p.label)}</div>
      <div class="mono" style="font-size:18px;font-weight:700;color:${p.up ? 'var(--success)' : 'var(--danger)'};">${esc(p.value)}</div>
      <div style="font-size:10px;color:var(--text-3);margin-top:3px;">${esc(p.desc ?? '')}</div>
    </div>`
  ).join('');
}

import { EDGE_BASE } from './config.js';
import { Store } from './store.js';
import { Learn } from './learn.js';
import { db } from './auth.js';
import { esc, toast, createCache } from './utils.js';
import { getAllAssets } from './assets.js';

const SLOTS_KEY = 'investsmart-buy-slots';
const CACHE_TTL = 30 * 60 * 1000;

function _slotCache(ticker) {
  return createCache(`investsmart-buy-${ticker}`, CACHE_TTL);
}

function _getSavedSlots() {
  try { return JSON.parse(localStorage.getItem(SLOTS_KEY) || '{}'); } catch { return {}; }
}

function _saveSlot(slotIndex, ticker) {
  const slots = _getSavedSlots();
  if (ticker) slots[slotIndex] = ticker;
  else delete slots[slotIndex];
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
}

async function _fetchMarketData(ticker) {
  const { data: { session } } = await db.auth.getSession();
  const res = await fetch(`${EDGE_BASE}/market-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ tickers: [ticker] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = await res.json();
  return items[0];
}

async function _fetchBuyAnalysis(ticker, marketData, portfolio) {
  const { data: { session } } = await db.auth.getSession();
  const res = await fetch(`${EDGE_BASE}/ai-analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ mode: 'buy', ticker, marketData, portfolio }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function _dominantSector() {
  const cur    = Store.cur();
  const assets = getAllAssets();
  const map    = {};
  assets.forEach(a => {
    const r = cur?.rendimientos?.[a.ticker];
    if (r !== null && r !== undefined && !isNaN(r)) {
      if (!map[a.sector]) map[a.sector] = 0;
      map[a.sector]++;
    }
  });
  const top = Object.entries(map).sort((a, b) => b[1] - a[1])[0];
  return top ? `${top[0]} (${top[1]} activos)` : null;
}

function _buildPortfolioContext(ticker) {
  const cur = Store.cur();
  const existingReturn = cur?.rendimientos?.[ticker] ?? null;
  return {
    valorActual:        cur?.valor_total_usd ?? null,
    riskScore:          Learn.s.riskScore,
    sesiones:           Store.history.length,
    existingReturn,
    dominantSector:     _dominantSector(),
    tickerIsInPortfolio: existingReturn !== null,
  };
}

function _verdictClass(verdict) {
  if (verdict === 'COMPRAR') return 'verdict-buy';
  if (verdict === 'EVITAR')  return 'verdict-avoid';
  return 'verdict-wait';
}

function _renderResult(slotEl, ticker, marketData, analysis) {
  const resultEl = slotEl.querySelector('.buy-slot-result');
  if (!resultEl) return;

  const chgColor = (marketData.changePercent ?? 0) >= 0 ? '#059669' : '#dc2626';
  const chgSign  = (marketData.changePercent ?? 0) >= 0 ? '+' : '';
  const scoreW   = Math.round((Math.min(10, Math.max(1, analysis.score ?? 5)) / 10) * 100);
  const vClass   = _verdictClass(analysis.verdict);

  let rangeBar = '';
  if (marketData.week52Low && marketData.week52High && marketData.currentPrice) {
    const pct = Math.min(100, Math.max(0,
      ((marketData.currentPrice - marketData.week52Low) / (marketData.week52High - marketData.week52Low)) * 100
    ));
    rangeBar = `
      <div style="margin-top:10px;">
        <div style="font-size:10px;color:var(--text-3);margin-bottom:4px;font-weight:600;">Rango 52 semanas</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:10px;color:#a8a29e;">$${marketData.week52Low.toFixed(0)}</span>
          <div style="flex:1;height:4px;background:#e7e5e4;border-radius:2px;position:relative;">
            <div style="position:absolute;left:${pct}%;transform:translateX(-50%);top:-3px;width:10px;height:10px;border-radius:50%;background:var(--primary);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.2);"></div>
          </div>
          <span style="font-size:10px;color:#a8a29e;">$${marketData.week52High.toFixed(0)}</span>
        </div>
      </div>`;
  }

  const favor = (analysis.puntos_favor || []).slice(0, 2)
    .map(p => `<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:4px;"><span style="color:#059669;flex-shrink:0;font-size:12px;">✓</span><span style="font-size:11px;color:var(--text-2);line-height:1.5;">${esc(p)}</span></div>`)
    .join('');
  const risks = (analysis.puntos_riesgo || []).slice(0, 2)
    .map(p => `<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:4px;"><span style="color:#d97706;flex-shrink:0;font-size:12px;">⚠</span><span style="font-size:11px;color:var(--text-2);line-height:1.5;">${esc(p)}</span></div>`)
    .join('');

  const slotIdx = slotEl.dataset.slot;

  resultEl.style.display = 'block';
  resultEl.innerHTML = `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        <div>
          <div style="font-size:16px;font-weight:800;font-family:'Space Grotesk',sans-serif;">${esc(ticker)}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:1px;">${esc(marketData.name ?? '')}</div>
        </div>
        <span class="${vClass}">${esc(analysis.verdict ?? '—')}</span>
      </div>
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:10px;color:var(--text-3);font-weight:600;">Score de compra</span>
          <span style="font-size:11px;font-weight:700;color:var(--primary);">${analysis.score ?? '—'}/10</span>
        </div>
        <div class="cbar"><div class="cbar-fill" style="width:${scoreW}%;"></div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center;">
        <span style="font-size:12px;font-weight:700;">$${marketData.currentPrice?.toFixed(2) ?? '—'}</span>
        <span style="font-size:11px;color:${chgColor};font-weight:600;">${chgSign}${marketData.changePercent?.toFixed(2) ?? '—'}% hoy</span>
        ${marketData.pe ? `<span style="font-size:10px;background:#f5f3ff;color:var(--primary);padding:1px 8px;border-radius:20px;font-weight:700;">PER ${marketData.pe.toFixed(1)}x</span>` : ''}
        ${marketData.forwardPe ? `<span style="font-size:10px;background:#f5f5f4;color:#78716c;padding:1px 8px;border-radius:20px;">Fwd ${marketData.forwardPe.toFixed(1)}x</span>` : ''}
      </div>
      ${rangeBar}
      <p style="font-size:12px;color:var(--text-2);line-height:1.6;margin:10px 0 8px;">${esc(analysis.razon_principal ?? '')}</p>
      <div style="margin-bottom:6px;">${favor}</div>
      <div style="margin-bottom:10px;">${risks}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;padding-top:8px;border-top:1px solid var(--border);">
        <div>
          ${analysis.precio_entrada ? `<div style="font-size:11px;color:var(--text-3);">Entrada: <strong style="color:var(--text-1);">${esc(analysis.precio_entrada)}</strong></div>` : ''}
          ${analysis.horizonte ? `<div style="font-size:10px;color:var(--text-3);margin-top:1px;">${esc(analysis.horizonte)}</div>` : ''}
        </div>
        <button onclick="clearBuySlot(${slotIdx})" class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 10px;">✕ Limpiar</button>
      </div>
    </div>`;
}

function _renderSlotLoading(slotEl, ticker) {
  const resultEl = slotEl.querySelector('.buy-slot-result');
  if (!resultEl) return;
  resultEl.style.display = 'block';
  resultEl.innerHTML = `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:8px;color:var(--text-3);font-size:12px;">
        <div style="width:14px;height:14px;border:2px solid var(--primary);border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0;"></div>
        Analizando ${esc(ticker)} con IA…
      </div>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;opacity:.35;animation:pulse-skeleton 1.4s ease infinite;">
        <div style="height:10px;background:#ddd6fe;border-radius:6px;width:70%;"></div>
        <div style="height:8px;background:#ddd6fe;border-radius:6px;width:90%;"></div>
        <div style="height:8px;background:#ddd6fe;border-radius:6px;width:55%;"></div>
      </div>
    </div>`;
}

function _renderSlotError(slotEl, message) {
  const resultEl = slotEl.querySelector('.buy-slot-result');
  if (!resultEl) return;
  resultEl.style.display = 'block';
  resultEl.innerHTML = `
    <div style="margin-top:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px;font-size:12px;color:#7f1d1d;">
      ${esc(message)}
    </div>`;
}

export async function analyzeBuy(rawTicker, slotIndex) {
  const ticker = String(rawTicker || '').trim().toUpperCase();
  const slotEl = document.getElementById(`buy-slot-${slotIndex}`);
  if (!slotEl) return;

  if (!ticker) { toast('Escribe un símbolo. Ej: AAPL'); return; }
  if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker)) { toast('Símbolo inválido. Ej: AAPL, VOO, BRK-B'); return; }
  if (Store.history.length < 1) { toast('Registra al menos una sesión antes de usar el análisis de compra.'); return; }

  const inputEl = slotEl.querySelector('.buy-ticker-input');
  if (inputEl) inputEl.value = ticker;

  const cache = _slotCache(ticker);
  const cached = cache.get();
  if (cached) {
    _renderResult(slotEl, ticker, cached.marketData, cached.analysis);
    _saveSlot(slotIndex, ticker);
    return;
  }

  _renderSlotLoading(slotEl, ticker);

  try {
    const marketData = await _fetchMarketData(ticker);
    if (!marketData || marketData.error) {
      _renderSlotError(slotEl, `No se encontraron datos para "${esc(ticker)}". Verifica el símbolo exacto (ej: AAPL, BRK-B).`);
      return;
    }

    const portfolio = _buildPortfolioContext(ticker);
    const analysis = await _fetchBuyAnalysis(ticker, marketData, portfolio);

    if (analysis.error) {
      _renderSlotError(slotEl, `Error en análisis IA: ${esc(analysis.error)}`);
      return;
    }

    cache.set({ marketData, analysis });
    _saveSlot(slotIndex, ticker);
    _renderResult(slotEl, ticker, marketData, analysis);
  } catch (err) {
    _renderSlotError(slotEl, `Error al analizar: ${esc(err.message)}`);
  }
}

export function clearBuySlot(slotIndex) {
  const slotEl = document.getElementById(`buy-slot-${slotIndex}`);
  if (!slotEl) return;

  const saved = _getSavedSlots();
  const ticker = saved[slotIndex];
  if (ticker) _slotCache(ticker).del();
  _saveSlot(slotIndex, null);

  const inputEl = slotEl.querySelector('.buy-ticker-input');
  if (inputEl) inputEl.value = '';
  const resultEl = slotEl.querySelector('.buy-slot-result');
  if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
}

export function loadBuySlots() {
  const slots = _getSavedSlots();
  Object.entries(slots).forEach(([idx, ticker]) => {
    if (!ticker) return;
    const slotEl = document.getElementById(`buy-slot-${idx}`);
    if (!slotEl) return;
    const inputEl = slotEl.querySelector('.buy-ticker-input');
    if (inputEl) inputEl.value = ticker;
    const cached = _slotCache(ticker).get();
    if (cached) _renderResult(slotEl, ticker, cached.marketData, cached.analysis);
  });
}

function _buildSuggestContext() {
  const cur = Store.cur();
  return {
    valorActual:    cur?.valor_total_usd ?? null,
    riskScore:      Learn.s.riskScore,
    sesiones:       Store.history.length,
    currentTickers: getAllAssets().map(a => a.ticker),
    dominantSector: _dominantSector(),
  };
}

export async function autoRecommend() {
  const saved = _getSavedSlots();
  // Both slots already have data → just restore from cache
  if (saved[0] && saved[1]) { loadBuySlots(); return; }
  // Need at least 1 session to personalize
  if (Store.history.length < 1) return;

  // Show loading on empty slots
  for (let i = 0; i < 2; i++) {
    if (!saved[i]) {
      const slotEl = document.getElementById(`buy-slot-${i}`);
      if (slotEl) _renderSlotLoading(slotEl, 'IA buscando recomendaciones…');
    }
  }

  try {
    const { data: { session } } = await db.auth.getSession();
    const res = await fetch(`${EDGE_BASE}/ai-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ mode: 'suggest', portfolio: _buildSuggestContext() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { tickers } = await res.json();
    if (!Array.isArray(tickers) || !tickers.length) throw new Error('No tickers returned');

    let slotIdx = 0;
    for (const ticker of tickers.slice(0, 2)) {
      if (saved[slotIdx]) { slotIdx++; continue; }
      await analyzeBuy(ticker, slotIdx);
      slotIdx++;
    }
  } catch {
    // Silent fail: clear loading state on empty slots
    for (let i = 0; i < 2; i++) {
      if (!saved[i]) {
        const slotEl = document.getElementById(`buy-slot-${i}`);
        const resultEl = slotEl?.querySelector('.buy-slot-result');
        if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
      }
    }
  }
}

export function refreshBuyRecommendations() {
  clearBuySlot(0);
  clearBuySlot(1);
  autoRecommend();
}

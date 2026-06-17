import { ASSETS, ASSET_META, EDGE_BASE } from './config.js';
import { toast, esc } from './utils.js';
import { db } from './auth.js';

const safeUrl = url => /^https?:\/\//.test(url ?? '') ? url : '#';

// Map internal ticker keys → Yahoo Finance symbols (e.g. VISA → V)
const _yfTickers  = ASSETS.map(a => ASSET_META[a].yfTicker ?? a);
const _reverseMap = Object.fromEntries(ASSETS.map(a => [ASSET_META[a].yfTicker ?? a, a]));

export async function fetchMarketData() {
  const loadingEl  = document.getElementById('market-loading');
  const gridEl     = document.getElementById('market-grid');
  const newsEl     = document.getElementById('market-news');
  const newsListEl = document.getElementById('news-list');
  if (!gridEl) return;
  if (loadingEl) loadingEl.style.display = 'block';
  gridEl.innerHTML = '';

  try {
    const { data: { session } } = await db.auth.getSession();
    const res = await fetch(`${EDGE_BASE}/market-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ tickers: _yfTickers }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw   = await res.json();
    // Restore original ticker keys (e.g. V → VISA)
    const items = raw.map(item => ({ ...item, ticker: _reverseMap[item.ticker] ?? item.ticker }));
    if (loadingEl) loadingEl.style.display = 'none';

    gridEl.innerHTML = items.map(item => {
      if (item.error) return `<div style="background:#fafaf9;border:1px solid var(--border);border-radius:10px;padding:12px;opacity:.5;"><div style="font-weight:700;font-size:13px;">${item.ticker}</div><div style="font-size:11px;color:var(--text-3);">Sin datos</div></div>`;
      const chgColor = (item.changePercent ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)';
      const chgSign  = (item.changePercent ?? 0) >= 0 ? '+' : '';
      const ratingCfg = { 'COMPRAR':'#059669', 'MANTENER':'#d97706', 'VENDER':'#dc2626' };
      const ratingColor = ratingCfg[item.analystRating ?? ''] ?? '#a8a29e';
      let perDot = '';
      if (item.pe) {
        const dotColor = item.pe < 18 ? '#10b981' : item.pe > 25 ? '#dc2626' : '#f59e0b';
        perDot = `<span style="width:7px;height:7px;border-radius:50%;background:${dotColor};display:inline-block;margin-right:3px;"></span>`;
      }
      return `<div style="background:#fafaf9;border:1px solid var(--border);border-radius:10px;padding:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px;">
          <div><div style="font-weight:700;font-size:13px;">${esc(item.ticker)}</div><div style="font-size:10px;color:var(--text-3);">${esc((item.name??'').split(' ').slice(0,3).join(' '))}</div></div>
          ${item.analystRating ? `<span style="font-size:10px;font-weight:700;color:${ratingColor};background:${ratingColor}18;padding:2px 6px;border-radius:20px;">${item.analystRating}</span>` : ''}
        </div>
        <div class="mono" style="font-size:18px;font-weight:700;">$${item.currentPrice?.toFixed(2) ?? 'N/D'}</div>
        <div class="mono" style="font-size:11px;color:${chgColor};margin-top:2px;">${chgSign}${item.changePercent?.toFixed(2) ?? '—'}% hoy</div>
        ${item.pe ? `<div style="font-size:10px;color:var(--text-2);margin-top:5px;">${perDot}PER ${item.pe.toFixed(1)}x</div>` : ''}
        ${item.week52High ? `<div style="font-size:10px;color:var(--text-3);margin-top:2px;">52s: $${item.week52Low?.toFixed(0)}–$${item.week52High?.toFixed(0)}</div>` : ''}
      </div>`;
    }).join('');

    const newsItems = items.filter(i => i.latestNews);
    if (newsItems.length && newsEl && newsListEl) {
      newsEl.style.display = 'block';
      newsListEl.innerHTML = newsItems.map(i =>
        `<a href="${safeUrl(i.latestNews.url)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:flex-start;gap:8px;text-decoration:none;">
          <span style="flex-shrink:0;font-size:11px;font-weight:700;background:var(--primary-light);color:var(--primary);padding:2px 6px;border-radius:4px;">${esc(i.ticker)}</span>
          <span style="font-size:12px;color:var(--text-2);line-height:1.5;">${esc(i.latestNews.title)}</span>
        </a>`
      ).join('');
    }

    items.forEach(item => {
      const inp = document.getElementById(`per-inp-${item.ticker}`);
      if (inp && item.pe && !inp.value) inp.value = item.pe.toFixed(1);
    });

    toast('✓ Precios actualizados');
  } catch (err) {
    console.error('[market-data]', err);
    if (loadingEl) {
      loadingEl.style.display = 'block';
      const msg = err?.message ?? String(err);
      if (msg.includes('401')) {
        loadingEl.textContent = '⚠️ Error 401 — sesión no válida. Recarga la página.';
      } else if (msg.includes('404') || msg.includes('Failed to fetch')) {
        loadingEl.textContent = '⚠️ Edge Function no desplegada. Ejecuta: supabase functions deploy market-data';
      } else {
        loadingEl.textContent = `⚠️ Error al obtener precios: ${msg}`;
      }
    }
  }
}

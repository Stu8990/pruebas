import { ASSETS, ASSET_META } from './config.js';
import { getAllAssets, getCustomAssets } from './assets.js';
import { Store } from './store.js';
import { Learn } from './learn.js';
import { Charts } from './charts.js';
import { pct, pp, $f, set, val, shortLabel, esc } from './utils.js';
import { getPositions, getAvgPrice, getTotalShares, hasPositions } from './positions.js';
import { priceCache } from './prices.js';

export const UI = {
  all() {
    const cur = Store.cur(), prv = Store.prev();
    Learn.train(Store.history);
    this.selector(); this.history();

    const marketCard = document.getElementById('market-prices-card');
    const emptyState = document.getElementById('portfolio-empty-state');

    if (!cur) {
      document.getElementById('welcome-banner').style.display = 'block';
      // No sessions: show empty state on portfolio page unless user already has positions
      const showPrices = hasPositions();
      if (marketCard) marketCard.style.display = showPrices ? '' : 'none';
      if (emptyState) emptyState.style.display = showPrices ? 'none' : 'block';
      return;
    }
    if (marketCard) marketCard.style.display = '';
    if (emptyState) emptyState.style.display = 'none';
    this.kpis(cur, prv); this.sidebar(cur, prv);
    this.assetTable(cur, prv); this.recs(cur, prv);
    this.pulse(); this.insight(cur, prv);
    this.journey(); this.profile();
    this.perMyAssets();
    Charts.value(); Charts.returns(); Charts.sector();
  },

  kpis(cur, prv) {
    const delta = prv ? ((cur.valor_total_usd - prv.valor_total_usd) / prv.valor_total_usd) * 100 : null;
    const tech  = Store.avg(cur, ['NVDA','MSFT','AMZN']);
    const sorted = ASSETS.map(a => ({ a, v: cur.rendimientos[a] })).filter(x => x.v !== null && x.v !== undefined).sort((x,y) => y.v - x.v);
    set('kpi-value', $f.format(cur.valor_total_usd));
    const de = document.getElementById('kpi-delta');
    if (de) { de.textContent = delta === null ? 'N/D' : pct(delta); de.style.color = delta === null || delta >= 0 ? 'var(--success)' : 'var(--danger)'; }
    set('kpi-best', sorted[0] ? `${ASSET_META[sorted[0].a]?.full} ${pct(sorted[0].v)}` : '—');
    set('kpi-tech', pct(tech));
    set('date-badge', `Sesión: ${cur.fecha}`);
  },

  sidebar(cur, prv) {
    const delta = prv ? ((cur.valor_total_usd - prv.valor_total_usd) / prv.valor_total_usd) * 100 : null;
    set('sb-value', $f.format(cur.valor_total_usd));
    const el = document.getElementById('sb-delta');
    if (el) { el.textContent = delta === null ? '' : pct(delta) + ' hoy'; el.style.color = delta === null || delta >= 0 ? '#34d399' : '#f87171'; }
    const streakEl = document.getElementById('sb-streak');
    if (streakEl) {
      const s = _calcStreak(Store.history);
      streakEl.textContent = s >= 5 ? `📅 ${s} días registrando · ¡Sigue así!` : s > 1 ? `📅 ${s} días registrando` : '';
    }
  },

  selector() {
    const sel = document.getElementById('record-sel'); if (!sel) return;
    sel.innerHTML = Store.history.map((r,i) =>
      `<option value="${i}"${i===Store.idx?' selected':''}>${shortLabel(r, i, Store.history)} — ${esc(r.fase.slice(0,28))}${r.fase.length>28?'…':''}</option>`
    ).join('');
  },

  assetTable(cur, prv) {
    const tb = document.getElementById('asset-table'); if (!tb) return;
    tb.innerHTML = ASSETS.map(a => {
      const v = cur.rendimientos[a], d = Store.delta(a, cur, prv);
      const [lbl, cls] = this._status(v, d);
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:7px;">
          <div style="width:7px;height:7px;border-radius:50%;background:${ASSET_META[a].color};"></div>
          <div><div style="font-weight:700;font-size:13px;">${a}</div><div style="font-size:10px;color:var(--text-3);">${ASSET_META[a].full}</div></div>
        </div></td>
        <td style="color:var(--text-3);font-size:11px;">${ASSET_META[a].role}</td>
        <td class="mono" style="font-weight:700;color:${(v!==null&&v>=0)?'var(--success)':'var(--danger)'};">${pct(v)}</td>
        <td class="mono" style="font-size:12px;color:${d===null?'#a8a29e':d>=0?'#3b82f6':'var(--danger)'};">${pp(d)}</td>
        <td><span class="badge ${cls}">${lbl}</span></td>
      </tr>`;
    }).join('');
  },

  _status(v, d) {
    if (v === null || v === undefined) return ['Sin dato','b-neu'];
    if (d !== null && d >  1.5) return ['Subiendo','b-ok'];
    if (d !== null && d < -1.5) return ['Bajando','b-bad'];
    if (v > 15) return ['Lider','b-amb'];
    if (v < -5) return ['Alerta','b-bad'];
    return ['Estable','b-neu'];
  },

  recs(cur, prv) {
    const el = document.getElementById('recommendations'); if (!el) return;
    el.innerHTML = Learn.recommendations(cur, prv).map(r =>
      `<div class="rec2 rec2-${r.type}">
        <div class="rec2-bar"></div>
        <div class="rec2-body">
          <div class="rec2-head">
            <div class="rec2-icon">${r.icon}</div>
            <div class="rec2-meta">
              <div class="rec2-title">${r.title}</div>
              <span class="rec2-conf-pill">✦ ${r.conf.toFixed(0)}% confianza</span>
            </div>
          </div>
          <p class="rec2-text">${r.body}</p>
          <div class="rec2-footer">
            <div class="cbar"><div class="cbar-fill" style="width:${r.conf}%;"></div></div>
          </div>
        </div>
      </div>`
    ).join('');
  },

  pulse() {
    const el = document.getElementById('pulse-cards'); if (!el) return;
    const d  = document.getElementById('pulse-date');
    if (d) d.textContent = new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
    el.innerHTML = Learn.pulse().map(p =>
      `<div class="pulse-card pulse-card--${p.up ? 'up' : 'down'}">
        <div class="pulse-card__label">${p.label}</div>
        <div class="pulse-card__value mono">${p.value}</div>
        <div class="pulse-card__trend">${p.up ? '▲' : '▼'}</div>
        <div class="pulse-card__desc">${p.desc}</div>
      </div>`
    ).join('');
  },

  insight(cur, prv) {
    set('daily-insight', Learn.insight(cur, prv));
    const f = document.getElementById('conf-fill'), v = document.getElementById('conf-val');
    if (f) f.style.width = Learn.s.confidence + '%';
    if (v) v.textContent  = Learn.s.confidence.toFixed(0) + '%';
  },

  history() {
    const hh = document.getElementById('hist-head'), hb = document.getElementById('hist-body'), hc = document.getElementById('hist-count');
    if (!hh || !hb) return;
    if (hc) hc.textContent = Store.history.length + ' sesiones';
    hh.innerHTML = ['Fecha','Descripción','Valor USD',...ASSETS].map(h => `<th>${h}</th>`).join('');
    hb.innerHTML = Store.history.map((r,i) =>
      `<tr${i===Store.idx?' style="background:#f5f3ff;"':''}>
        <td style="font-weight:600;color:var(--primary);white-space:nowrap;" class="mono">${shortLabel(r, i, Store.history)}</td>
        <td style="color:var(--text-2);font-size:11px;max-width:180px;">${esc(r.fase)}</td>
        <td class="mono" style="font-weight:600;color:var(--success);">${$f.format(r.valor_total_usd)}</td>
        ${ASSETS.map(a => `<td class="mono" style="color:${r.rendimientos[a]>=0?'var(--success)':'var(--danger)'};font-size:11px;">${pct(r.rendimientos[a])}</td>`).join('')}
      </tr>`
    ).join('');
  },

  journey() {
    const el = document.getElementById('growth-journey'); if (!el) return;
    const hist = Store.history;
    if (!hist.length) { el.innerHTML = ''; return; }

    // Parse "YYYY-MM-DD" in LOCAL time (avoids UTC timezone offset shifting the date)
    const parseLocal = str => { const [y,m,d] = str.split('-').map(Number); return new Date(y, m-1, d); };

    // Monday key as local "YYYY-MM-DD" — no toISOString() to avoid UTC drift
    const mondayKey = dateStr => {
      const d = parseLocal(dateStr);
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };

    // Sort chronologically, then group by week (last session of each week wins)
    const sorted = [...hist].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const byWeek = new Map();
    sorted.forEach(s => byWeek.set(mondayKey(s.fecha), s));

    const weeks = [...byWeek.values()].slice(-6);

    const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const dateLabel = dateStr => { const [,m,d] = dateStr.split('-').map(Number); return `${d} ${MONTHS[m-1]}`; };

    el.innerHTML = weeks.map((s, i) => {
      const prev    = weeks[i - 1];
      const isFirst = i === 0;
      const isLast  = i === weeks.length - 1;

      const weekPct  = prev ? ((s.valor_total_usd - prev.valor_total_usd) / prev.valor_total_usd) * 100 : null;
      const up       = weekPct === null || weekPct >= 0;
      const chgColor = weekPct === null ? 'var(--text-3)' : up ? 'var(--success)' : 'var(--danger)';
      const chgText  = weekPct !== null ? `${weekPct >= 0 ? '+' : ''}${weekPct.toFixed(1)}%` : '';

      const emoji       = isFirst ? '🌱' : isLast ? '🎯' : up ? '↑' : '↓';
      const borderColor = isFirst ? '#10b981' : isLast ? '#7c3aed' : up ? '#10b981' : '#dc2626';
      const bg          = isFirst ? '#ecfdf5' : isLast ? '#f5f3ff' : up ? '#f0fdf4' : '#fef2f2';
      const label       = isLast ? 'Reciente' : isFirst ? `${dateLabel(s.fecha)} (inicio)` : dateLabel(s.fecha);

      return `<div style="display:flex;align-items:center;flex-shrink:0;">
        <div class="journey-step">
          <div style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;font-size:14px;background:${bg};border:2px solid ${borderColor};">${emoji}</div>
          <div class="mono" style="font-size:11px;font-weight:700;">${$f.format(s.valor_total_usd)}</div>
          <div style="font-size:10px;color:var(--text-3);white-space:nowrap;">${label}</div>
          ${chgText ? `<div class="mono" style="font-size:10px;font-weight:700;color:${chgColor};margin-top:1px;">${chgText}</div>` : ''}
        </div>
        ${i < weeks.length - 1 ? '<div class="journey-connector"></div>' : ''}
      </div>`;
    }).join('');
  },

  profile() {
    const el = document.getElementById('learning-profile'); if (!el) return;
    const s = Learn.s;
    const riskLbl   = s.riskScore > 0.7 ? 'Activo' : s.riskScore > 0.5 ? 'Moderado' : 'Conservador';
    const riskColor = s.riskScore > 0.7 ? 'var(--danger)' : s.riskScore > 0.5 ? 'var(--warning)' : 'var(--success)';
    const riskDesc  = s.riskScore > 0.7 ? 'No te asustas con caídas' : s.riskScore > 0.5 ? 'Equilibras riesgo y tranquilidad' : 'Prefieres seguridad sobre rendimiento';
    const top = Object.entries(s.assetScores).sort(([,a],[,b]) => b.score - a.score)[0];
    const n = Store.history.length;
    const posCount = s.phases.filter(p=>p.type==='up').length;
    const negCount = s.phases.filter(p=>p.type==='down').length;
    const cards = [
      { icon:'🧠', lbl:'Tu perfil de inversor', val:riskLbl, color:riskColor, desc:riskDesc,
        tip: s.riskScore > 0.7 ? 'Ventaja: puedes mantener posiciones en caídas sin pánico.' :
             s.riskScore > 0.5 ? 'Consejo: combina acciones growth con ETFs como VOO para equilibrar.' :
             'Consejo: prioriza ETFs diversificados; reduce acciones individuales volátiles.' },
      { icon:'🏆', lbl:'Tu acción más rentable', val:top ? ASSET_META[top[0]]?.full || top[0] : '—', color:top ? ASSET_META[top[0]]?.color : '#a8a29e', desc:top ? `Retorno prom. ${pct(top[1].avg)}` : 'Registra más sesiones',
        tip: top ? 'Analiza qué sector es este activo para buscar activos parecidos.' : 'Aparecerá cuando tengas más de 3 sesiones registradas.' },
      { icon:'💰', lbl:'Aumentos de capital', val:s.injections.length, color:'var(--primary)', desc:'Inyecciones detectadas por el algoritmo',
        tip: s.injections.length === 0 ? 'Tip: agregar capital en caídas baja tu precio promedio — estrategia DCA.' : 'Bien. Inyectar capital en caídas mejora tu rendimiento a largo plazo.' },
      { icon:'📅', lbl:'Sesiones analizadas', val:n, color:'#8b5cf6', desc:`${posCount} positivas · ${negCount} negativas`,
        tip: n < 10 ? 'Necesitas ~20 sesiones para análisis confiables. ¡Sigue registrando!' :
             n < 20 ? 'Buen avance. Las predicciones mejoran con cada sesión.' :
             'Suficientes datos. El algoritmo ya detecta tus patrones de inversión.' },
    ];
    el.innerHTML = cards.map(c =>
      `<div class="profile-stat">
        <div class="profile-stat__icon">${c.icon}</div>
        <div class="profile-stat__label">${c.lbl}</div>
        <div class="profile-stat__val" style="color:${c.color};">${c.val}</div>
        <div class="profile-stat__desc">${c.desc}</div>
        <div class="profile-stat__tip">${c.tip}</div>
      </div>`
    ).join('');
  },

  returnInputs() {
    const el = document.getElementById('return-inputs'); if (!el) return;
    const all = getAllAssets();
    el.innerHTML = all.map(a =>
      `<label data-asset="${esc(a.ticker)}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:5px;font-size:11px;font-weight:600;color:var(--text-2);margin-bottom:5px;">
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:7px;height:7px;border-radius:50%;background:${a.color};flex-shrink:0;"></div>
            ${esc(a.ticker)} — ${esc(a.full)}
          </div>
          ${a.isCustom ? `<button type="button" onclick="removeCustomAsset('${esc(a.ticker)}')" title="Eliminar" style="background:none;border:none;cursor:pointer;color:#a8a29e;font-size:13px;padding:0;line-height:1;">✕</button>` : ''}
        </div>
        <input id="inp-${esc(a.ticker)}" type="number" step="0.01" placeholder="0.00" class="rend-inp" oninput="autoDesc();this.className='rend-inp'+(+this.value>0?' rend-pos':+this.value<0?' rend-neg':'')" />
      </label>`
    ).join('') +
    `<button type="button" onclick="openAddAsset()" class="btn btn-ghost btn-sm" style="width:100%;margin-top:6px;border-style:dashed;color:var(--primary);">+ Agregar activo o ETF</button>`;
  },

  prefill() {
    const r = Store.history.at(-1); if (!r) return;
    val('f-fecha', r.fecha); val('f-valor', r.valor_total_usd.toFixed(2)); val('f-fase', '');
    getAllAssets().forEach(a => val('inp-' + a.ticker, r.rendimientos[a.ticker] ?? ''));
  },

  perMyAssets() {
    const el = document.getElementById('per-my-assets'); if (!el) return;

    // Build ticker list from user's actual data (sessions + positions)
    const allMetaMap  = Object.fromEntries(getAllAssets().map(a => [a.ticker, a]));
    const sessTickers = Object.keys(Store.cur()?.rendimientos ?? {});
    const posTickers  = Object.keys(getPositions());
    const myTickers   = [...new Set([...sessTickers, ...posTickers])];

    if (!myTickers.length) {
      el.innerHTML = '<div style="font-size:13px;color:var(--text-3);padding:8px 4px;">Agrega posiciones o registra tu portafolio para ver el PER de tus activos.</div>';
      return;
    }

    // Preserve user-entered values before re-render
    const saved = {};
    myTickers.forEach(t => { const inp = document.getElementById('per-inp-' + t); if (inp?.value) saved[t] = inp.value; });

    el.innerHTML = myTickers.map(ticker => {
      const meta = allMetaMap[ticker] ?? { full: ticker, role: '', color: '#a8a29e' };
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--border);border-radius:9px;background:#fafaf9;">
        <div style="width:8px;height:8px;border-radius:50%;background:${meta.color};flex-shrink:0;"></div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;">${esc(ticker)} — ${esc(meta.full)}</div>
          <div style="font-size:11px;color:var(--text-3);">${esc(meta.role ?? '')}</div>
        </div>
        <input id="per-inp-${ticker}" type="number" step="0.1" placeholder="—" readonly style="width:80px;font-size:13px;padding:6px 8px;background:#f5f5f4;color:var(--text-2);cursor:default;border-color:#e7e5e4;" />
      </div>`;
    }).join('');

    // Restore saved values
    myTickers.forEach(t => { if (saved[t]) { const inp = document.getElementById('per-inp-' + t); if (inp) inp.value = saved[t]; } });
  },
};

export function kpiLive(data) {
  const dotEl    = document.getElementById('kpi-live-dot');
  const statusEl = document.getElementById('kpi-live-status');
  const bannerEl = document.getElementById('kpi-unsync-banner');
  const diffEl   = document.getElementById('kpi-unsync-diff');

  if (!data) {
    if (dotEl) { dotEl.style.background = 'var(--text-3)'; dotEl.style.animation = ''; }
    if (statusEl) { statusEl.textContent = 'Capital en USD'; statusEl.style.color = 'var(--text-3)'; }
    if (bannerEl) bannerEl.style.display = 'none';
    return;
  }

  const { total, rendimientosCalc, timestamp } = data;
  const saved = Store.cur()?.valor_total_usd ?? 0;

  // kpi-value — live total
  const kpiEl = document.getElementById('kpi-value');
  if (kpiEl) kpiEl.textContent = `$${total.toFixed(2)}`;

  // kpi-delta — live change vs yesterday's record (not today's, which would be near-zero)
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const baseline = Store.history.slice().reverse().find(r => r.fecha !== todayStr);
  if (baseline) {
    const deltaPct = ((total - baseline.valor_total_usd) / baseline.valor_total_usd) * 100;
    const sign     = deltaPct >= 0 ? '+' : '';
    const color    = deltaPct >= 0 ? 'var(--success)' : 'var(--danger)';
    const deltaEl  = document.getElementById('kpi-delta');
    if (deltaEl) { deltaEl.textContent = `${sign}${deltaPct.toFixed(2)}%`; deltaEl.style.color = color; }
  }

  // kpi-best — asset with highest live rendimiento
  if (rendimientosCalc) {
    const entries = Object.entries(rendimientosCalc).filter(([, v]) => v != null);
    if (entries.length) {
      const [bestTicker, bestVal] = entries.reduce((a, b) => b[1] > a[1] ? b : a);
      const bestEl = document.getElementById('kpi-best');
      if (bestEl) bestEl.textContent = `${bestTicker} ${bestVal >= 0 ? '+' : ''}${bestVal.toFixed(2)}%`;
    }
  }

  // kpi-tech — live average of NVDA / MSFT / AMZN
  if (rendimientosCalc) {
    const techVals = ['NVDA', 'MSFT', 'AMZN'].map(t => rendimientosCalc[t]).filter(v => v != null);
    if (techVals.length) {
      const avg    = techVals.reduce((a, b) => a + b, 0) / techVals.length;
      const techEl = document.getElementById('kpi-tech');
      if (techEl) { techEl.textContent = `${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`; techEl.style.color = avg >= 0 ? 'var(--success)' : 'var(--danger)'; }
    }
  }

  // dot + status
  if (dotEl) { dotEl.style.background = '#10b981'; dotEl.style.animation = 'pulse-dot 2s ease infinite'; }
  if (statusEl) {
    const mins = Math.round((Date.now() - timestamp) / 60000);
    statusEl.textContent = mins === 0 ? 'en vivo · ahora mismo' : `en vivo · hace ${mins} min`;
    statusEl.style.color = '#10b981';
  }

  // unsync banner — show whenever today has no saved record
  if (bannerEl && diffEl) {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const hasTodayRecord = Store.history.some(r => r.fecha === today);
    if (!hasTodayRecord) {
      const diff = total - saved;
      const sign = diff >= 0 ? '+' : '';
      diffEl.textContent = saved > 0
        ? `En vivo: $${total.toFixed(2)} · último guardado: $${saved.toFixed(2)} (${sign}$${diff.toFixed(2)})`
        : `En vivo: $${total.toFixed(2)} · sin registro guardado hoy`;
      bannerEl.style.display = 'block';
    } else {
      bannerEl.style.display = 'none';
    }
  }
}

export function renderPositionsPanel() {
  const el = document.getElementById('positions-list');
  if (!el) return;

  const pos = getPositions();
  const tickers = Object.keys(pos);

  const hintEl = document.getElementById('qr-no-positions-hint');
  if (!tickers.length) {
    el.innerHTML = `<p style="font-size:12px;color:var(--text-3);padding:10px 0;">Sin posiciones registradas. Agrega tu primera compra para activar el registro rápido.</p>`;
    if (hintEl) hintEl.style.display = 'block';
    return;
  }
  if (hintEl) hintEl.style.display = 'none';

  const allAssets = getAllAssets();

  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">${
    tickers.map(ticker => {
      const avg    = getAvgPrice(ticker);
      const shares = getTotalShares(ticker);
      const buys   = pos[ticker].purchases;
      const meta   = allAssets.find(a => a.ticker === ticker);
      const color  = meta?.color || '#7c3aed';
      const full   = meta?.full  || ticker;

      const costBasis = shares * (avg ?? 0);
      const mktPrice  = priceCache.get(ticker) ?? null;
      const curValue  = mktPrice != null ? shares * mktPrice : null;
      const gainUSD   = curValue != null ? curValue - costBasis : null;
      const gainPct   = (mktPrice && avg) ? ((mktPrice - avg) / avg * 100) : null;

      const liveColor = gainPct == null ? 'var(--text-3)' : gainPct >= 0 ? 'var(--success)' : 'var(--danger)';

      let alertBadge = '';
      if (gainPct != null && gainPct <= -5)  alertBadge = `<span class="pos-alert pos-alert--warn">⚠ Bajo presión</span>`;
      if (gainPct != null && gainPct >= 15)  alertBadge = `<span class="pos-alert pos-alert--good">↑ Considera tomar ganancia</span>`;

      const valueHtml = gainUSD != null && gainPct != null
        ? `<div class="pos-card__pnl" style="color:${liveColor};">${gainUSD >= 0 ? '+' : ''}$${gainUSD.toFixed(2)}</div>
           <div class="pos-card__live" style="color:${liveColor};">$${curValue.toFixed(2)} · ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%</div>`
        : `<div class="pos-card__live" style="color:var(--text-3);">$${costBasis.toFixed(2)} invertido</div>`;

      const chips = buys.map((b, i) =>
        `<div class="pos-buy-chip">
          <span>${b.shares.toFixed(4)} <span style="color:var(--text-3);">@</span> <strong>$${(+b.price).toFixed(2)}</strong></span>
          <button onclick="removePurchaseEntry('${esc(ticker)}',${i})" title="Eliminar">✕</button>
        </div>`
      ).join('');

      const cardClass = gainPct != null && gainPct <= -5 ? 'pos-card pos-card--warn'
                      : gainPct != null && gainPct >= 15 ? 'pos-card pos-card--good'
                      : 'pos-card';

      return `<div class="${cardClass}" style="border-left:3px solid ${color};">
        ${alertBadge ? `<div class="pos-card__alert-row">${alertBadge}</div>` : ''}
        <div class="pos-card__head">
          <div class="pos-card__dot" style="background:${color};"></div>
          <div class="pos-card__info">
            <div class="pos-card__ticker">${esc(ticker)}</div>
            <div class="pos-card__name">${esc(full)}</div>
          </div>
          <div class="pos-card__stats">
            ${valueHtml}
            <div class="pos-card__avg">avg $${avg?.toFixed(2) ?? '—'} · ${shares.toFixed(4)} acc.</div>
          </div>
        </div>
        <div class="pos-card__buys">${chips}</div>
      </div>`;
    }).join('')
  }</div>`;
}

export function renderPortfolioKPI() {
  const el = document.getElementById('portfolio-kpi');
  if (!el) return;

  const pos = getPositions();
  const tickers = Object.keys(pos);
  if (!tickers.length) { el.innerHTML = ''; return; }

  let totalInvested = 0, totalValue = 0, hasLive = false;
  tickers.forEach(ticker => {
    const avg    = getAvgPrice(ticker);
    const shares = getTotalShares(ticker);
    totalInvested += shares * (avg ?? 0);
    const livePrice = priceCache.get(ticker);
    if (livePrice != null) { totalValue += shares * livePrice; hasLive = true; }
  });

  if (!hasLive || totalInvested === 0) { el.innerHTML = ''; return; }

  const gainUSD = totalValue - totalInvested;
  const gainPct = (gainUSD / totalInvested) * 100;
  const color   = gainUSD >= 0 ? 'var(--success)' : 'var(--danger)';
  const sign    = gainUSD >= 0 ? '+' : '';

  el.innerHTML = `
    <div class="portfolio-kpi-banner">
      <div class="pkpi-item">
        <div class="pkpi-label">Invertido</div>
        <div class="pkpi-value mono">$${totalInvested.toFixed(2)}</div>
      </div>
      <div class="pkpi-sep">→</div>
      <div class="pkpi-item">
        <div class="pkpi-label">Valor actual</div>
        <div class="pkpi-value mono">$${totalValue.toFixed(2)}</div>
      </div>
      <div class="pkpi-sep" style="color:${color};font-size:16px;font-weight:800;">${gainUSD >= 0 ? '↑' : '↓'}</div>
      <div class="pkpi-item">
        <div class="pkpi-label" style="color:${color};">P&amp;L Total</div>
        <div class="pkpi-value mono" style="color:${color};">${sign}$${Math.abs(gainUSD).toFixed(2)}</div>
        <div class="pkpi-pct" style="color:${color};">${sign}${gainPct.toFixed(1)}%</div>
      </div>
    </div>`;
}

// ── Setup checklist ───────────────────────────────────
const SETUP_DONE_KEY = 'investsmart-setup-done';

export function renderSetupChecklist() {
  const el = document.getElementById('setup-checklist');
  if (!el) return;
  if (localStorage.getItem(SETUP_DONE_KEY)) { el.innerHTML = ''; return; }

  const hasPosns  = hasPositions();
  const hasRecord = Store.history.length > 0;

  if (hasPosns && hasRecord) {
    localStorage.setItem(SETUP_DONE_KEY, '1');
    el.innerHTML = '';
    return;
  }

  const step = (done, label, action) => `
    <div style="display:flex;align-items:center;gap:10px;padding:7px 0;">
      <div style="width:22px;height:22px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;
        background:${done ? '#d1fae5' : '#f5f3ff'};color:${done ? '#065f46' : '#7c3aed'};border:1.5px solid ${done ? '#6ee7b7' : '#ddd6fe'};">
        ${done ? '✓' : '○'}
      </div>
      <div style="flex:1;font-size:13px;color:${done ? 'var(--text-3)' : 'var(--text-1)'};${done ? 'text-decoration:line-through;' : ''}">${label}</div>
      ${!done && action ? `<button onclick="${action}" class="btn btn-primary btn-sm" style="font-size:11px;padding:4px 10px;flex-shrink:0;">${action.includes('record') ? 'Ir →' : 'Agregar →'}</button>` : ''}
    </div>`;

  el.innerHTML = `
    <div style="background:#faf5ff;border:1.5px solid #ddd6fe;border-radius:12px;padding:14px 16px;margin-bottom:4px;">
      <div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:10px;">🚀 Primeros pasos</div>
      ${step(true,  'Cuenta creada', '')}
      <div style="height:1px;background:#ede9fe;margin:2px 0;"></div>
      ${step(hasPosns,  'Agrega tus posiciones (qué acciones tienes y a qué precio)', "goTo('record')")}
      <div style="height:1px;background:#ede9fe;margin:2px 0;"></div>
      ${step(hasRecord, 'Guarda tu primer registro del día', "goTo('record')")}
    </div>`;
}

// ── Streak helper ────────────────────────────────────
function _calcStreak(history) {
  if (!history || history.length < 2) return history?.length ?? 0;
  const sorted = [...history].sort((a, b) => b.fecha.localeCompare(a.fecha));
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i-1].fecha) - new Date(sorted[i].fecha)) / 86400000;
    if (diff <= 3) streak++;
    else break;
  }
  return streak;
}

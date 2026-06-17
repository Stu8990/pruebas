import { ASSETS, ASSET_META } from './config.js';
import { getAllAssets, getCustomAssets } from './assets.js';
import { Store } from './store.js';
import { Learn } from './learn.js';
import { Charts } from './charts.js';
import { pct, pp, $f, set, val, shortLabel, esc } from './utils.js';

export const UI = {
  all() {
    const cur = Store.cur(), prv = Store.prev();
    Learn.train(Store.history);
    this.selector(); this.history();
    if (!cur) {
      document.getElementById('welcome-banner').style.display = 'block';
      return;
    }
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
    const cfg = { green:{bg:'rec-green',tc:'#065f46'}, red:{bg:'rec-red',tc:'#7f1d1d'}, blue:{bg:'rec-blue',tc:'#0c4a6e'}, amber:{bg:'rec-amber',tc:'#78350f'}, purple:{bg:'rec-purple',tc:'#4c1d95'} };
    el.innerHTML = Learn.recommendations(cur, prv).map(r => {
      const c = cfg[r.type] || cfg.blue;
      return `<div class="rec ${c.bg}"><div style="display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:18px;flex-shrink:0;">${r.icon}</span>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:${c.tc};margin-bottom:4px;">${r.title}</div>
          <p style="font-size:12px;color:${c.tc};opacity:.9;line-height:1.7;margin:0;">${r.body}</p>
          <div style="display:flex;align-items:center;gap:7px;margin-top:8px;">
            <div class="cbar" style="width:70px;"><div class="cbar-fill" style="width:${r.conf}%;"></div></div>
            <span style="font-size:10px;font-weight:600;color:var(--primary);">Confianza ${r.conf.toFixed(0)}%</span>
          </div>
        </div>
      </div></div>`;
    }).join('');
  },

  pulse() {
    const el = document.getElementById('pulse-cards'); if (!el) return;
    const d  = document.getElementById('pulse-date');
    if (d) d.textContent = new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
    el.innerHTML = Learn.pulse().map(p =>
      `<div style="background:white;border:1px solid var(--border);border-radius:10px;padding:12px;">
        <div style="font-size:10px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">${p.label}</div>
        <div class="mono" style="font-size:18px;font-weight:700;color:${p.up?'var(--success)':'var(--danger)'};">${p.value}</div>
        <div style="font-size:10px;color:var(--text-3);margin-top:3px;">${p.desc}</div>
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
    const cards = [
      { lbl:'Tu perfil de inversor',      val:riskLbl,  color:riskColor, desc:riskDesc },
      { lbl:'Tu acción más rentable',     val:top ? ASSET_META[top[0]]?.full || top[0] : '—', color:top ? ASSET_META[top[0]]?.color : '#a8a29e', desc:top ? `Retorno prom. ${pct(top[1].avg)}` : 'Registra más datos' },
      { lbl:'Veces que aumentaste capital', val:s.injections.length, color:'var(--primary)', desc:'Cada inyección mejora el algoritmo' },
      { lbl:'Sesiones analizadas',         val:Store.history.length, color:'#8b5cf6',        desc:`${s.phases.filter(p=>p.type==='up').length} positivas · ${s.phases.filter(p=>p.type==='down').length} negativas` },
    ];
    el.innerHTML = cards.map(c =>
      `<div style="background:#fafaf9;border:1px solid var(--border);border-radius:11px;padding:14px;">
        <div style="font-size:10px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">${c.lbl}</div>
        <div class="mono" style="font-size:22px;font-weight:800;color:${c.color};font-family:'Space Grotesk',sans-serif;">${c.val}</div>
        <div style="font-size:11px;color:var(--text-3);margin-top:3px;">${c.desc}</div>
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
        <input id="inp-${esc(a.ticker)}" type="number" step="0.01" placeholder="0.00" oninput="autoDesc()" />
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
    // Preserve user-entered values before re-render
    const saved = {};
    ASSETS.forEach(a => { const inp = document.getElementById('per-inp-' + a); if (inp?.value) saved[a] = inp.value; });
    el.innerHTML = ASSETS.map(a =>
      `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--border);border-radius:9px;background:#fafaf9;">
        <div style="width:8px;height:8px;border-radius:50%;background:${ASSET_META[a].color};flex-shrink:0;"></div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;">${esc(a)} — ${esc(ASSET_META[a].full)}</div>
          <div style="font-size:11px;color:var(--text-3);">${esc(ASSET_META[a].role)}</div>
        </div>
        <input id="per-inp-${a}" type="number" step="0.1" placeholder="—" readonly style="width:80px;font-size:13px;padding:6px 8px;background:#f5f5f4;color:var(--text-2);cursor:default;border-color:#e7e5e4;" />
      </div>`
    ).join('');
    // Restore saved values
    ASSETS.forEach(a => { if (saved[a]) { const inp = document.getElementById('per-inp-' + a); if (inp) inp.value = saved[a]; } });
  },
};

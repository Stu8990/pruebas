import { ASSETS, ASSET_META, SECTOR_COLORS } from './config.js';
import { Store } from './store.js';
import { Learn } from './learn.js';
import { pct, $f, shortLabel } from './utils.js';

/* global Chart */

export const Charts = {
  vc: null, rc: null, sc: null,

  _opts(unit) {
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { labels: { color:'#78716c', boxWidth:9, usePointStyle:true, pointStyle:'circle', font:{ size:11, family:'Inter' } } },
        tooltip: { backgroundColor:'#1c1917', titleColor:'#fafaf9', bodyColor:'#d6d3d1', padding:11, cornerRadius:9,
          callbacks: { label: c => `${c.dataset.label}: ${unit==='usd' ? $f.format(c.parsed.y) : pct(c.parsed.y)}` } },
      },
      scales: {
        x: { ticks:{ color:'#a8a29e', font:{ size:10, family:'Inter' }, maxRotation:0, maxTicksLimit:8 }, grid:{ color:'#f5f5f4' }, border:{ color:'#e7e5e4' } },
        y: { ticks:{ color:'#a8a29e', font:{ size:10, family:'Inter' }, callback: v => unit==='usd' ? `$${v}` : `${v}%` }, grid:{ color:'#f5f5f4' }, border:{ color:'#e7e5e4' } },
      },
    };
  },

  value() {
    const ctx = document.getElementById('value-chart'); if (!ctx) return;
    if (!Store.history.length) { if (this.vc) { this.vc.destroy(); this.vc = null; } return; }
    if (this.vc) this.vc.destroy();
    const injDates = Learn.s.injections.map(i => i.date);
    const pointColors = Store.history.map((r,i) => injDates.includes(r.fecha) && Store.history.slice(0,i).filter(x=>x.fecha===r.fecha).length > 0 ? '#7c3aed' : '#3b82f6');
    const pointRadius = Store.history.map((r,i) => injDates.includes(r.fecha) && Store.history.slice(0,i).filter(x=>x.fecha===r.fecha).length > 0 ? 7 : 4);
    this.vc = new Chart(ctx, { type:'line', data: {
      labels: Store.history.map((r,i) => shortLabel(r, i, Store.history)),
      datasets: [{ label:'Valor USD', data: Store.history.map(r => r.valor_total_usd),
        borderColor:'#7c3aed', backgroundColor:'rgba(124,58,237,.07)', fill:true,
        pointRadius, pointHoverRadius:8, pointBackgroundColor:pointColors, borderWidth:2.5, tension:.4 }],
    }, options: this._opts('usd') });
  },

  returns() {
    const ctx = document.getElementById('returns-chart'); if (!ctx) return;
    if (!Store.history.length) { if (this.rc) { this.rc.destroy(); this.rc = null; } return; }
    if (this.rc) this.rc.destroy();
    this.rc = new Chart(ctx, { type:'line', data: {
      labels: Store.history.map((r,i) => shortLabel(r, i, Store.history)),
      datasets: ASSETS.map(a => ({
        label: ASSET_META[a].full, data: Store.history.map(r => r.rendimientos[a]),
        borderColor: ASSET_META[a].color, backgroundColor: ASSET_META[a].color,
        spanGaps:true, pointRadius:3, pointHoverRadius:6, borderWidth:2, tension:.35,
      })),
    }, options: this._opts('pct') });
  },

  sector() {
    const ctx = document.getElementById('sector-chart'); if (!ctx) return;
    const cur = Store.cur(); if (!cur) { if (this.sc) { this.sc.destroy(); this.sc = null; } return; }
    if (this.sc) this.sc.destroy();
    const totals = {};
    ASSETS.forEach(a => { const s = ASSET_META[a].sector; const v = Math.max(0, cur.rendimientos[a] || 0); totals[s] = (totals[s] || 0) + v; });
    const sectors = Object.keys(totals), total = Object.values(totals).reduce((s,v) => s+v, 0) || 1;
    this.sc = new Chart(ctx, { type:'doughnut', data: {
      labels: sectors,
      datasets: [{ data: sectors.map(s => totals[s]), backgroundColor: sectors.map(s => SECTOR_COLORS[s] || '#a8a29e'), borderWidth:2, borderColor:'#fff' }],
    }, options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ backgroundColor:'#1c1917', bodyColor:'#d6d3d1', padding:10, cornerRadius:9, callbacks:{ label: c => `${c.label}: ${((c.parsed/total)*100).toFixed(1)}%` } } }, cutout:'65%' } });
    const leg = document.getElementById('sector-legend');
    if (leg) leg.innerHTML = sectors.map(s =>
      `<div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:7px;"><div style="width:8px;height:8px;border-radius:50%;background:${SECTOR_COLORS[s]};"></div><span style="font-size:12px;color:var(--text-2);">${s}</span></div>
        <span style="font-size:12px;font-weight:600;">${((totals[s]/total)*100).toFixed(1)}%</span>
      </div>`
    ).join('');
  },
};

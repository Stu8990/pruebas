import { ASSETS, ASSET_META } from './config.js';
import { toast } from './utils.js';

export function perZone(per) {
  if (per < 18) return { bg:'#f0fdf4', border:'#bbf7d0', dot:'#10b981', text:'#065f46', zone:'Posiblemente barata 🟢', tip:'Precio razonable. Investiga: ¿la empresa gana dinero? ¿tiene deudas? ¿crece?' };
  if (per > 25) return { bg:'#fef2f2', border:'#fecaca', dot:'#dc2626', text:'#7f1d1d', zone:'Cara 🔴',                tip:'PER alto. Solo tiene sentido si crece muy rápido. Investiga antes de comprar más.' };
  return          { bg:'#fffbeb', border:'#fde68a', dot:'#f59e0b', text:'#78350f', zone:'Precio normal 🟡',          tip:'Ni barata ni cara. Evalúa si el negocio sigue creciendo y si tiene ventajas sobre la competencia.' };
}

export function evaluateAllPer() {
  const results = ASSETS
    .map(a => ({ a, per: parseFloat(document.getElementById('per-inp-' + a)?.value || '') }))
    .filter(x => !isNaN(x.per) && x.per > 0);
  if (!results.length) { toast('Ingresa al menos un PER para evaluar'); return; }
  const el = document.getElementById('per-my-results');
  el.style.display = 'block';
  el.innerHTML = '<div style="font-size:13px;font-weight:700;margin-bottom:10px;">Resultado de tus acciones:</div>' +
    results.map(({ a, per }) => {
      const z = perZone(per);
      return `<div class="per-row" style="background:${z.bg};border-color:${z.border};">
        <div class="per-dot" style="background:${z.dot};"></div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:${z.text};">${a} — ${ASSET_META[a].full} · PER ${per.toFixed(1)}x → ${z.zone}</div>
          <div style="font-size:12px;color:${z.text};opacity:.85;margin-top:2px;">${z.tip}</div>
        </div>
      </div>`;
    }).join('');
}

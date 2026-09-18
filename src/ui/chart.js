// Gráfico de valor en el tiempo, en SVG propio: una línea, su área y el punto
// de hoy. Sin librería: se adapta al tema con currentColor y variables CSS.

import { money, shortDate, esc } from '../format.js';

export function valueChart(points, { height = 168 } = {}) {
  if (points.length < 2) return '';
  const W = 600, H = height, padT = 12, padB = 22;
  const vals = points.map(p => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < hi * 0.01) { lo -= hi * 0.01; hi += hi * 0.01; }
  const x = i => (i / (points.length - 1)) * W;
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = `${line}L${W},${H - padB}L0,${H - padB}Z`;
  const last = points.at(-1);
  const up = last.v >= points[0].v;

  const label = `Tu dinero pasó de ${money(points[0].v)} el ${shortDate(points[0].d)} a ${money(last.v)} el ${shortDate(last.d)}.`;

  return `
    <figure class="chart ${up ? 'chart--up' : 'chart--down'}">
      <div class="chart__plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">
        <path class="chart__area" d="${area}"/>
        <path class="chart__line" d="${line}" vector-effect="non-scaling-stroke"/>
        <line class="chart__base" x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" vector-effect="non-scaling-stroke"/>
      </svg>
      <span class="chart__dot" style="left:100%;top:${((y(last.v) / H) * 100).toFixed(2)}%"></span>
      </div>
      <figcaption class="chart__axis">
        <span>${esc(shortDate(points[0].d))}</span>
        <span class="chart__range">entre ${esc(money(Math.min(...vals)))} y ${esc(money(Math.max(...vals)))}</span>
        <span>${esc(shortDate(last.d))}</span>
      </figcaption>
    </figure>`;
}

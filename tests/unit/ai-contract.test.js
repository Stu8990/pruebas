import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarize } from '../../src/core/portfolio.js';
import { planVerdicts, VERDICT_LABELS } from '../../src/core/plan.js';

// La Edge Function ai-analysis descarta veredictos cuya etiqueta no conoce. Si
// alguien cambia una etiqueta en plan.js sin actualizarla allí, la IA dejaría
// de recibir esa recomendación sin que nada falle: este test lo impide.
test('las etiquetas de veredicto del motor están permitidas en ai-analysis', () => {
  const src = readFileSync(new URL('../../supabase/functions/ai-analysis/index.ts', import.meta.url), 'utf8');
  const allowed = new Set([...src.match(/ALLOWED_ACTIONS = new Set\(\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
  const P = (sh, pr) => ({ purchases: [{ date: '2026-01-01', shares: sh, price: pr }] });
  const px = t => ({ currentPrice: 100, t });
  const cases = [
    { CSPX: P(3, 100), MSFT: P(1, 100), VISA: P(1, 100), NVDA: P(1, 100), SCHD: P(1, 100), TSLA: P(1, 100) },
    { CSPX: P(1, 100), NVDA: P(5, 100) },
  ];
  const seen = new Set();
  for (const positions of cases) {
    const market = Object.fromEntries(Object.keys(positions).map(t => [t, px(t)]));
    for (const v of Object.values(planVerdicts({ summary: summarize({ positions, market }) }))) seen.add(v.label);
  }
  assert.ok(seen.size >= 5, `sólo se generaron ${[...seen]}`);
  for (const label of VERDICT_LABELS) assert.ok(allowed.has(label), `ai-analysis no permite «${label}»`);
  for (const label of seen) assert.ok(allowed.has(label), `ai-analysis no permite «${label}»`);
});

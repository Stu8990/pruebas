import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarize } from '../../src/core/portfolio.js';
import { verdicts } from '../../src/core/advice.js';

// La Edge Function ai-analysis descarta veredictos cuya etiqueta no conoce. Si
// alguien cambia una etiqueta en advice.js sin actualizarla allí, la IA dejaría
// de recibir esa recomendación sin que nada falle: este test lo impide.
test('las etiquetas de veredicto del motor están permitidas en ai-analysis', () => {
  const src = readFileSync(new URL('../../supabase/functions/ai-analysis/index.ts', import.meta.url), 'utf8');
  const allowed = new Set([...src.match(/ALLOWED_ACTIONS = new Set\(\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
  const P = (sh, pr) => ({ purchases: [{ date: '2026-01-01', shares: sh, price: pr }] });
  const cases = [
    [{ A: P(8, 100), VOO: P(2, 100) }, { A: { currentPrice: 100 }, VOO: { currentPrice: 100 } }],
    [{ A: P(1, 100), VOO: P(20, 100) }, { A: { currentPrice: 90, analystRating: 'VENDER' }, VOO: { currentPrice: 100 } }],
    [{ A: P(1, 100), VOO: P(20, 100) }, { A: { currentPrice: 198, pe: 60, week52High: 200, week52Low: 90 }, VOO: { currentPrice: 100 } }],
    [{ A: P(4, 100), B: P(4, 100), VOO: P(2, 100) }, { A: { currentPrice: 100 }, B: { currentPrice: 100 }, VOO: { currentPrice: 100 } }],
  ];
  const seen = new Set();
  for (const [positions, market] of cases) {
    for (const v of Object.values(verdicts({ summary: summarize({ positions, market }), market }))) seen.add(v.label);
  }
  assert.ok(seen.size >= 4, `sólo se generaron ${[...seen]}`);
  for (const label of seen) assert.ok(allowed.has(label), `ai-analysis no permite «${label}»`);
});

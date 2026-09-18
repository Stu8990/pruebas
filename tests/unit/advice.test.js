import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../src/core/portfolio.js';
import { verdicts, planContribution, todayActions, isFund, evaluateCandidate } from '../../src/core/advice.js';

const near = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const P = (shares, price) => ({ purchases: [{ date: '2026-01-02', shares, price }] });

function setup(positions, market, opts = {}) {
  const summary = summarize({ positions, market, cash: 0 });
  return { summary, market, profile: opts.profile ?? 'equilibrado' };
}

test('isFund reconoce ETFs por tipo de Yahoo o por lista conocida', () => {
  assert.equal(isFund('VOO', {}), true);
  assert.equal(isFund('XYZ', { quoteType: 'ETF' }), true);
  assert.equal(isFund('NVDA', { quoteType: 'EQUITY' }), false);
});

test('una acción individual que pesa más del límite se marca "vender una parte" con el monto', () => {
  // NVDA vale 800 de 1000 en acciones → 80%; límite equilibrado 20% → sobra 600
  const s = setup({ NVDA: P(8, 50), VOO: P(1, 150) },
    { NVDA: { currentPrice: 100 }, VOO: { currentPrice: 200 } });
  const v = verdicts(s).NVDA;
  assert.equal(v.action, 'recortar');
  near(v.amount, 800 - 0.2 * 1000);
  assert.match(v.reasons.join(' '), /80%/);
});

test('un ETF amplio nunca se recorta por concentración', () => {
  const s = setup({ VOO: P(10, 100) }, { VOO: { currentPrice: 110 } });
  assert.notEqual(verdicts(s).VOO.action, 'recortar');
});

test('analistas en VENDER marca la acción para revisar', () => {
  const s = setup({ AAA: P(1, 100), VOO: P(10, 100) },
    { AAA: { currentPrice: 90, analystRating: 'VENDER' }, VOO: { currentPrice: 100 } });
  assert.equal(verdicts(s).AAA.action, 'revisar');
});

test('una caída fuerte sin respaldo de analistas pide revisar, con respaldo pide mantener la calma', () => {
  const base = { VOO: P(20, 100) };
  const bad  = setup({ ...base, AAA: P(1, 100) }, { VOO: { currentPrice: 100 }, AAA: { currentPrice: 70, analystRating: 'MANTENER' } });
  const good = setup({ ...base, AAA: P(1, 100) }, { VOO: { currentPrice: 100 }, AAA: { currentPrice: 70, analystRating: 'COMPRAR' } });
  assert.equal(verdicts(bad).AAA.action, 'revisar');
  assert.notEqual(verdicts(good).AAA.action, 'revisar');
});

test('muy cara y en máximos: no comprar más ahora (esperar)', () => {
  const s = setup({ AAA: P(1, 100), VOO: P(20, 100) },
    { AAA: { currentPrice: 198, pe: 60, week52High: 200, week52Low: 90 }, VOO: { currentPrice: 100 } });
  assert.equal(verdicts(s).AAA.action, 'esperar');
});

test('en máximos pero con PER futuro moderado: no hace falta esperar', () => {
  const s = setup({ AAA: P(1, 100), VOO: P(20, 100) },
    { AAA: { currentPrice: 198, pe: 60, forwardPe: 25, week52High: 200, week52Low: 90 }, VOO: { currentPrice: 100 } });
  assert.notEqual(verdicts(s).AAA.action, 'esperar');
});

test('una pérdida grande por sí sola no pide vender', () => {
  const s = setup({ AAA: P(1, 100), VOO: P(20, 100) },
    { AAA: { currentPrice: 50 }, VOO: { currentPrice: 100 } });
  assert.notEqual(verdicts(s).AAA.action, 'revisar');
});

test('un exceso de peso menor a $25 no justifica vender', () => {
  // AAA pesa 21% de $100: exceso de $1
  const s = setup({ AAA: P(1, 21), VOO: P(1, 79) }, { AAA: { currentPrice: 21 }, VOO: { currentPrice: 79 } });
  assert.notEqual(verdicts(s).AAA.action, 'recortar');
});

test('cada veredicto trae razones en lenguaje simple', () => {
  const s = setup({ VOO: P(1, 100) }, { VOO: { currentPrice: 100 } });
  const v = verdicts(s).VOO;
  assert.ok(v.reasons.length >= 1);
  assert.ok(v.label);
});

test('planContribution reparte el aporte hacia lo que está por debajo de su peso objetivo', () => {
  // Equilibrado: 50% fondos. Hoy fondos = 200 de 1000 (20%). Con $500 nuevos
  // el objetivo de fondos es 750 → todo el aporte va a VOO.
  const s = setup({ AAA: P(4, 100), BBB: P(4, 100), VOO: P(2, 100) },
    { AAA: { currentPrice: 100 }, BBB: { currentPrice: 100 }, VOO: { currentPrice: 100 } });
  const plan = planContribution({ ...s, amount: 500 });
  const voo = plan.buys.find(b => b.ticker === 'VOO');
  near(voo.usd, 500, 1);
  near(plan.buys.reduce((a, b) => a + b.usd, 0), 500, 1);
});

test('planContribution no pone dinero en acciones marcadas para recortar o revisar', () => {
  const s = setup({ NVDA: P(8, 100), AAA: P(1, 100), VOO: P(1, 100) },
    { NVDA: { currentPrice: 100 }, AAA: { currentPrice: 100, analystRating: 'VENDER' }, VOO: { currentPrice: 100 } });
  const plan = planContribution({ ...s, amount: 300 });
  assert.ok(!plan.buys.some(b => b.ticker === 'NVDA' || b.ticker === 'AAA'));
});

test('planContribution sin fondos en cartera propone un ETF amplio como base', () => {
  const s = setup({ AAA: P(5, 100) }, { AAA: { currentPrice: 100 } });
  const plan = planContribution({ ...s, amount: 200 });
  assert.ok(plan.buys.some(b => b.ticker === 'VOO' && b.isNew));
});

test('planContribution con monto inválido no propone nada', () => {
  const s = setup({ VOO: P(1, 100) }, { VOO: { currentPrice: 100 } });
  assert.deepEqual(planContribution({ ...s, amount: 0 }).buys, []);
  assert.deepEqual(planContribution({ ...s, amount: -5 }).buys, []);
});

test('todayActions prioriza revisar sobre recortar y dice "nada que hacer" si todo está bien', () => {
  const calm = setup({ VOO: P(10, 100) }, { VOO: { currentPrice: 105 } });
  const a = todayActions(calm);
  assert.equal(a[0].kind, 'nada');

  const busy = setup({ NVDA: P(8, 100), AAA: P(1, 100), VOO: P(2, 100) },
    { NVDA: { currentPrice: 100 }, AAA: { currentPrice: 60, analystRating: 'VENDER' }, VOO: { currentPrice: 100 } });
  const b = todayActions(busy);
  assert.equal(b[0].kind, 'revisar');
  assert.equal(b[0].ticker, 'AAA');
  assert.ok(b.some(x => x.kind === 'recortar' && x.ticker === 'NVDA'));
});

test('el perfil cambia el límite por acción', () => {
  // AAA pesa 25%: sobra en conservador (15%) y en equilibrado (20%), no en agresivo (30%)
  const pos = { AAA: P(1, 250), VOO: P(1, 750) };
  const mk = { AAA: { currentPrice: 250 }, VOO: { currentPrice: 750 } };
  assert.equal(verdicts(setup(pos, mk, { profile: 'conservador' })).AAA.action, 'recortar');
  assert.notEqual(verdicts(setup(pos, mk, { profile: 'agresivo' })).AAA.action, 'recortar');
});


test('evaluateCandidate: analistas en VENDER → evitar', () => {
  const s = setup({ VOO: P(10, 100) }, { VOO: { currentPrice: 100 } });
  const r = evaluateCandidate({ ...s, ticker: 'ZZZ', quote: { currentPrice: 10, analystRating: 'VENDER' } });
  assert.equal(r.action, 'evitar');
});

test('evaluateCandidate: cara y en máximos → esperar', () => {
  const s = setup({ VOO: P(10, 100) }, { VOO: { currentPrice: 100 } });
  const r = evaluateCandidate({ ...s, ticker: 'ZZZ', quote: { currentPrice: 99, pe: 80, week52High: 100, week52Low: 50 } });
  assert.equal(r.action, 'esperar');
});

test('evaluateCandidate: una acción razonable encaja con un máximo en USD según el perfil', () => {
  // $1000 en acciones, tope 20% → máximo x tal que x / (1000 + x) = 0.2 → 250
  const s = setup({ VOO: P(10, 100) }, { VOO: { currentPrice: 100 } });
  const r = evaluateCandidate({ ...s, ticker: 'ZZZ', quote: { currentPrice: 50, pe: 20, analystRating: 'COMPRAR' } });
  assert.equal(r.action, 'encaja');
  near(r.maxUsd, 250);
});

test('evaluateCandidate: si ya la tienes devuelve el veredicto de tu posición', () => {
  const s = setup({ VOO: P(10, 100) }, { VOO: { currentPrice: 100 } });
  const r = evaluateCandidate({ ...s, ticker: 'VOO', quote: { currentPrice: 100 } });
  assert.equal(r.owned, true);
  assert.ok(['mantener', 'comprar'].includes(r.action));
});

// ── Hallazgos de la revisión de Codex ──────────────────────────
test('con precios incompletos no se dan veredictos de peso ni se reparte el aporte', () => {
  const summary = summarize({ positions: { AAA: P(1, 100), VOO: P(100, 100) }, market: { AAA: { currentPrice: 100 } } });
  const v = verdicts({ summary, market: { AAA: { currentPrice: 100 } } });
  assert.notEqual(v.AAA.action, 'recortar');
  assert.deepEqual(planContribution({ summary, market: {}, amount: 100 }).buys, []);
  assert.equal(todayActions({ summary, market: {} })[0].kind, 'incompleto');
});

test('todayActions sin acciones no dice que la cartera está equilibrada', () => {
  const summary = summarize({ positions: {}, market: {}, cash: 500 });
  assert.equal(todayActions({ summary, market: {} })[0].kind, 'vacio');
});

test('planContribution nunca lleva una acción por encima de su tope', () => {
  // conservador: tope 15%. AAA ya en 15% → el aporte no debe ir a AAA.
  const s = setup({ AAA: P(15, 1), VOO: P(85, 1) }, { AAA: { currentPrice: 1 }, VOO: { currentPrice: 1 } }, { profile: 'conservador' });
  const plan = planContribution({ ...s, amount: 10 });
  const T = 100 + 10;
  for (const b of plan.buys) {
    if (b.ticker === 'AAA') assert.ok((15 + b.usd) / T <= 0.15 + 1e-9, `AAA pasa a ${((15 + b.usd) / T * 100).toFixed(1)}%`);
  }
  near(plan.buys.reduce((a, b) => a + b.usd, 0), 10, 0.01);
});

test('planContribution con muchos destinos pequeños no pierde el aporte', () => {
  const pos = {}, mk = {};
  for (let i = 0; i < 25; i++) { const t = `S${i}`; pos[t] = P(1, 100); mk[t] = { currentPrice: 100 }; }
  pos.VOO = P(25, 100); mk.VOO = { currentPrice: 100 };
  const plan = planContribution({ ...setup(pos, mk), amount: 30 });
  near(plan.buys.reduce((a, b) => a + b.usd, 0), 30, 0.01);
});

test('planContribution rechaza un aporte infinito', () => {
  const s = setup({ VOO: P(1, 100) }, { VOO: { currentPrice: 100 } });
  assert.deepEqual(planContribution({ ...s, amount: Infinity }).buys, []);
});

test('evaluateCandidate sin precio no recomienda comprar', () => {
  const s = setup({ VOO: P(10, 100) }, { VOO: { currentPrice: 100 } });
  assert.equal(evaluateCandidate({ ...s, ticker: 'ZZZ', quote: {} }).action, 'sin_datos');
});

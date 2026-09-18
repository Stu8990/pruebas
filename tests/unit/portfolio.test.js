import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, monthAttribution } from '../../src/core/portfolio.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

const positions = {
  NVDA: { purchases: [{ date: '2026-03-02', shares: 8, price: 110 }] },
  VOO:  { purchases: [{ date: '2026-03-02', shares: 1, price: 400 }, { date: '2026-05-01', shares: 1, price: 500 }] },
};
const market = {
  NVDA: { currentPrice: 146, changePercent: -2.9, monthStartPrice: 168 },
  VOO:  { currentPrice: 538, changePercent: -0.4, monthStartPrice: 545 },
};

test('summarize: valor, costo y ganancia salen de las compras y el precio actual', () => {
  const s = summarize({ positions, market, cash: 100 });
  near(s.invested, 8 * 110 + 400 + 500);
  near(s.stocksValue, 8 * 146 + 2 * 538);
  near(s.total, s.stocksValue + 100);
  near(s.gain, s.stocksValue - s.invested);
  near(s.gainPct, (s.gain / s.invested) * 100);
});

test('summarize: el precio medio pondera cada compra por su número de acciones', () => {
  const voo = summarize({ positions, market, cash: 0 }).holdings.find(h => h.ticker === 'VOO');
  near(voo.avgPrice, 450);
  near(voo.shares, 2);
});

test('summarize: el cambio de hoy en USD se deriva del % diario sobre el precio de ayer', () => {
  const s = summarize({ positions, market, cash: 0 });
  const nvda = s.holdings.find(h => h.ticker === 'NVDA');
  // ayer = 146 / (1 - 0.029); cambio = 8 * (146 - ayer)
  near(nvda.todayUsd, 8 * (146 - 146 / (1 - 0.029)));
  near(s.today, s.holdings.reduce((a, h) => a + h.todayUsd, 0));
});

test('summarize: el peso de cada acción es su parte del valor en acciones', () => {
  const s = summarize({ positions, market, cash: 500 });
  const total = s.holdings.reduce((a, h) => a + h.weight, 0);
  near(total, 100);
});

test('summarize: una acción sin precio no inventa valor y queda marcada', () => {
  const s = summarize({ positions, market: { VOO: market.VOO }, cash: 0 });
  assert.deepEqual(s.missingPrices, ['NVDA']);
  const nvda = s.holdings.find(h => h.ticker === 'NVDA');
  assert.equal(nvda.value, null);
  near(s.stocksValue, 2 * 538);
  near(s.invested, 900 + 880, 0.01);
  // la ganancia sólo compara lo que tiene precio
  near(s.gain, 2 * 538 - 900);
});

test('summarize: sin posiciones devuelve ceros y lista vacía', () => {
  const s = summarize({ positions: {}, market: {}, cash: 0 });
  assert.equal(s.holdings.length, 0);
  assert.equal(s.total, 0);
  assert.equal(s.gainPct, null);
});

test('monthAttribution: explica el mes en USD por acción con el precio de inicio de mes', () => {
  const m = monthAttribution({ positions, market, history: [], today: '2026-09-18' });
  const nvda = m.byTicker.find(x => x.ticker === 'NVDA');
  near(nvda.usd, 8 * (146 - 168));
  const voo = m.byTicker.find(x => x.ticker === 'VOO');
  near(voo.usd, 2 * (538 - 545));
  near(m.total, nvda.usd + voo.usd);
  assert.equal(m.byTicker[0].ticker, 'NVDA', 'ordenado por impacto absoluto');
  assert.equal(m.source, 'market');
});

test('monthAttribution: una compra hecha este mes sólo cuenta desde su precio de compra', () => {
  const pos = { NVDA: { purchases: [{ date: '2026-03-02', shares: 8, price: 110 }, { date: '2026-09-10', shares: 2, price: 150 }] } };
  const m = monthAttribution({ positions: pos, market, history: [], today: '2026-09-18' });
  near(m.byTicker[0].usd, 8 * (146 - 168) + 2 * (146 - 150));
});

test('monthAttribution: sin precio de inicio de mes usa el último registro del mes anterior', () => {
  const noStart = { NVDA: { currentPrice: 146, changePercent: 0 } };
  const pos = { NVDA: { purchases: [{ date: '2026-03-02', shares: 8, price: 110 }] } };
  // rendimiento del 31 ago: +52.73% sobre 110 → precio 168
  const history = [
    { fecha: '2026-08-28', valor_total_usd: 1, rendimientos: { NVDA: 40 } },
    { fecha: '2026-08-31', valor_total_usd: 1, rendimientos: { NVDA: 52.73 } },
    { fecha: '2026-09-02', valor_total_usd: 1, rendimientos: { NVDA: 30 } },
  ];
  const m = monthAttribution({ positions: pos, market: noStart, history, today: '2026-09-18' });
  near(m.byTicker[0].usd, 8 * (146 - 110 * 1.5273), 0.05);
  assert.equal(m.source, 'history');
});

test('monthAttribution: sin ningún dato de referencia no inventa números', () => {
  const pos = { NVDA: { purchases: [{ date: '2026-03-02', shares: 8, price: 110 }] } };
  const m = monthAttribution({ positions: pos, market: { NVDA: { currentPrice: 146 } }, history: [], today: '2026-09-18' });
  assert.equal(m.byTicker.length, 0);
  assert.equal(m.total, null);
  assert.equal(m.source, null);
});

test('monthAttribution: un activo comprado entero este mes cuenta desde su compra', () => {
  const pos = { AAPL: { purchases: [{ date: '2026-09-05', shares: 1, price: 220 }] } };
  const m = monthAttribution({ positions: pos, market: { AAPL: { currentPrice: 231 } }, history: [], today: '2026-09-18' });
  near(m.byTicker[0].usd, 11);
});

test('summarize: una venta reduce acciones al costo medio y registra la ganancia realizada', () => {
  const pos = { AAA: { purchases: [{ date: '2026-01-02', shares: 10, price: 100 }], sales: [{ date: '2026-02-01', shares: 4, price: 150 }] } };
  const s = summarize({ positions: pos, market: { AAA: { currentPrice: 120 } }, cash: 0 });
  const h = s.holdings[0];
  near(h.shares, 6);
  near(h.cost, 600);
  near(h.avgPrice, 100);
  near(h.realized, 4 * 50);
  near(s.realized, 200);
});

test('summarize: el costo medio respeta el orden de compras y ventas', () => {
  // compra 10 @100, vende 5 @120 (costo queda 500), compra 5 @200 → 10 acc, costo 1500
  const pos = { AAA: {
    purchases: [{ date: '2026-01-02', shares: 10, price: 100 }, { date: '2026-03-01', shares: 5, price: 200 }],
    sales: [{ date: '2026-02-01', shares: 5, price: 120 }],
  } };
  const h = summarize({ positions: pos, market: { AAA: { currentPrice: 200 } } }).holdings[0];
  near(h.shares, 10);
  near(h.cost, 1500);
  near(h.realized, 100);
});

test('summarize: una posición vendida por completo no aparece como tenencia', () => {
  const pos = { AAA: { purchases: [{ date: '2026-01-02', shares: 2, price: 100 }], sales: [{ date: '2026-02-01', shares: 2, price: 130 }] } };
  const s = summarize({ positions: pos, market: {}, cash: 0 });
  assert.equal(s.holdings.length, 0);
  near(s.realized, 60);
});

test('monthAttribution: una venta en el mes cuenta a su precio de venta, no al de hoy', () => {
  // 10 acc a inicio de mes (precio 100); vende 4 a 110; hoy 90
  const pos = { AAA: {
    purchases: [{ date: '2026-01-02', shares: 10, price: 80 }],
    sales: [{ date: '2026-09-05', shares: 4, price: 110 }],
  } };
  const m = monthAttribution({ positions: pos, market: { AAA: { currentPrice: 90, monthStartPrice: 100 } }, history: [], today: '2026-09-18' });
  near(m.byTicker[0].usd, 6 * (90 - 100) + 4 * (110 - 100));
});

// ── Hallazgos de la revisión de Codex ──────────────────────────
test('summarize: la ganancia total suma la no realizada y la ya cobrada', () => {
  const pos = { AAA: { purchases: [{ date: '2026-01-02', shares: 10, price: 100 }], sales: [{ date: '2026-02-01', shares: 5, price: 120 }] } };
  const s = summarize({ positions: pos, market: { AAA: { currentPrice: 110 } } });
  near(s.unrealized, 50);
  near(s.realized, 100);
  near(s.totalGain, 150);
});

test('summarize: complete es falso si falta algún precio', () => {
  assert.equal(summarize({ positions, market: { VOO: market.VOO } }).complete, false);
  assert.equal(summarize({ positions, market }).complete, true);
});

test('summarize: valores no finitos no contaminan los totales', () => {
  const pos = { AAA: { purchases: [{ date: '2026-01-02', shares: Infinity, price: 100 }, { date: '2026-01-03', shares: 1, price: 100 }] } };
  const s = summarize({ positions: pos, market: { AAA: { currentPrice: 110, changePercent: -100 } }, cash: Infinity });
  near(s.stocksValue, 110);
  assert.ok(Number.isFinite(s.total));
  assert.ok(Number.isFinite(s.today));
});

test('monthAttribution: una venta mayor que lo poseído sólo cuenta lo que existía', () => {
  const pos = { AAA: { purchases: [{ date: '2026-01-02', shares: 5, price: 80 }], sales: [{ date: '2026-09-05', shares: 10, price: 110 }] } };
  const m = monthAttribution({ positions: pos, market: { AAA: { currentPrice: 90, monthStartPrice: 100 } }, history: [], today: '2026-09-18' });
  near(m.byTicker[0].usd, 5 * (110 - 100));
});

test('monthAttribution: ignora operaciones con fecha futura', () => {
  const pos = { AAA: { purchases: [{ date: '2026-01-02', shares: 1, price: 80 }, { date: '2026-10-02', shares: 5, price: 50 }] } };
  const m = monthAttribution({ positions: pos, market: { AAA: { currentPrice: 90, monthStartPrice: 100 } }, history: [], today: '2026-09-18' });
  near(m.byTicker[0].usd, -10);
});

test('monthAttribution: el respaldo histórico elige el registro más reciente aunque llegue desordenado', () => {
  const pos = { NVDA: { purchases: [{ date: '2026-03-02', shares: 8, price: 110 }] } };
  const history = [
    { fecha: '2026-08-31', valor_total_usd: 1, rendimientos: { NVDA: 52.73 } },
    { fecha: '2026-08-10', valor_total_usd: 1, rendimientos: { NVDA: 0 } },
  ];
  const m = monthAttribution({ positions: pos, market: { NVDA: { currentPrice: 146 } }, history, today: '2026-09-18' });
  near(m.byTicker[0].usd, 8 * (146 - 110 * 1.5273), 0.05);
});

test('monthAttribution: el respaldo histórico usa el costo medio vigente en la fecha del registro', () => {
  // El 20 ago el costo medio era 100 (+50% → precio 150). El 25 ago compró más a 200.
  const pos = { AAA: { purchases: [{ date: '2026-01-02', shares: 1, price: 100 }, { date: '2026-08-25', shares: 1, price: 200 }] } };
  const history = [{ fecha: '2026-08-20', valor_total_usd: 1, rendimientos: { AAA: 50 } }];
  const m = monthAttribution({ positions: pos, market: { AAA: { currentPrice: 160 } }, history, today: '2026-09-18' });
  near(m.byTicker[0].usd, 2 * (160 - 150));
});

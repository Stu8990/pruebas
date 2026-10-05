import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../src/core/portfolio.js';
import { DEFAULT_PLAN, planStatus, monthlyBuys, planVerdicts, vsIndex, daysUntil, roleOf } from '../../src/core/plan.js';

const near = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const P = (shares, price) => ({ purchases: [{ date: '2026-01-02', shares, price }] });

// Cartera parecida a la real del 1 oct 2026: S&P 37%, NVDA 9%, Visa 9%,
// y casi la mitad en cosas que el plan decide vender.
function realish() {
  const positions = {
    VOO: P(1, 370), NVDA: P(1, 90), VISA: P(1, 90), MSFT: P(1, 30),
    SCHD: P(1, 80), PG: P(1, 70), PEP: P(1, 60), 'EUNL.DE': P(1, 50), MNST: P(1, 40), AMZN: P(1, 100), KO: P(1, 20),
  };
  const market = Object.fromEntries(Object.entries(positions).map(([t, p]) => [t, { currentPrice: p.purchases[0].price }]));
  return summarize({ positions, market });
}

test('el aporte nunca va a algo de la lista de venta ni a lo congelado', () => {
  const { buys } = monthlyBuys({ summary: realish(), amount: 100 });
  const sold = new Set(DEFAULT_PLAN.exit.items.map(e => e.ticker));
  assert.ok(buys.length >= 1 && buys.length <= 3);
  for (const b of buys) {
    assert.ok(!sold.has(b.ticker), `${b.ticker} está en la lista de venta`);
    assert.notEqual(b.ticker, 'NVDA');
  }
});

test('el aporte va a las posiciones más por debajo de su objetivo y suma exacto', () => {
  const { buys } = monthlyBuys({ summary: realish(), amount: 100 });
  assert.deepEqual(buys.map(b => b.ticker), ['CSPX', 'EIMI', 'JNJ']);
  near(buys.reduce((s, b) => s + b.usd, 0), 100, 0.001);
  assert.ok(buys[0].isNew, 'CSPX todavía no está en la cartera');
});

test('el dinero nuevo del S&P 500 va a CSPX aunque ya tengas VOO', () => {
  const { buys } = monthlyBuys({ summary: realish(), amount: 100 });
  assert.equal(buys[0].ticker, 'CSPX');
  const v = planVerdicts({ summary: realish(), today: '2026-10-05' });
  assert.equal(v.VOO.action, 'mantener');
  assert.match(v.VOO.reasons[0], /CSPX/);
});

test('montos chicos no se reparten en tres: menos de $10 se suma al primero', () => {
  const { buys } = monthlyBuys({ summary: realish(), amount: 20 });
  for (const b of buys.slice(1)) assert.ok(b.usd >= 2, `${b.ticker} $${b.usd}`);
  near(buys.reduce((s, b) => s + b.usd, 0), 20, 0.001);
});

test('sin precios completos no hay montos', () => {
  const s = summarize({ positions: { VOO: P(1, 100), JNJ: P(1, 100) }, market: { VOO: { currentPrice: 100 } } });
  const r = monthlyBuys({ summary: s, amount: 100 });
  assert.equal(r.buys.length, 0);
  assert.match(r.note, /Faltan precios/);
});

test('con todo en su peso, el aporte va al núcleo', () => {
  const positions = { CSPX: P(1, 670), EIMI: P(1, 150), MSFT: P(1, 55), VISA: P(1, 55), JNJ: P(1, 55), NVDA: P(1, 15) };
  const market = Object.fromEntries(Object.keys(positions).map(t => [t, { currentPrice: positions[t].purchases[0].price }]));
  const { buys } = monthlyBuys({ summary: summarize({ positions, market }), amount: 100 });
  near(buys.reduce((s, b) => s + b.usd, 0), 100, 0.001);
  assert.ok(buys.every(b => b.ticker !== 'NVDA'));
});

test('objetivos más lo congelado suman 100%', () => {
  const st = planStatus({ summary: realish(), today: '2026-10-05' });
  const frozen = st.frozen.reduce((s, f) => s + Math.min(f.weight, f.max), 0);
  near(st.targets.reduce((s, t) => s + t.goal, 0) + frozen, 100);
  const sp = st.targets.find(t => t.key === 'sp500');
  assert.ok(sp.goal < 67 && sp.goal > 55, 'NVDA ocupa espacio y el S&P cede');
  assert.equal(st.targets.find(t => t.key === 'msft').goal, 5.5);
});

test('lista de venta: las «ya» primero y días hasta la fecha tope', () => {
  const st = planStatus({ summary: realish(), today: '2026-10-05' });
  assert.equal(st.daysLeft, 87);
  assert.deepEqual(st.exits.slice(0, 2).map(e => e.ticker).sort(), ['EUNL.DE', 'KO']);
  assert.equal(st.exits.length, 7);
  near(st.exitWeight, (80 + 70 + 60 + 50 + 40 + 100 + 20) / 1000 * 100);
});

test('veredictos: vender lo del plan, congelar NVDA, recortar si pasa su tope', () => {
  const v = planVerdicts({ summary: realish(), today: '2026-10-05' });
  assert.equal(v.SCHD.action, 'vender');
  assert.match(v['EUNL.DE'].reasons[0], /ya y pasar el dinero a EIMI/);
  assert.match(v.AMZN.reasons[0], /antes del 31 dic/);
  assert.equal(v.NVDA.action, 'congelada');
  assert.equal(v.VISA.action, 'mantener');
  assert.match(v.VISA.reasons[0], /No le pongas más/);

  const big = summarize({ positions: { VOO: P(1, 700), NVDA: P(1, 300) }, market: { VOO: { currentPrice: 700 }, NVDA: { currentPrice: 300 } } });
  const nv = planVerdicts({ summary: big }).NVDA;
  assert.equal(nv.action, 'recortar');
  near(nv.amount, 300 - 0.1 * 1000);
});

test('una acción que no está en el plan se marca, no se ignora', () => {
  const s = summarize({ positions: { VOO: P(1, 100), TSLA: P(1, 100) }, market: { VOO: { currentPrice: 100 }, TSLA: { currentPrice: 100 } } });
  assert.equal(planVerdicts({ summary: s }).TSLA.action, 'fuera');
  assert.equal(roleOf('TSLA').kind, 'outside');
});

test('S&P 500 contra el resto, en % sobre lo pagado', () => {
  const s = summarize({
    positions: { VOO: P(1, 100), MSFT: P(1, 100) },
    market: { VOO: { currentPrice: 110 }, MSFT: { currentPrice: 95 } },
  });
  const r = vsIndex({ summary: s });
  near(r.index.gainPct, 10);
  near(r.rest.gainPct, -5);
  near(r.diffPp, -15);
  assert.equal(vsIndex({ summary: summarize({ positions: { VOO: P(1, 100) }, market: { VOO: { currentPrice: 1 } } }) }), null);
});

test('daysUntil cuenta días de calendario', () => {
  assert.equal(daysUntil('2026-12-31', '2026-12-30'), 1);
  assert.equal(daysUntil('2026-12-31', '2027-01-02'), -2);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../src/core/portfolio.js';
import {
  enginePlan, normalizePlan, parsePlanForm, STARTER_PLAN, planStatus, monthlyBuys as mb, planVerdicts as pv, vsIndex as vi, daysUntil, roleOf,
} from '../../src/core/plan.js';

// Un plan como el que guarda un usuario (user_metadata.plan): núcleo S&P 500,
// emergentes, tres acciones, NVDA congelada y una lista de venta con fecha.
const STORED = {
  v: 1, monthly: 100, nonUS: true, deadline: '2026-12-31',
  targets: [{ ticker: 'CSPX', pct: 67 }, { ticker: 'EIMI', pct: 15 }, { ticker: 'MSFT', pct: 5.5 }, { ticker: 'VISA', pct: 5.5 }, { ticker: 'JNJ', pct: 5.5 }],
  frozen: [{ ticker: 'NVDA', max: 10 }],
  exits: [{ ticker: 'EUNL.DE', now: true }, { ticker: 'KO', now: true },
    ...['SCHD', 'PEP', 'PG', 'MNST', 'AMZN'].map(ticker => ({ ticker, now: false }))],
};
const PLAN = enginePlan(STORED);
const monthlyBuys = a => mb({ plan: PLAN, ...a });
const planVerdicts = a => pv({ plan: PLAN, ...a });
const vsIndex = a => vi({ plan: PLAN, ...a });

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
  const sold = new Set(PLAN.exit.items.map(e => e.ticker));
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
  const st = planStatus({ summary: realish(), plan: PLAN, today: '2026-10-05' });
  const frozen = st.frozen.reduce((s, f) => s + Math.min(f.weight, f.max), 0);
  near(st.targets.reduce((s, t) => s + t.goal, 0) + frozen, 100);
  const sp = st.targets.find(t => t.label === 'S&P 500');
  assert.ok(sp.goal < 67 && sp.goal > 55, 'NVDA ocupa espacio y el S&P cede');
  assert.equal(st.targets.find(t => t.key === 'MSFT').goal, 5.5);
});

test('lista de venta: las «ya» primero y días hasta la fecha tope', () => {
  const st = planStatus({ summary: realish(), plan: PLAN, today: '2026-10-05' });
  assert.equal(st.daysLeft, 87);
  assert.deepEqual(st.exits.slice(0, 2).map(e => e.ticker).sort(), ['EUNL.DE', 'KO']);
  assert.equal(st.exits.length, 7);
  near(st.exitWeight, (80 + 70 + 60 + 50 + 40 + 100 + 20) / 1000 * 100);
});

test('veredictos: vender lo del plan, congelar NVDA, recortar si pasa su tope', () => {
  const v = planVerdicts({ summary: realish(), today: '2026-10-05' });
  assert.equal(v.SCHD.action, 'vender');
  assert.match(v['EUNL.DE'].reasons[0], /venderla ya/);
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
  assert.equal(roleOf('TSLA', PLAN).kind, 'outside');
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

// ── Plan por usuario ─────────────────────────────────────────

test('normalizePlan: sin objetivos no hay plan; limpia símbolos, duplicados y pesos', () => {
  assert.equal(normalizePlan(null), null);
  assert.equal(normalizePlan({ targets: [] }), null);
  assert.equal(normalizePlan({ targets: [{ ticker: 'x y', pct: 50 }] }), null);
  const p = normalizePlan({
    targets: [{ ticker: ' cspx ', pct: 80 }, { ticker: 'CSPX', pct: 10 }, { ticker: 'EIMI', pct: 0 }, { ticker: 'MSFT', pct: '20' }],
    frozen: [{ ticker: 'MSFT', max: 5 }, { ticker: 'nvda' }], exits: [{ ticker: 'KO', now: true }, { ticker: 'PEP' }],
    deadline: 'mañana', monthly: -5,
  });
  assert.deepEqual(p.targets, [{ ticker: 'CSPX', pct: 80 }, { ticker: 'MSFT', pct: 20 }]);
  assert.deepEqual(p.frozen, [{ ticker: 'NVDA', max: 10 }], 'un objetivo no puede ser también congelado');
  assert.deepEqual(p.exits, [{ ticker: 'KO', now: true }, { ticker: 'PEP', now: false }]);
  assert.equal(p.deadline, '');
  assert.equal(p.monthly, 0);
  assert.equal(p.nonUS, true);
});

test('enginePlan: grupos de símbolos, fondos vs acciones y qué se compra', () => {
  const e = enginePlan(STORED);
  const sp = e.targets[0];
  assert.equal(sp.label, 'S&P 500');
  assert.equal(sp.buy, 'CSPX');
  assert.ok(sp.tickers.includes('VOO'));
  assert.equal(sp.stock, false);
  assert.equal(e.targets.find(t => t.key === 'VISA').label, 'Visa');
  assert.equal(e.targets.find(t => t.key === 'MSFT').stock, true);
  assert.equal(enginePlan(null), null);
  // Un ETF que no está en la lista conocida se reconoce por el quoteType de Yahoo.
  assert.equal(enginePlan({ targets: [{ ticker: 'VWRA', pct: 100 }] }, { VWRA: { quoteType: 'ETF' } }).targets[0].stock, false);
});

test('el plan de inicio sirve tal cual: todo el aporte a sus dos fondos', () => {
  const s = summarize({ positions: { VOO: P(1, 100), KO: P(1, 50) }, market: { VOO: { currentPrice: 100 }, KO: { currentPrice: 50 } } });
  const { buys } = mb({ summary: s, plan: enginePlan(STARTER_PLAN), amount: 100 });
  assert.deepEqual(buys.map(b => b.ticker).sort(), ['CSPX', 'EIMI']);
  assert.equal(pv({ summary: s, plan: enginePlan(STARTER_PLAN) }).KO.action, 'fuera');
});

test('sin índice en el plan no hay comparación con el S&P 500', () => {
  const s = summarize({ positions: { MSFT: P(1, 100), KO: P(1, 100) }, market: { MSFT: { currentPrice: 110 }, KO: { currentPrice: 90 } } });
  assert.equal(vi({ summary: s, plan: enginePlan({ targets: [{ ticker: 'MSFT', pct: 100 }] }) }), null);
});

const form = fields => name => (name in fields ? fields[name] : null);

test('parsePlanForm: lee objetivos, papeles de lo que tienes, fecha y aporte', () => {
  const r = parsePlanForm(form({
    't-0': 'cspx', 'p-0': '70', 't-1': 'EIMI', 'p-1': '20,5', 't-2': '', 'p-2': '',
    'role-NVDA': 'frozen', 'max-NVDA': '8', 'role-KO': 'now', 'role-PEP': 'later', 'role-TSLA': 'other',
    deadline: '2026-12-31', monthly: '150', nonUS: 'on',
  }), ['VOO', 'NVDA', 'KO', 'PEP', 'TSLA']);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.plan.targets, [{ ticker: 'CSPX', pct: 70 }, { ticker: 'EIMI', pct: 20.5 }]);
  assert.deepEqual(r.plan.frozen, [{ ticker: 'NVDA', max: 8 }]);
  assert.deepEqual(r.plan.exits, [{ ticker: 'KO', now: true }, { ticker: 'PEP', now: false }]);
  assert.equal(r.plan.deadline, '2026-12-31');
  assert.equal(r.plan.monthly, 150);
  assert.equal(r.plan.nonUS, true);
});

test('parsePlanForm: errores claros', () => {
  const base = { 't-0': 'CSPX', 'p-0': '80' };
  assert.match(parsePlanForm(form({ 't-0': '', 'p-0': '' }), []).error, /al menos un objetivo/);
  assert.match(parsePlanForm(form({ 't-0': 'C S', 'p-0': '80' }), []).error, /no es un símbolo válido/);
  assert.match(parsePlanForm(form({ 't-0': 'CSPX', 'p-0': '0' }), []).error, /entre 0 y 100/);
  assert.match(parsePlanForm(form({ ...base, 't-1': 'cspx', 'p-1': '10' }), []).error, /dos veces/);
  assert.match(parsePlanForm(form({ ...base, 't-1': 'EIMI', 'p-1': '30' }), []).error, /suman 110%/);
  assert.match(parsePlanForm(form({ ...base, 'role-KO': 'later', deadline: '' }), ['KO']).error, /fecha tope/);
  // Sin ventas con fecha, la fecha no se guarda.
  assert.equal(parsePlanForm(form({ ...base, 'role-KO': 'now', deadline: '2026-12-31' }), ['KO']).plan.deadline, '');
  // Si un símbolo que tienes está en los objetivos, su papel se ignora.
  assert.deepEqual(parsePlanForm(form({ ...base, 'role-CSPX': 'now' }), ['CSPX']).plan.exits, []);
});

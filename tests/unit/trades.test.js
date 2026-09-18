import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTrade, applyTrade, removeTrade, sameTrade } from '../../src/core/trades.js';

const today = '2026-09-18';
const pos = { NVDA: { purchases: [{ date: '2026-03-02', shares: 8, price: 110 }] } };

test('validateTrade acepta una compra correcta y normaliza el símbolo', () => {
  const r = validateTrade({ kind: 'buy', ticker: ' nvda ', date: '2026-09-01', shares: '2', price: '150' }, pos, today);
  assert.equal(r.ok, true);
  assert.deepEqual(r.trade, { kind: 'buy', ticker: 'NVDA', date: '2026-09-01', shares: 2, price: 150 });
});

test('validateTrade calcula las acciones a partir del monto invertido', () => {
  const r = validateTrade({ kind: 'buy', ticker: 'VOO', date: '2026-09-01', amount: '500', price: '250' }, pos, today);
  assert.equal(r.ok, true);
  assert.equal(r.trade.shares, 2);
});

test('validateTrade rechaza símbolo, cantidad, precio o fecha inválidos con mensajes claros', () => {
  const bad = [
    [{ kind: 'buy', ticker: '$$', date: today, shares: 1, price: 1 }, /símbolo/i],
    [{ kind: 'buy', ticker: 'AAA', date: today, shares: 0, price: 1 }, /acciones|monto/i],
    [{ kind: 'buy', ticker: 'AAA', date: today, shares: 1, price: -3 }, /precio/i],
    [{ kind: 'buy', ticker: 'AAA', date: '2026-12-01', shares: 1, price: 1 }, /futur/i],
    [{ kind: 'buy', ticker: 'AAA', date: 'ayer', shares: 1, price: 1 }, /fecha/i],
  ];
  for (const [input, re] of bad) {
    const r = validateTrade(input, pos, today);
    assert.equal(r.ok, false, JSON.stringify(input));
    assert.match(r.error, re);
  }
});

test('validateTrade no deja vender más acciones de las que tienes', () => {
  const r = validateTrade({ kind: 'sell', ticker: 'NVDA', date: today, shares: 9, price: 150 }, pos, today);
  assert.equal(r.ok, false);
  assert.match(r.error, /8/);
  const ok = validateTrade({ kind: 'sell', ticker: 'NVDA', date: today, shares: 8, price: 150 }, pos, today);
  assert.equal(ok.ok, true);
});

test('validateTrade no deja vender algo que no tienes', () => {
  const r = validateTrade({ kind: 'sell', ticker: 'AAPL', date: today, shares: 1, price: 150 }, pos, today);
  assert.equal(r.ok, false);
});

test('applyTrade devuelve posiciones nuevas sin mutar las originales', () => {
  const next = applyTrade(pos, { kind: 'sell', ticker: 'NVDA', date: today, shares: 3, price: 150 });
  assert.equal(pos.NVDA.sales, undefined);
  assert.deepEqual(next.NVDA.sales, [{ date: today, shares: 3, price: 150 }]);
  const next2 = applyTrade(next, { kind: 'buy', ticker: 'VOO', date: today, shares: 1, price: 500 });
  assert.deepEqual(next2.VOO.purchases, [{ date: today, shares: 1, price: 500 }]);
});

test('removeTrade borra una operación y elimina el activo si queda vacío', () => {
  const next = removeTrade(pos, 'NVDA', 'buy', 0);
  assert.equal(next.NVDA, undefined);
  assert.ok(pos.NVDA, 'no muta el original');
});

test('removeTrade no deja una venta huérfana que supere lo comprado', () => {
  const p = { NVDA: { purchases: [{ date: '2026-01-01', shares: 2, price: 100 }, { date: '2026-02-01', shares: 2, price: 100 }], sales: [{ date: '2026-03-01', shares: 3, price: 120 }] } };
  assert.throws(() => removeTrade(p, 'NVDA', 'buy', 1), /venta/i);
});

test('validateTrade acepta coma decimal (12,5) como se escribe en Latinoamérica', () => {
  const r = validateTrade({ kind: 'buy', ticker: 'VOO', date: '2026-09-01', shares: '0,5', price: '480,25' }, pos, today);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.trade.shares, 0.5);
  assert.equal(r.trade.price, 480.25);
});

test('validateTrade acepta separador de miles con coma y punto decimal (1,234.50)', () => {
  const r = validateTrade({ kind: 'buy', ticker: 'VOO', date: '2026-09-01', amount: '1,234.50', price: '100' }, pos, today);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.trade.shares, 12.345);
});

// ── Hallazgos de la segunda revisión de Codex ─────────────────
test('validateTrade rechaza una venta con fecha anterior a la compra', () => {
  const p = { AAA: { purchases: [{ date: '2026-09-10', shares: 5, price: 100 }] } };
  const r = validateTrade({ kind: 'sell', ticker: 'AAA', date: '2026-09-01', shares: 5, price: 120 }, p, today);
  assert.equal(r.ok, false);
  assert.match(r.error, /1 sep|esa fecha/i);
});

test('validateTrade rechaza una venta retroactiva que dejaría sin acciones a una venta posterior', () => {
  // 10 compradas en enero; ya vendió 8 en agosto. Una venta nueva de 5 en marzo
  // parece posible (tenía 10), pero entonces la de agosto quedaría sin acciones.
  const p = { AAA: { purchases: [{ date: '2026-01-02', shares: 10, price: 100 }], sales: [{ date: '2026-08-01', shares: 8, price: 120 }] } };
  const r = validateTrade({ kind: 'sell', ticker: 'AAA', date: '2026-03-01', shares: 5, price: 110 }, p, today);
  assert.equal(r.ok, false);
});

// ── Tercera revisión de Codex ──────────────────────────────────
test('validateTrade rechaza fechas que no existen en el calendario', () => {
  for (const date of ['2026-02-31', '2026-13-01', '2026-04-31']) {
    const r = validateTrade({ kind: 'buy', ticker: 'VOO', date, shares: 1, price: 1 }, pos, today);
    assert.equal(r.ok, false, date);
  }
});

test('sameTrade compara fecha, acciones y precio sin depender del orden de las claves', () => {
  assert.equal(sameTrade({ date: '2026-01-01', shares: 2, price: 10 }, { price: 10, shares: 2, date: '2026-01-01' }), true);
  assert.equal(sameTrade({ date: '2026-01-01', shares: 2, price: 10 }, { date: '2026-01-01', shares: 3, price: 10 }), false);
  assert.equal(sameTrade(undefined, { date: '', shares: 1, price: 1 }), false);
});

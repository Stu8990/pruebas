// Matemática del portafolio. Funciones puras: sin DOM, sin red, sin estado.
//
// La fuente de verdad son las OPERACIONES (compras y ventas con acciones y
// precio) y el precio actual. Con eso la ganancia no se confunde con el dinero
// que el usuario puso: el antiguo "crecimiento total" comparaba el valor del
// primer día con el de hoy, y cada aporte de capital aparecía como rentabilidad.

const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const fin = n => Number.isFinite(n);
const pos = n => fin(n) && n > 0;

function clean(list) {
  return (list ?? [])
    .map(p => ({ date: typeof p?.date === 'string' ? p.date : '', shares: +p?.shares, price: +p?.price }))
    .filter(p => pos(p.shares) && pos(p.price));
}

/**
 * Recorre compras y ventas en orden de fecha con el método de costo medio: una
 * venta saca acciones al precio medio de ese momento y la diferencia con el
 * precio de venta es ganancia realizada. Una operación sin fecha —las compras
 * antiguas se guardaban así— cuenta como la más antigua. Una venta mayor que lo
 * que se tenía sólo cuenta hasta lo que existía (y queda anotado en `oversold`).
 * Devuelve también la lista de operaciones efectivas, ya recortadas.
 */
export function ledger(position, { until } = {}) {
  const ev = [
    ...clean(position?.purchases).map((p, i) => ({ ...p, kind: 'buy', i })),
    ...clean(position?.sales).map((p, i) => ({ ...p, kind: 'sell', i })),
  ]
    .filter(e => !until || !e.date || e.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? a.i - b.i : a.kind === 'buy' ? -1 : 1));

  let shares = 0, cost = 0, realized = 0, oversold = 0;
  const events = [];
  for (const e of ev) {
    if (e.kind === 'buy') {
      shares += e.shares; cost += e.shares * e.price;
      events.push(e);
      continue;
    }
    const q = Math.min(e.shares, shares);
    oversold += e.shares - q;
    if (q <= 0) continue;
    const avg = cost / shares;
    realized += q * (e.price - avg);
    cost -= q * avg;
    shares -= q;
    events.push({ ...e, shares: q });
  }
  if (shares < 1e-9) { shares = 0; cost = 0; }
  return { shares, cost, realized, oversold, events };
}

export function sharesOf(position) { return ledger(position).shares; }
export function costOf(position)   { return ledger(position).cost; }

/**
 * Foto del portafolio con los precios de ahora.
 * - unrealized: lo que ganas (o pierdes) con lo que todavía tienes
 * - realized:   lo que ya ganaste (o perdiste) al vender
 * - totalGain:  ambas
 * `complete` es falso si falta el precio de algún activo: en ese caso los
 * totales y pesos son parciales y no deben usarse para aconsejar.
 */
export function summarize({ positions = {}, market = {}, cash = 0 }) {
  const holdings = [];
  const missingPrices = [];
  let realized = 0, boughtEver = 0;

  for (const ticker of Object.keys(positions ?? {})) {
    const L = ledger(positions[ticker]);
    realized += L.realized;
    boughtEver += sum(L.events.filter(e => e.kind === 'buy'), e => e.shares * e.price);
    if (L.shares <= 0) continue;

    const m = market?.[ticker] ?? {};
    const price = pos(+m.currentPrice) ? +m.currentPrice : null;
    if (price === null) missingPrices.push(ticker);

    const value = price !== null ? L.shares * price : null;
    const chg = m.changePercent !== null && fin(+m.changePercent) && +m.changePercent > -100 ? +m.changePercent : null;
    const todayUsd = value !== null && chg !== null ? L.shares * (price - price / (1 + chg / 100)) : null;

    holdings.push({
      ticker, shares: L.shares, cost: L.cost, realized: L.realized,
      avgPrice: L.cost / L.shares,
      price, value,
      gain: value !== null ? value - L.cost : null,
      gainPct: value !== null ? ((value - L.cost) / L.cost) * 100 : null,
      changePercent: chg,
      todayUsd,
      weight: null,
    });
  }

  const priced = holdings.filter(h => h.value !== null);
  const stocksValue = sum(priced, h => h.value);
  const pricedCost  = sum(priced, h => h.cost);
  for (const h of priced) h.weight = stocksValue > 0 ? (h.value / stocksValue) * 100 : 0;
  holdings.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

  const today = sum(priced.filter(h => h.todayUsd !== null), h => h.todayUsd);
  const unrealized = stocksValue - pricedCost;
  const cashN = pos(+cash) ? +cash : 0;
  const yesterday = stocksValue - today;
  const totalGain = unrealized + realized;

  return {
    holdings, missingPrices,
    complete: missingPrices.length === 0,
    invested: sum(holdings, h => h.cost),
    stocksValue,
    cash: cashN,
    total: stocksValue + cashN,
    unrealized,
    unrealizedPct: pricedCost > 0 ? (unrealized / pricedCost) * 100 : null,
    realized,
    totalGain,
    // % sobre todo lo que alguna vez compraste: incluye lo ya vendido.
    totalGainPct: boughtEver > 0 ? (totalGain / boughtEver) * 100 : null,
    // `gain`/`gainPct`: ganancia de lo que aún tienes (sin lo ya vendido).
    gain: unrealized,
    gainPct: pricedCost > 0 ? (unrealized / pricedCost) * 100 : null,
    today,
    todayPct: yesterday > 0 ? (today / yesterday) * 100 : null,
  };
}

// Primer día del mes de `today` (YYYY-MM-DD).
export function monthStart(today) { return today.slice(0, 8) + '01'; }

function prevDay(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Precio de un activo al cierre del mes anterior, reconstruido del historial:
// cada registro guarda el % de ganancia sobre el costo medio de ESE día, así
// que el costo medio se recalcula con las operaciones hasta esa fecha.
function priceFromHistory(history, ticker, before, position) {
  const rows = (history ?? [])
    .filter(r => typeof r?.fecha === 'string' && r.fecha < before)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  for (const r of rows) {
    const rend = r.rendimientos?.[ticker];
    if (rend === null || rend === undefined || !fin(+rend)) continue;
    const L = ledger(position, { until: r.fecha });
    if (!(L.shares > 0)) continue;
    return (L.cost / L.shares) * (1 + +rend / 100);
  }
  return null;
}

/**
 * ¿Por qué subí o bajé este mes? Ganancia o pérdida por movimiento de precio,
 * en USD, activo por activo. No incluye aportes: el dinero nuevo no es ganancia.
 *
 * Identidad de flujos, por activo:
 *     acciones_al_inicio × (precio_hoy − precio_inicio)
 *   + Σ compras del mes × (precio_hoy − precio_compra)
 *   + Σ ventas del mes  × (precio_venta − precio_hoy)
 * Así una venta cuenta a su precio real y una compra sólo desde que se hizo.
 */
export function monthAttribution({ positions = {}, market = {}, history = [], today }) {
  const start = monthStart(today);
  const byTicker = [];
  let source = null;

  for (const ticker of Object.keys(positions ?? {})) {
    const price = +market?.[ticker]?.currentPrice;
    if (!pos(price)) continue;
    const position = positions[ticker];
    const { events } = ledger(position, { until: today });
    const inMonth = events.filter(e => e.date && e.date >= start);
    const startPos = ledger(position, { until: prevDay(start) });

    let usd = sum(inMonth, e => e.kind === 'buy' ? e.shares * (price - e.price) : e.shares * (e.price - price));

    if (startPos.shares > 0) {
      let startPrice = +market[ticker]?.monthStartPrice;
      let from = 'market';
      if (!pos(startPrice)) {
        startPrice = priceFromHistory(history, ticker, start, position);
        from = 'history';
      }
      // Sin precio de referencia no se puede explicar este activo: mejor
      // omitirlo que mostrar sólo una parte como si fuera el total.
      if (!pos(startPrice)) continue;
      usd += startPos.shares * (price - startPrice);
      if (source !== 'history') source = from;
    } else if (!inMonth.length) {
      continue;
    }
    byTicker.push({ ticker, usd });
  }

  byTicker.sort((a, b) => Math.abs(b.usd) - Math.abs(a.usd));
  return {
    from: start,
    // 'history' = estimado con tus registros; 'market' = precios reales.
    source: byTicker.length ? (source ?? 'purchases') : null,
    total: byTicker.length ? sum(byTicker, x => x.usd) : null,
    byTicker,
  };
}

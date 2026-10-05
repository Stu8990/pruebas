// Tu plan de inversión como dato, y lo que se deriva de él: cuánto falta para
// cada peso objetivo, dónde poner el aporte del mes, qué falta vender y qué
// hacer con cada acción. Funciones puras: sin DOM, sin red, sin estado.
//
// Reemplaza a los perfiles genéricos (conservador/equilibrado/agresivo): esos
// trataban cualquier ETF como «base estable» y mandaban el aporte a posiciones
// que el plan decidió vender.

/**
 * Plan acordado el 2 oct 2026 (/mnt/project-files/finanzas/plan-portafolio-final.md).
 * - targets: pesos objetivo sobre todo lo invertido. Varios símbolos pueden
 *   contar para el mismo objetivo (VOO y CSPX son ambos S&P 500); `buy` es en
 *   qué se pone el dinero nuevo. Los fondos suman 82 y las acciones 16,5 (el plan
 *   dice «~5-6% c/u»); el 1,5 que falta es para lo congelado.
 * - frozen: se mantiene sin comprar más; si pasa de `max` %, vender el exceso.
 * - exit: se vende antes de `deadline`; `swapTo` dice a dónde va el dinero.
 */
export const DEFAULT_PLAN = {
  targets: [
    { key: 'sp500', label: 'S&P 500', pct: 67, tickers: ['CSPX', 'VOO'], buy: 'CSPX' },
    { key: 'em',    label: 'Emergentes', pct: 15, tickers: ['EIMI'], buy: 'EIMI' },
    { key: 'msft',  label: 'Microsoft', pct: 5.5, stock: true, tickers: ['MSFT'], buy: 'MSFT' },
    { key: 'visa',  label: 'Visa', pct: 5.5, stock: true, tickers: ['VISA', 'V'], buy: 'VISA' },
    { key: 'jnj',   label: 'Johnson & Johnson', pct: 5.5, stock: true, tickers: ['JNJ'], buy: 'JNJ' },
  ],
  frozen: [{ ticker: 'NVDA', max: 10 }],
  exit: {
    deadline: '2026-12-31',
    items: [
      { ticker: 'EUNL.DE', swapTo: 'EIMI', now: true },
      { ticker: 'KO', swapTo: 'MSFT', now: true },
      { ticker: 'SCHD' }, { ticker: 'PEP' }, { ticker: 'PG' }, { ticker: 'MNST' }, { ticker: 'AMZN' },
    ],
  },
  monthly: 100,
};

const MAX_BUYS = 3;   // el plan dice «las 2-3 posiciones más por debajo»
const MIN_BUY = 10;   // XTB permite fracciones, pero $3 en un sitio no es un plan
const MIN_TRIM = 25;  // no se propone vender por menos de esto

const fin = n => Number.isFinite(n);
const round2 = n => Math.round(n * 100) / 100;
const usd = n => `$${Math.round(n).toLocaleString('en-US')}`;
const pct0 = n => `${Math.round(n)}%`;

function index(plan) {
  const byTicker = {};
  for (const t of plan.targets) for (const k of t.tickers) byTicker[k] = { kind: 'target', target: t };
  for (const f of plan.frozen) byTicker[f.ticker] = { kind: 'frozen', frozen: f };
  for (const e of plan.exit.items) byTicker[e.ticker] = { kind: 'exit', exit: e };
  return byTicker;
}

/** Qué papel tiene un símbolo en el plan: 'target' | 'frozen' | 'exit' | 'outside'. */
export function roleOf(ticker, plan = DEFAULT_PLAN) {
  return index(plan)[ticker] ?? { kind: 'outside' };
}

export function daysUntil(deadline, today) {
  return Math.round((Date.parse(deadline + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 864e5);
}

/**
 * ¿Cómo voy respecto al plan? Con precios incompletos los pesos son falsos y
 * `complete` es falso: la vista no debe mostrar barras ni montos.
 * Lo congelado ocupa espacio mientras lo tengas: si NVDA pesa 9%, los fondos
 * (S&P 500 y emergentes) ceden ese espacio en proporción y las acciones
 * mantienen su objetivo. Así objetivos + congelado (hasta su tope) suman 100%.
 * Con cada aporte NVDA pesa menos y los fondos vuelven hacia 67% y 15%.
 */
export function planStatus({ summary, plan = DEFAULT_PLAN, today }) {
  const idx = index(plan);
  const S = summary.stocksValue;
  const priced = summary.holdings.filter(h => h.value !== null);
  const w = h => (S > 0 ? (h.value / S) * 100 : 0);

  const frozen = plan.frozen.map(f => {
    const h = priced.find(x => x.ticker === f.ticker);
    const weight = h ? w(h) : 0;
    const excess = h ? h.value - (f.max / 100) * S : 0;
    return { ticker: f.ticker, weight, max: f.max, value: h?.value ?? 0, trim: excess >= MIN_TRIM ? excess : 0, held: !!h };
  }).filter(f => f.held);
  const frozenPct = frozen.reduce((s, f) => s + Math.min(f.weight, f.max), 0);
  const stockPct = plan.targets.filter(t => t.stock).reduce((s, t) => s + t.pct, 0);
  const fundPct = plan.targets.filter(t => !t.stock).reduce((s, t) => s + t.pct, 0);
  const fundScale = Math.max(0, 100 - stockPct - frozenPct) / fundPct;

  const targets = plan.targets.map(t => {
    const hs = priced.filter(h => t.tickers.includes(h.ticker));
    const value = hs.reduce((s, h) => s + h.value, 0);
    const held = hs.map(h => h.ticker);
    return { key: t.key, label: t.label, stock: !!t.stock, pct: t.pct, goal: t.stock ? t.pct : t.pct * fundScale,
      value, weight: S > 0 ? (value / S) * 100 : 0, held, buy: t.buy, isNew: !held.includes(t.buy) };
  });

  const exits = priced.filter(h => idx[h.ticker]?.kind === 'exit')
    .map(h => ({ ticker: h.ticker, value: h.value, weight: w(h), gainPct: h.gainPct, ...idx[h.ticker].exit }))
    .sort((a, b) => (b.now ? 1 : 0) - (a.now ? 1 : 0) || b.value - a.value);
  const outside = priced.filter(h => !idx[h.ticker]).map(h => ({ ticker: h.ticker, value: h.value, weight: w(h) }));
  const exitWeight = exits.reduce((s, e) => s + e.weight, 0);

  return {
    complete: summary.complete,
    targets, frozen, exits, outside, exitWeight,
    deadline: plan.exit.deadline,
    daysLeft: today ? daysUntil(plan.exit.deadline, today) : null,
  };
}

/**
 * ¿Dónde pongo el aporte? Regla del plan: a las 2-3 posiciones que estén más
 * por debajo de su peso objetivo. Nunca a algo que se va a vender ni a lo
 * congelado. Los objetivos se miden sobre el total que tendrás después de
 * aportar (lo que hoy está en la lista de venta también cuenta: ese dinero
 * vuelve al plan cuando vendas).
 * Invariante: la suma de las compras es exactamente `amount`.
 */
export function monthlyBuys({ summary, plan = DEFAULT_PLAN, amount }) {
  const A = Number(amount);
  if (!fin(A) || !(A > 0)) return { buys: [], note: null };
  if (!summary.complete) return { buys: [], note: 'Faltan precios de hoy: vuelve a intentarlo cuando se actualicen.' };

  const st = planStatus({ summary, plan });
  const T = summary.stocksValue + A;
  const gaps = st.targets
    .map(t => ({ ticker: t.buy, label: t.label, key: t.key, weight: t.weight, goal: t.goal, isNew: t.isNew,
      gap: Math.max(0, (t.goal / 100) * T - t.value) }))
    .filter(g => g.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, MAX_BUYS);

  if (!gaps.length) {
    // Todo en su peso: el aporte va al núcleo.
    const core = st.targets[0];
    return { buys: [{ ticker: core.buy, label: core.label, key: core.key, usd: round2(A), weight: core.weight, goal: core.goal, isNew: core.isNew }], note: null };
  }

  const total = gaps.reduce((s, g) => s + g.gap, 0);
  for (const g of gaps) g.usd = total >= A ? (g.gap / total) * A : g.gap;
  // Si los huecos suman menos que el aporte, lo que sobra va al más grande.
  gaps[0].usd += A - gaps.reduce((s, g) => s + g.usd, 0);

  const min = Math.min(MIN_BUY, A * 0.1);
  for (const g of gaps.slice(1)) if (g.usd < min) { gaps[0].usd += g.usd; g.usd = 0; }

  const buys = gaps.filter(g => g.usd > 0).map(g => ({ ...g, usd: round2(g.usd) }));
  const drift = round2(A - buys.reduce((s, b) => s + b.usd, 0));
  if (drift) buys[0].usd = round2(buys[0].usd + drift);
  for (const b of buys) delete b.gap;
  return { buys, note: null };
}

const LABELS = {
  comprar:   { label: 'Comprar más', tone: 'good' },
  mantener:  { label: 'Mantener', tone: 'neutral' },
  congelada: { label: 'Mantener sin comprar', tone: 'neutral' },
  recortar:  { label: 'Vender una parte', tone: 'warn' },
  vender:    { label: 'Vender (plan)', tone: 'bad' },
  fuera:     { label: 'Fuera de tu plan', tone: 'warn' },
};
export const VERDICT_LABELS = Object.values(LABELS).map(l => l.label);

/**
 * Qué hacer con cada acción según el plan. Misma forma que antes:
 * { [ticker]: { action, label, tone, amount?, reasons[] } }.
 */
export function planVerdicts({ summary, plan = DEFAULT_PLAN, today }) {
  const st = planStatus({ summary, plan, today });
  const out = {};
  for (const h of summary.holdings) {
    const role = roleOf(h.ticker, plan);
    const say = (action, reasons, amount = null) => { out[h.ticker] = { action, ...LABELS[action], amount, reasons }; };
    if (role.kind === 'exit') {
      const e = role.exit;
      const when = e.now ? 'ya' : `antes del ${fmtDate(plan.exit.deadline)}`;
      const to = e.swapTo ? ` y pasar el dinero a ${e.swapTo}` : ' y pasar el dinero a lo que esté más bajo en tu plan';
      const reasons = [`Tu plan dice venderla ${when}${to}.`];
      if (!e.now && h.gainPct !== null && h.gainPct < 0) reasons.push(`Va ${pct0(h.gainPct)}: una orden limitada cerca de tu precio de compra (${usd(h.avgPrice)}) evita vender en el peor momento. Si llega la fecha, se vende igual.`);
      say('vender', reasons, h.value);
      continue;
    }
    if (h.value === null) { say('mantener', ['Sin precio de hoy: no se puede evaluar todavía.']); continue; }
    if (role.kind === 'frozen') {
      const f = st.frozen.find(x => x.ticker === h.ticker);
      if (summary.complete && f?.trim) {
        say('recortar', [`Pesa ${pct0(f.weight)} y tu plan pone el tope en ${f.max}%. Vender unos ${usd(f.trim)} y pasarlos al S&P 500.`], f.trim);
      } else {
        say('congelada', [`Se queda, pero sin comprar más. Pesa ${pct0(f?.weight ?? h.weight ?? 0)}; si pasa de ${role.frozen.max}%, se vende el exceso.`]);
      }
      continue;
    }
    if (role.kind === 'outside') {
      say('fuera', ['No está en tu plan. Decide si la agregas a tus objetivos o la vendes para pasarla al S&P 500.']);
      continue;
    }
    const t = st.targets.find(x => x.key === role.target.key);
    if (!summary.complete) { say('mantener', ['Faltan precios de otras posiciones para comparar pesos.']); continue; }
    const where = `${t.label} pesa ${pct0(t.weight)} y tu objetivo es ${pct0(t.goal)}.`;
    if (h.ticker !== t.buy) {
      say('mantener', [`Cuenta para tu ${t.label}. ${where} Se queda; el dinero nuevo va a ${t.buy}.`]);
    } else if (t.weight < t.goal - 1) {
      say('comprar', [`${where} Los aportes van aquí hasta llegar.`]);
    } else if (t.weight > t.goal + 1) {
      say('mantener', [`${where} No le pongas más: con los aportes a lo demás bajará sola, sin vender.`]);
    } else {
      say('mantener', [`${where} Está en su sitio.`]);
    }
  }
  return out;
}

/**
 * Lo que tienes en el S&P 500 contra todo lo demás, en % sobre lo que pagaste.
 * Es la pregunta de la revisión semestral (¿mis acciones le ganan al índice?)
 * con los datos que hay: no necesita fechas de compra.
 */
export function vsIndex({ summary, plan = DEFAULT_PLAN }) {
  const core = plan.targets[0];
  const priced = summary.holdings.filter(h => h.value !== null);
  const pick = f => {
    const hs = priced.filter(f);
    const cost = hs.reduce((s, h) => s + h.cost, 0), value = hs.reduce((s, h) => s + h.value, 0);
    return cost > 0 ? { cost, value, gain: value - cost, gainPct: ((value - cost) / cost) * 100 } : null;
  };
  const index = pick(h => core.tickers.includes(h.ticker));
  const rest = pick(h => !core.tickers.includes(h.ticker));
  if (!index || !rest || !summary.complete) return null;
  return { label: core.label, index, rest, diffPp: rest.gainPct - index.gainPct };
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fmtDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

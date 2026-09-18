// Motor de recomendaciones. Reglas fijas y explicables, sin IA: cada veredicto
// dice qué hacer, con cuánto dinero y por qué, usando sólo datos reales
// (tus compras, el precio de hoy, el PER, el rango de 52 semanas y la opinión
// de los analistas). La IA, si está disponible, sólo lo redacta mejor.

export const PROFILES = {
  conservador: { label: 'Conservador', fundPct: 70, cap: 15 },
  equilibrado: { label: 'Equilibrado', fundPct: 50, cap: 20 },
  agresivo:    { label: 'Agresivo',    fundPct: 30, cap: 30 },
};

// ETFs amplios habituales en XTB. Yahoo también informa quoteType: 'ETF'.
const KNOWN_FUNDS = new Set([
  'VOO', 'SPY', 'IVV', 'SPLG', 'VTI', 'ITOT', 'SCHB', 'SCHX', 'QQQ', 'QQQM', 'SCHD', 'VIG', 'VYM',
  'DIA', 'IWM', 'VT', 'VXUS', 'VEA', 'VWO', 'IEFA', 'IEMG', 'BND', 'AGG', 'VUG', 'VTV', 'SCHG',
  'CSPX', 'VUAA', 'VWCE', 'IWDA', 'SXR8', 'EUNL',
]);
export const DEFAULT_FUND = 'VOO';

export function isFund(ticker, m = {}) {
  if (m?.quoteType) return m.quoteType === 'ETF' || m.quoteType === 'MUTUALFUND';
  return KNOWN_FUNDS.has(String(ticker).toUpperCase());
}

const LABELS = {
  comprar:  { label: 'Comprar más',               tone: 'good' },
  mantener: { label: 'Mantener',                  tone: 'neutral' },
  esperar:  { label: 'No compres más por ahora',  tone: 'warn' },
  recortar: { label: 'Vender una parte',          tone: 'warn' },
  revisar:  { label: 'Revisar: ¿vender?',         tone: 'bad' },
};

const MIN_TRIM = 25;     // no se propone vender por menos de esto
const MIN_GAP_PP = 5;    // «comprar más» sólo si está claramente por debajo (5 puntos)

const usd = n => `$${Math.round(n).toLocaleString('en-US')}`;
const pct0 = n => `${Math.round(n)}%`;

function profileOf(name) { return PROFILES[name] ?? PROFILES.equilibrado; }

// Posición del precio dentro de su rango de 52 semanas (0 = mínimo, 1 = máximo).
function rangePos(m) {
  const lo = +m?.week52Low, hi = +m?.week52High, p = +m?.currentPrice;
  if (!(hi > lo) || !(p > 0)) return null;
  return (p - lo) / (hi - lo);
}

// Peso objetivo (% del dinero en acciones) de cada posición según el perfil.
function targets(market, profile, eligible) {
  const p = profileOf(profile);
  const funds  = eligible.filter(h => isFund(h.ticker, market[h.ticker]));
  const stocks = eligible.filter(h => !isFund(h.ticker, market[h.ticker]));
  const fundPct = stocks.length ? p.fundPct : 100;
  const stockPct = 100 - fundPct;
  const out = {};
  for (const h of funds) out[h.ticker] = fundPct / funds.length;
  for (const h of stocks) out[h.ticker] = Math.min(p.cap, stockPct / stocks.length);
  return { byTicker: out, fundPct, hasFunds: funds.length > 0 };
}

/**
 * Veredicto por acción. Devuelve { [ticker]: { action, label, tone, amount?, reasons[] } }.
 */
export function verdicts({ summary, market = {}, profile = 'equilibrado' }) {
  const p = profileOf(profile);
  const S = summary.stocksValue;
  const out = {};

  for (const h of summary.holdings) {
    const m = market[h.ticker] ?? {};
    const fund = isFund(h.ticker, m);
    const reasons = [];
    let action = null, amount = null;

    if (h.value === null) {
      out[h.ticker] = { action: 'mantener', ...LABELS.mantener, reasons: ['Sin precio de hoy: no se puede evaluar todavía.'] };
      continue;
    }

    // 1) Revisar: señales de que la tesis puede estar rota.
    if (!fund && m.analystRating === 'VENDER') {
      action = 'revisar';
      reasons.push('La mayoría de analistas recomienda vender esta acción.');
    } else if (!fund && h.gainPct <= -30 && m.analystRating === 'MANTENER') {
      // Una pérdida sola nunca pide vender: sólo cuando además los analistas
      // dejaron de recomendarla.
      action = 'revisar';
      reasons.push(`Vas perdiendo ${pct0(-h.gainPct)} desde que compraste y los analistas ya no la recomiendan comprar.`);
      reasons.push('Pregúntate si sigues creyendo en la empresa. Si no, venderla y pasar el dinero a un fondo es razonable.');
    }

    // 2) Vender una parte: demasiado peso en una sola empresa.
    const excess = h.value - (p.cap / 100) * S;
    if (!action && summary.complete && !fund && h.weight > p.cap && excess >= MIN_TRIM) {
      action = 'recortar';
      amount = excess;
      reasons.push(`Pesa ${pct0(h.weight)} de tu dinero en acciones. Con perfil ${p.label.toLowerCase()}, lo sano es no pasar de ${p.cap}% en una sola empresa.`);
      reasons.push(`Vender unos ${usd(amount)} y pasarlos a lo que está por debajo de su peso reduce el riesgo si esta empresa cae.`);
      if (h.gain > 0) reasons.push('Como vas ganando, estarías asegurando parte de esa ganancia.');
    }

    // 3) Esperar: cara y en máximos del año.
    const pe = m.forwardPe > 0 ? +m.forwardPe : +m.pe;
    const pos = rangePos(m);
    if (!action && !fund && pe > 35 && pos !== null && pos >= 0.9) {
      action = 'esperar';
      reasons.push(`Está cerca de su precio máximo del año y cara: pagas unas ${Math.round(pe)} veces lo que la empresa gana en un año.`);
      reasons.push('No hace falta vender, pero no es buen momento para comprar más.');
    }

    if (!action) {
      action = 'mantener';
      if (h.gainPct <= -15 && m.analystRating === 'COMPRAR') {
        reasons.push(`Baja ${pct0(-h.gainPct)} desde tu compra, pero los analistas siguen recomendándola. Vender ahora sería fijar la pérdida.`);
      } else if (fund) {
        reasons.push('Es un fondo que reparte tu dinero entre muchas empresas: es la base estable de tu cartera.');
      } else {
        reasons.push('Nada fuera de lo normal: peso razonable y sin señales de alarma.');
      }
    }

    out[h.ticker] = { action, ...LABELS[action], amount, reasons };
  }

  // 4) Comprar más: lo que está por debajo de su peso objetivo y no tiene alertas.
  //    Con precios incompletos los pesos son falsos: no se sugiere nada.
  if (!summary.complete) return out;
  const eligible = summary.holdings.filter(h => h.value !== null && out[h.ticker].action === 'mantener');
  const t = targets(market, profile, eligible);
  for (const h of eligible) {
    const target = t.byTicker[h.ticker];
    if (target && h.weight < target - MIN_GAP_PP) {
      out[h.ticker] = {
        ...out[h.ticker], action: 'comprar', ...LABELS.comprar,
        reasons: [`Pesa ${pct0(h.weight)} y su peso objetivo es ${pct0(target)}. Tu próximo aporte debería ir aquí.`, ...out[h.ticker].reasons],
      };
    }
  }
  return out;
}

/**
 * ¿Dónde pongo mi próximo aporte? Reparte `amount` hacia lo que más lejos está
 * de su peso objetivo, sin tocar lo que conviene recortar, revisar o esperar.
 * Invariantes: se reparte exactamente `amount` y ninguna acción individual
 * termina por encima de su tope; lo que sobra va a los fondos, que no tienen tope.
 */
export function planContribution({ summary, market = {}, profile = 'equilibrado', amount }) {
  const A = Number(amount);
  if (!Number.isFinite(A) || !(A > 0)) return { buys: [], note: null };
  if (!summary.complete) return { buys: [], note: 'Faltan precios de hoy: vuelve a intentarlo cuando se actualicen.' };

  const v = verdicts({ summary, market, profile });
  const eligible = summary.holdings.filter(h => ['comprar', 'mantener'].includes(v[h.ticker]?.action));
  const t = targets(market, profile, eligible);
  const T = summary.stocksValue + A;

  const dest = eligible.map(h => ({
    ticker: h.ticker, isNew: false, fund: isFund(h.ticker, market[h.ticker]),
    target: t.byTicker[h.ticker],
    gap: Math.max(0, (t.byTicker[h.ticker] / 100) * T - h.value),
  }));
  const hasStocks = dest.some(d => !d.fund);
  let note = null;
  if (!dest.some(d => d.fund)) {
    // Sin fondos en cartera (o todo lo demás marcado): la base es un ETF amplio.
    dest.push({ ticker: DEFAULT_FUND, isNew: true, fund: true, target: t.fundPct, gap: (t.fundPct / 100) * T });
    if (hasStocks || summary.holdings.length) {
      note = `No tienes ningún fondo indexado. ${DEFAULT_FUND} (las 500 empresas más grandes de EE. UU.) es la base que suele recomendarse.`;
    }
  }

  const totalGap = dest.reduce((s, d) => s + d.gap, 0);
  for (const d of dest) d.usd = totalGap >= A ? (d.gap / totalGap) * A : d.gap;

  // Lo que sobra tras llenar los huecos va a los fondos, repartido por su objetivo.
  const funds = dest.filter(d => d.fund);
  let rest = A - dest.reduce((s, d) => s + d.usd, 0);
  if (rest > 1e-9) {
    const w = funds.reduce((s, d) => s + d.target, 0);
    for (const d of funds) d.usd += w > 0 ? (d.target / w) * rest : rest / funds.length;
  }

  // Sin montos ridículos: lo menor a $10 (o 5% del aporte) se suma al fondo mayor.
  const min = Math.min(10, A * 0.05);
  const sink = [...funds].sort((a, b) => b.usd - a.usd)[0];
  for (const d of dest) {
    if (d !== sink && d.usd > 0 && d.usd < min) { sink.usd += d.usd; d.usd = 0; }
  }

  const buys = dest.filter(d => d.usd > 0.004).sort((a, b) => b.usd - a.usd)
    .map(d => ({ ticker: d.ticker, usd: Math.round(d.usd * 100) / 100, isNew: d.isNew, target: d.target }));
  // El redondeo a centavos no puede cambiar el total.
  const drift = Math.round((A - buys.reduce((s, b) => s + b.usd, 0)) * 100) / 100;
  if (buys.length && drift) {
    const f = buys.find(b => b.ticker === sink.ticker) ?? buys[0];
    f.usd = Math.round((f.usd + drift) * 100) / 100;
  }
  return { buys, note };
}

/**
 * Lo más importante que hacer hoy, en orden. Si no hay nada, lo dice.
 */
export function todayActions({ summary, market = {}, profile = 'equilibrado' }) {
  if (!summary.holdings.length) {
    return [{ kind: 'vacio', label: 'Anota tus acciones', tone: 'neutral', reason: 'Cuando anotes lo que compraste en XTB podré decirte qué hacer con cada una.' }];
  }
  if (!summary.complete) {
    return [{ kind: 'incompleto', label: 'Faltan precios', tone: 'neutral',
      reason: `No tengo el precio de hoy de ${summary.missingPrices.join(', ')}. Sin él no puedo evaluar tu cartera completa.` }];
  }
  const v = verdicts({ summary, market, profile });
  const rank = { revisar: 0, recortar: 1 };
  const list = Object.entries(v)
    .filter(([, x]) => x.action in rank)
    .sort(([, a], [, b]) => rank[a.action] - rank[b.action] || (b.amount ?? 0) - (a.amount ?? 0))
    .map(([ticker, x]) => ({ kind: x.action, ticker, label: x.label, tone: x.tone, amount: x.amount, reason: x.reasons[0] }));
  if (!list.length) {
    return [{ kind: 'nada', label: 'Nada urgente', tone: 'good', reason: 'Tu cartera está equilibrada y sin alertas. Lo mejor que puedes hacer hoy es no tocar nada.' }];
  }
  return list;
}

/**
 * ¿Me conviene comprar esta acción? Una sola respuesta para una acción que el
 * usuario está mirando. `quote` es lo que devuelve market-data para ese símbolo.
 */
export function evaluateCandidate({ summary, market = {}, profile = 'equilibrado', ticker, quote = {} }) {
  const p = profileOf(profile);
  if (summary.holdings.some(h => h.ticker === ticker)) {
    const v = verdicts({ summary, market: { ...market, [ticker]: { ...market[ticker], ...quote } }, profile })[ticker];
    return { ...v, owned: true };
  }

  if (!(+quote.currentPrice > 0)) {
    return { action: 'sin_datos', label: 'Sin datos', tone: 'neutral', owned: false,
      reasons: ['No hay precio disponible para este símbolo ahora mismo.'] };
  }
  const fund = isFund(ticker, quote);
  const reasons = [];
  if (!fund && quote.analystRating === 'VENDER') {
    return { action: 'evitar', label: 'Mejor no', tone: 'bad', owned: false,
      reasons: ['La mayoría de analistas recomienda vender esta acción.'] };
  }
  const pe = quote.forwardPe > 0 ? +quote.forwardPe : +quote.pe;
  const pos = rangePos(quote);
  if (!fund && pe > 35 && pos !== null && pos >= 0.9) {
    return { action: 'esperar', label: 'Espera', tone: 'warn', owned: false,
      reasons: [`Está cerca de su máximo del año y cara (pagas unas ${Math.round(pe)} veces lo que gana en un año). Si te interesa, espera una caída.`] };
  }

  const S = summary.stocksValue;
  const cap = p.cap / 100;
  const maxUsd = fund || !summary.complete ? null : (S > 0 ? (cap * S) / (1 - cap) : null);
  if (fund) reasons.push('Es un fondo: reparte tu dinero entre muchas empresas y reduce el riesgo.');
  if (quote.analystRating === 'COMPRAR') reasons.push('La mayoría de analistas recomienda comprarla.');
  if (pe > 0) reasons.push(pe <= 20
    ? `Precio razonable: pagas unas ${Math.round(pe)} veces lo que gana en un año.`
    : `No es barata: pagas unas ${Math.round(pe)} veces lo que gana en un año; tiene que seguir creciendo para valerlo.`);
  if (maxUsd) reasons.push(`Para no concentrar demasiado, no pongas más de ${usd(maxUsd)} (un ${p.cap}% de tu dinero en acciones).`);
  return { action: 'encaja', label: 'Puede encajar', tone: 'good', owned: false, maxUsd, reasons };
}

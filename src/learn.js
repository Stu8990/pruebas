import { ASSETS, ASSET_META } from './config.js';
import { getAllAssets } from './assets.js';
import { Store } from './store.js';
import { pct, pp } from './utils.js';

// Average rendimientos for given tickers, ignoring nulls
function avgRend(rend, tickers) {
  const vals = tickers.map(t => rend[t]).filter(v => v !== null && v !== undefined && !isNaN(v));
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

// Get user's actual tickers grouped by sector (base + custom)
function tickersBySector(sector) {
  return getAllAssets().filter(a => a.sector === sector).map(a => a.ticker);
}

// Short display name for an asset
function shortName(ticker) {
  return ASSET_META[ticker]?.full?.split(' ')[0] || ticker;
}

export const Learn = {
  s: { phases:[], riskScore:0.5, assetScores:{}, injections:[], confidence:0 },

  train(history) {
    this._phases(history);
    this._injections(history);
    this._scores(history);
    this._risk(history);
    this._conf(history);
  },

  _phases(h) {
    this.s.phases = [];
    for (let i = 1; i < h.length; i++) {
      const c = ((h[i].valor_total_usd - h[i-1].valor_total_usd) / h[i-1].valor_total_usd) * 100;
      if (Math.abs(c) > 0.5) this.s.phases.push({ date: h[i].fecha, chg: c, type: c > 0 ? 'up' : 'down' });
    }
  },

  _injections(h) {
    this.s.injections = [];
    for (let i = 1; i < h.length; i++) {
      const d = h[i].valor_total_usd - h[i-1].valor_total_usd;
      if (d > h[i-1].valor_total_usd * 0.2)
        this.s.injections.push({ date: h[i].fecha, amount: d, total: h[i].valor_total_usd });
    }
  },

  _scores(h) {
    const sc = {};
    // Use ALL assets (base + custom) instead of hardcoded ASSETS array
    getAllAssets().forEach(({ ticker: a }) => {
      const v = h.map(r => r.rendimientos[a]).filter(x => x !== null && x !== undefined && !isNaN(x));
      if (!v.length) return;
      const avg    = v.reduce((s, x) => s + x, 0) / v.length;
      const rec    = v.slice(-3);
      const recAvg = rec.reduce((s, x) => s + x, 0) / rec.length;
      sc[a] = { avg, recAvg, score: avg * 0.4 + recAvg * 0.6 };
    });
    this.s.assetScores = sc;
  },

  _risk(h) {
    const c = [];
    for (let i = 1; i < h.length; i++)
      c.push(((h[i].valor_total_usd - h[i-1].valor_total_usd) / h[i-1].valor_total_usd) * 100);
    if (!c.length) return;
    this.s.riskScore = Math.min(.92, .45 + Math.abs(Math.min(...c)) * .04 + (h.length > 5 ? .1 : 0) + (this.s.injections.length * .08));
  },

  _conf(h) {
    this.s.confidence = Math.min(95, h.length * 7 + this.s.injections.length * 9 + this.s.phases.length * 1.5);
  },

  insight(cur, prv) {
    if (!cur) return 'Registra tu primera sesión para activar el análisis.';
    const delta = prv ? ((cur.valor_total_usd - prv.valor_total_usd) / prv.valor_total_usd) * 100 : 0;
    const lines = [];

    // Portfolio movement
    if (!prv)           lines.push('Primera sesión registrada. Seguiré tu portafolio desde aquí.');
    else if (delta > 0.5)  lines.push(`Tu portafolio ganó ${pct(delta)} en esta sesión — buen resultado.`);
    else if (delta < -0.5) lines.push(`Tu portafolio bajó ${pct(delta)} en esta sesión. Es normal en bolsa; lo importante es la tendencia de largo plazo.`);
    else                   lines.push(`Sesión de consolidación (${pct(delta)}). El mercado tomó un respiro.`);

    // Dynamic sector analysis using user's actual holdings
    const tech = avgRend(cur.rendimientos, tickersBySector('Tech'));
    const def  = avgRend(cur.rendimientos, tickersBySector('Defense'));

    if (tech !== null && def !== null) {
      if (def > tech + 3)   lines.push(`Tus defensivos protegen el portafolio mientras tecnología está débil.`);
      else if (tech > 5)    lines.push(`Tecnología lidera con promedio de ${pct(tech)}.`);
    } else if (tech !== null && tech > 5) {
      lines.push(`Tecnología lidera con promedio de ${pct(tech)}.`);
    }

    // Best performing asset from historical scores
    const sorted = Object.entries(this.s.assetScores).sort(([,a],[,b]) => b.score - a.score);
    if (sorted.length && this.s.confidence > 40) {
      const name = ASSET_META[sorted[0][0]]?.full || sorted[0][0];
      lines.push(`Históricamente, ${name} es tu activo más consistente.`);
    }

    return lines.join(' ');
  },

  recommendations(cur, prv) {
    if (!cur) return [];
    const recs = [];
    const sc     = this.s.assetScores;
    const sorted = Object.entries(sc).filter(([,s]) => s).sort(([,a],[,b]) => b.score - a.score);

    // Not enough sessions — educate first
    if (Store.history.length < 2) {
      recs.push({ type:'blue', icon:'📝', title:'Necesito más datos para analizarte',
        body:'Registra al menos 2–3 sesiones para que el algoritmo identifique patrones en tu portafolio. Cuantas más sesiones, más precisas las recomendaciones.',
        conf: 99 });
      return recs;
    }

    // Best asset
    if (sorted.length) {
      const [best, bs] = sorted[0];
      const name = ASSET_META[best]?.full || best;
      recs.push({ type:'green', icon:'🚀', title:`${name} es tu estrella`,
        body:`Rendimiento promedio ${pct(bs.avg)} · últimas sesiones ${pct(bs.recAvg)}. ${bs.recAvg > bs.avg ? 'Está acelerando — buen momento para monitorearla.' : 'Tendencia estable. Mantén posición.'}`,
        conf: Math.min(95, this.s.confidence + 5) });
    }

    // Worst asset — only if clearly negative
    if (sorted.length > 1) {
      const [wKey, ws] = sorted.at(-1);
      if (ws.score < -3) {
        const name = ASSET_META[wKey]?.full || wKey;
        recs.push({ type:'red', icon:'⚠️', title:`${name} bajo presión`,
          body:`Promedio ${pct(ws.avg)} en tus sesiones registradas. Antes de vender: ¿el negocio sigue siendo bueno? Las caídas temporales son normales. No vendas por pánico.`,
          conf: this.s.confidence });
      }
    }

    // Dynamic sector comparison — only if user actually has both Tech + Defense
    const techTickers = tickersBySector('Tech');
    const defTickers  = tickersBySector('Defense');
    const tech = avgRend(cur.rendimientos, techTickers);
    const def  = avgRend(cur.rendimientos, defTickers);

    if (tech !== null && def !== null && def > tech + 5) {
      const defNames  = defTickers.slice(0, 2).map(shortName).join(' y ');
      const techNames = techTickers.slice(0, 3).join(', ');
      recs.push({ type:'amber', icon:'🔄', title:'Tus defensivos compensan tecnología',
        body:`${defNames} (${pct(def)}) compensa la debilidad de ${techNames} (${pct(tech)}). El mercado está en modo precavido. Mantén el balance.`,
        conf: Math.min(90, this.s.confidence + 2) });
    }

    // Portfolio growth + risk profile — only if enough sessions
    if (this.s.injections.length > 0 || Store.history.length >= 4) {
      const first      = Store.history[0]?.valor_total_usd || 1;
      const last       = Store.history.at(-1)?.valor_total_usd || 1;
      const growth     = ((last - first) / first) * 100;
      const riskLbl    = this.s.riskScore > 0.7 ? 'tolerancia alta al riesgo' : this.s.riskScore > 0.5 ? 'moderado' : 'conservador';
      const injText    = this.s.injections.length > 0 ? `${this.s.injections.length} aumento(s) de capital detectados. ` : '';
      recs.push({ type:'purple', icon:'🧠', title:'El algoritmo ya te conoce',
        body:`${injText}Tu portafolio cambió ${pct(growth)} desde el inicio. Perfil: inversor ${riskLbl}. Confianza del análisis: ${this.s.confidence.toFixed(0)}%.`,
        conf: this.s.confidence });
    }

    // PER tip — only when user has few sessions (educational context)
    if (Store.history.length < 6) {
      recs.push({ type:'blue', icon:'📊', title:'Tip: revisa el PER antes de comprar más',
        body:'El PER dice cuántos años de ganancias estás pagando por una empresa. Menos de 18: posible oportunidad. Más de 25: solo si el crecimiento lo justifica.',
        conf: 80 });
    }

    return recs;
  },

  pulse() {
    const cur = Store.cur();
    if (!cur) return [];

    const techTickers = tickersBySector('Tech');
    const defTickers  = tickersBySector('Defense');
    const coreTickers = tickersBySector('Core');
    const tech = avgRend(cur.rendimientos, techTickers);
    const def  = avgRend(cur.rendimientos, defTickers);
    const core = avgRend(cur.rendimientos, coreTickers);

    const ups   = this.s.phases.filter(p => p.type === 'up').length;
    const total = this.s.phases.length || 1;

    const cards = [];

    if (tech !== null) {
      cards.push({ label:'Tecnología', value:pct(tech), up:tech>=0,
        desc: techTickers.slice(0,3).map(shortName).join(' · ') });
    }
    if (def !== null) {
      cards.push({ label:'Defensivos', value:pct(def), up:def>=0,
        desc: defTickers.slice(0,2).map(shortName).join(' · ') });
    }
    if (core !== null) {
      cards.push({ label:'Core / Índices', value:pct(core), up:core>=0,
        desc: coreTickers.slice(0,3).join(' · ') });
    }

    // Portfolio total growth
    const first = Store.history[0]?.valor_total_usd;
    const last  = Store.history.at(-1)?.valor_total_usd;
    if (first && last && Store.history.length > 1) {
      const growth = ((last - first) / first) * 100;
      cards.push({ label:'Crecimiento total', value:pct(growth), up:growth>=0,
        desc:`Desde ${Store.history[0].fecha}` });
    }

    // Fill to 4 with confidence if needed
    if (cards.length < 4) {
      cards.push({ label:'Sesiones positivas', value:`${Math.round(ups/total*100)}%`,
        up:ups>total/2, desc:`${ups} de ${this.s.phases.length} días registrados` });
    }

    return cards.slice(0, 4);
  },
};

export function generateDescription(newRecord) {
  const prv = Store.history.at(-1);
  if (!prv) return `Primera sesión · ${newRecord.fecha}`;
  const pctChange = ((newRecord.valor_total_usd - prv.valor_total_usd) / prv.valor_total_usd) * 100;

  // Use all assets including custom ones
  const allAssets = getAllAssets();
  const changes = allAssets
    .filter(({ ticker: a }) =>
      newRecord.rendimientos[a] !== null && newRecord.rendimientos[a] !== undefined &&
      prv.rendimientos[a]       !== null && prv.rendimientos[a]       !== undefined)
    .map(({ ticker: a }) => ({
      a, name: ASSET_META[a]?.full?.split(' ')[0] || a,
      delta: (newRecord.rendimientos[a]||0) - (prv.rendimientos[a]||0),
      cur:    newRecord.rendimientos[a]||0,
    }))
    .sort((x, y) => y.delta - x.delta);

  const best  = changes[0];
  const worst = changes.at(-1);
  const tone  = pctChange > 0.5 ? 'Jornada positiva' : pctChange < -0.5 ? 'Jornada a la baja' : 'Jornada de consolidación';
  let desc    = `${tone} (${pctChange>=0?'+':''}${pctChange.toFixed(1)}% portafolio)`;
  if (best)  desc += ` · ${best.name} lidera ${pct(best.cur)}`;
  if (worst && worst.delta < -1) desc += ` · ${worst.name} bajo presión (${pp(worst.delta)})`;
  return desc;
}

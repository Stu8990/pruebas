import { ASSETS, ASSET_META } from './config.js';
import { Store } from './store.js';
import { pct, pp } from './utils.js';

export const Learn = {
  s: { phases:[], riskScore:0.5, assetScores:{}, injections:[], confidence:0 },

  train(history) {
    this._phases(history); this._injections(history);
    this._scores(history); this._risk(history); this._conf(history);
  },

  _phases(h) {
    this.s.phases = [];
    for (let i=1; i<h.length; i++) {
      const c = ((h[i].valor_total_usd - h[i-1].valor_total_usd) / h[i-1].valor_total_usd) * 100;
      if (Math.abs(c) > 0.5) this.s.phases.push({ date: h[i].fecha, chg: c, type: c > 0 ? 'up' : 'down' });
    }
  },

  _injections(h) {
    this.s.injections = [];
    for (let i=1; i<h.length; i++) {
      const d = h[i].valor_total_usd - h[i-1].valor_total_usd;
      if (d > h[i-1].valor_total_usd * 0.2)
        this.s.injections.push({ date: h[i].fecha, amount: d, total: h[i].valor_total_usd });
    }
  },

  _scores(h) {
    const sc = {};
    ASSETS.forEach(a => {
      const v = h.map(r => r.rendimientos[a]).filter(x => x !== null && x !== undefined && !isNaN(x));
      if (!v.length) return;
      const avg = v.reduce((s,x)=>s+x,0) / v.length;
      const rec = v.slice(-3); const recAvg = rec.reduce((s,x)=>s+x,0) / rec.length;
      sc[a] = { avg, recAvg, score: avg * 0.4 + recAvg * 0.6 };
    });
    this.s.assetScores = sc;
  },

  _risk(h) {
    const c = [];
    for (let i=1; i<h.length; i++) c.push(((h[i].valor_total_usd - h[i-1].valor_total_usd) / h[i-1].valor_total_usd) * 100);
    if (!c.length) return;
    this.s.riskScore = Math.min(.92, .45 + Math.abs(Math.min(...c)) * .04 + (h.length > 5 ? .1 : 0) + (this.s.injections.length * .08));
  },

  _conf(h) {
    this.s.confidence = Math.min(95, h.length * 7 + this.s.injections.length * 9 + this.s.phases.length * 1.5);
  },

  insight(cur, prv) {
    const delta = prv ? ((cur.valor_total_usd - prv.valor_total_usd) / prv.valor_total_usd) * 100 : 0;
    const tech = Store.avg(cur, ['NVDA','MSFT','AMZN']), def = Store.avg(cur, ['MNST','SCHD']);
    const lines = [];
    if (delta > 0.5) lines.push(`Tu portafolio ganó ${pct(delta)} en esta sesión — buen resultado.`);
    else if (delta < -0.5) lines.push(`Tu portafolio bajó ${pct(delta)} en esta sesión. Es normal en bolsa; lo importante es la tendencia de largo plazo.`);
    else lines.push(`Sesión de pausa (${pct(delta)}). El mercado tomó un respiro.`);
    if (def !== null && tech !== null && def > tech + 3)
      lines.push(`Tus defensivos (Monster y SCHD) están protegiendo el portafolio mientras tecnología está débil.`);
    else if (tech !== null && tech > 5)
      lines.push(`Tecnología empuja hacia arriba con promedio de ${pct(tech)}.`);
    const sorted = Object.entries(this.s.assetScores).sort(([,a],[,b]) => b.score - a.score);
    if (sorted.length && this.s.confidence > 40)
      lines.push(`Históricamente, ${ASSET_META[sorted[0][0]]?.full || sorted[0][0]} es tu acción más consistente.`);
    return lines.join(' ');
  },

  recommendations(cur, prv) {
    const recs = [], sc = this.s.assetScores;
    const sorted = Object.entries(sc).filter(([,s]) => s).sort(([,a],[,b]) => b.score - a.score);
    const tech = Store.avg(cur, ['NVDA','MSFT','AMZN']), def = Store.avg(cur, ['MNST','SCHD']);

    if (sorted.length) {
      const [best, bs] = sorted[0];
      recs.push({ type:'green', icon:'🚀', title:`${ASSET_META[best]?.full || best} es tu estrella`,
        body:`Con rendimiento promedio de ${pct(bs.avg)} y ${pct(bs.recAvg)} en los últimos registros. ${bs.recAvg > bs.avg ? 'Está acelerando — buen momento para monitorearla.' : 'Mantén posición.'}`,
        conf: Math.min(95, this.s.confidence + 5) });
    }
    const worst = sorted.at(-1);
    if (worst && worst[1].score < -3) {
      recs.push({ type:'red', icon:'⚠️', title:`${ASSET_META[worst[0]]?.full || worst[0]} necesita atención`,
        body:`Rendimiento promedio de ${pct(worst[1].avg)}. Antes de vender: ¿el negocio sigue funcionando? ¿Es una caída temporal? No vendas por pánico.`,
        conf: this.s.confidence });
    }
    if (def !== null && tech !== null && def > tech + 5) {
      recs.push({ type:'amber', icon:'🔄', title:'Tus defensivos están salvando el portafolio',
        body:`Monster (${pct(cur.rendimientos.MNST)}) y SCHD (${pct(cur.rendimientos.SCHD)}) compensan la debilidad de tecnología. El mercado está precavido. Mantén el balance.`,
        conf: Math.min(90, this.s.confidence + 2) });
    }
    if (this.s.injections.length > 0) {
      const first = Store.history[0]?.valor_total_usd || 1, last = Store.history.at(-1)?.valor_total_usd || 1;
      const riskLbl = this.s.riskScore > 0.7 ? 'con tolerancia al riesgo' : this.s.riskScore > 0.5 ? 'moderado' : 'conservador';
      recs.push({ type:'purple', icon:'🧠', title:'El algoritmo ya te conoce',
        body:`Detecté ${this.s.injections.length} aumento(s) de capital. Tu portafolio cambió ${pct(((last-first)/first)*100)} desde el inicio. Perfil: inversor ${riskLbl}. Confianza ${this.s.confidence.toFixed(0)}%.`,
        conf: this.s.confidence });
    }
    recs.push({ type:'blue', icon:'📊', title:'Tip: usa el PER como filtro antes de comprar',
      body:'Antes de cualquier acción nueva, revisa su PER. Menos de 18 puede ser oportunidad. Más de 25 exige entender por qué la empresa merece ese precio.',
      conf: 99 });
    return recs;
  },

  pulse() {
    const cur = Store.cur();
    const tech = Store.avg(cur, ['NVDA','MSFT','AMZN']), def = Store.avg(cur, ['MNST','SCHD']);
    const ups = this.s.phases.filter(p => p.type === 'up').length, total = this.s.phases.length || 1;
    return [
      { label:'Mis acciones tech',     value:pct(tech), up:tech>=0,  desc:'NVDA · MSFT · AMZN' },
      { label:'Mis defensivos',         value:pct(def),  up:def>=0,   desc:'Monster · SCHD' },
      { label:'Sesiones positivas',     value:`${Math.round(ups/total*100)}%`, up:ups>total/2, desc:`${ups} de ${total} días` },
      { label:'Confianza del análisis', value:`${this.s.confidence.toFixed(0)}%`, up:this.s.confidence>50, desc:`${Store.history.length} sesiones analizadas` },
    ];
  },
};

export function generateDescription(newRecord) {
  const prv = Store.history.at(-1);
  if (!prv) return `Primera sesión · ${newRecord.fecha}`;
  const pctChange = ((newRecord.valor_total_usd - prv.valor_total_usd) / prv.valor_total_usd) * 100;
  const changes = ASSETS
    .filter(a => newRecord.rendimientos[a] !== null && newRecord.rendimientos[a] !== undefined &&
                 prv.rendimientos[a] !== null && prv.rendimientos[a] !== undefined)
    .map(a => ({ a, delta: (newRecord.rendimientos[a]||0) - (prv.rendimientos[a]||0), cur: newRecord.rendimientos[a]||0 }))
    .sort((x,y) => y.delta - x.delta);
  const best = changes[0], worst = changes.at(-1);
  let tone = pctChange > 0.5 ? 'Jornada positiva' : pctChange < -0.5 ? 'Jornada a la baja' : 'Jornada de consolidación';
  let desc = `${tone} (${pctChange>=0?'+':''}${pctChange.toFixed(1)}% portafolio)`;
  if (best)  desc += ` · ${best.a} lidera con ${pct(best.cur)}`;
  if (worst && worst.delta < -1) desc += ` · ${worst.a} bajo presión (${pp(worst.delta)})`;
  return desc;
}

// Plan: qué compro con mi próximo aporte, qué vendo, qué hago con cada acción,
// si me conviene otra acción, y preguntas libres a la IA.

import { state, nameOf } from '../data.js';
import { PROFILES, planContribution, evaluateCandidate } from '../core/advice.js';
import { money, plainPct, esc } from '../format.js';
import { marketExplain } from './holdings.js';

export const planState = {
  amount: '', candidate: null, candidateError: '', candidateLoading: false, ai: null, aiLoading: false, aiError: '',
  editingProfile: false, showAllAttention: false, openTool: null,
};

export function renderPlan(m) {
  if (!m.hasPositions) {
    return `
      <section class="empty">
        <h1 class="display">Tu plan aparece cuando anotes tus acciones.</h1>
        <p class="lead">Con lo que tienes en XTB calculo qué comprar con tu próximo aporte y si conviene vender algo.</p>
        <button class="btn btn--primary btn--block" data-action="trade" data-kind="buy">Anotar una compra</button>
      </section>`;
  }
  return `
    <h1 class="title">Tu plan</h1>
    ${profileBlock()}
    ${contributionBlock(m)}
    ${attentionBlock(m)}
    <div class="tools">
      ${candidateBlock(m)}
      ${aiBlock()}
    </div>
    <p class="muted small disclaimer">Son reglas generales para ordenar tu cartera (no concentrar, no perseguir precios altos, reforzar lo que está por debajo de su peso). No son asesoría financiera personalizada; la decisión final es tuya.</p>`;
}

// Perfil en una línea; el selector sólo aparece al pulsar «Cambiar».
function profileBlock() {
  const p = PROFILES[state.profile];
  const editor = planState.editingProfile ? `
      <div class="seg seg--block" role="radiogroup" aria-label="Perfil de riesgo">${Object.entries(PROFILES).map(([k, v]) => `
        <label class="seg__opt"><input type="radio" name="profile" value="${k}" ${k === state.profile ? 'checked' : ''} data-action="profile"> ${esc(v.label)}</label>`).join('')}
      </div>` : '';
  return `
    <section id="profile" class="profile" aria-label="Perfil de riesgo">
      <div class="profile__row">
        <p><span class="muted">Perfil:</span> <strong>${esc(p.label)}</strong></p>
        <button type="button" class="link link--small" data-action="edit-profile" aria-expanded="${planState.editingProfile}" aria-label="Cambiar perfil">${planState.editingProfile ? 'Listo' : 'Cambiar'}</button>
      </div>
      ${editor}
      <p class="muted small">Un ${p.fundPct}% de tu dinero en fondos que reparten el riesgo y no más de ${p.cap}% en una sola empresa.</p>
    </section>`;
}

function contributionBlock(m) {
  const amt = planState.amount;
  const plan = amt ? planContribution({ summary: m.summary, market: state.market, profile: state.profile, amount: amt }) : null;
  const result = !plan ? '' : !plan.buys.length
    ? `<p class="muted">${esc(plan.note ?? 'Escribe un monto mayor que 0.')}</p>`
    : `
      <ol class="buys">${plan.buys.map(b => {
        const h = m.summary.holdings.find(x => x.ticker === b.ticker);
        return `
          <li class="buy">
            <span class="buy__amt num">${money(b.usd)}</span>
            <span class="buy__what"><strong>${esc(nameOf(b.ticker))}</strong>${b.isNew ? ' <span class="chip chip--good">nuevo</span>' : ''}</span>
            <span class="buy__why">${b.isNew
              ? 'Fondo con las 500 empresas más grandes de EE. UU.'
              : `Pesa ${plainPct(h?.weight ?? 0)}; lo ideal es ${plainPct(b.target)}.`}
              <button class="link link--small" data-action="trade" data-kind="buy" data-ticker="${esc(b.ticker)}" data-amount="${b.usd}">Anotar compra</button></span>
          </li>`;
      }).join('')}</ol>
      ${plan.note ? `<p class="notice">${esc(plan.note)}</p>` : ''}`;
  return `
    <section class="card card--hero" aria-labelledby="contrib-title">
      <h2 id="contrib-title" class="block__title">¿Dónde pongo mi próximo aporte?</h2>
      <form class="field" data-form="contribution">
        <label class="field__label" for="contrib-amount">¿Cuánto vas a invertir?</label>
        <div class="field__row">
          <span class="field__prefix" aria-hidden="true">$</span>
          <input id="contrib-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" value="${esc(amt)}" placeholder="100">
          <button class="btn btn--primary" type="submit">Calcular</button>
        </div>
        <div class="chips">${[100, 250, 500].map(v => `<button type="button" class="chip-btn" data-action="amount" data-amount="${v}">$${v}</button>`).join('')}</div>
      </form>
      <div aria-live="polite">${result}</div>
    </section>`;
}

// Sólo lo que pide hacer algo; «Mantener» se resume en una frase. La lista
// completa ya está en Acciones y repetirla aquí alargaba la pantalla.
const URGENCY = { revisar: 0, recortar: 1, esperar: 2, comprar: 3 };
const SHOWN = 3;

function attentionBlock(m) {
  if (!m.summary.complete) {
    return `
      <section id="attention" class="block" aria-labelledby="att-title">
        <h2 id="att-title" class="block__title">Atención ahora</h2>
        <p class="muted">Faltan precios de hoy para evaluar tu cartera.</p>
      </section>`;
  }
  const items = Object.entries(m.verdicts)
    .filter(([, v]) => v.action in URGENCY)
    .sort(([, a], [, b]) => URGENCY[a.action] - URGENCY[b.action] || (b.amount ?? 0) - (a.amount ?? 0));
  const calm = m.summary.holdings.length - items.length;
  const shown = planState.showAllAttention ? items : items.slice(0, SHOWN);
  const list = shown.map(([t, v]) => `
    <li><button class="todo" data-action="holding" data-ticker="${esc(t)}">
      <span class="chip chip--${esc(v.tone)}">${esc(v.label)}</span>
      <span class="todo__who">${esc(nameOf(t))}${v.amount ? ` · unos ${money(v.amount)}` : ''}</span>
      <span class="todo__why">${esc(v.reasons[0])}</span>
    </button></li>`).join('');
  const more = items.length > shown.length
    ? `<button type="button" class="btn btn--quiet btn--block" data-action="attention-all">Ver ${items.length - shown.length} recomendaciones más</button>` : '';
  const calmTxt = !items.length
    ? 'No hace falta hacer nada: ninguna acción pesa demasiado ni tiene señales de alarma.'
    : calm === 1 ? 'La otra está para mantener.' : calm > 1 ? `Las otras ${calm} están para mantener.` : '';
  return `
    <section id="attention" class="block" aria-labelledby="att-title">
      <h2 id="att-title" class="block__title">Atención ahora</h2>
      ${items.length ? `<ul class="todos">${list}</ul>${more}` : ''}
      ${calmTxt ? `<p class="calm">${calmTxt} <a class="link link--small" href="#acciones">Ver todas en Acciones</a></p>` : ''}
    </section>`;
}

function candidateBlock(m) {
  const c = planState.candidate;
  let result = '';
  if (planState.candidateLoading) result = '<p class="muted">Buscando…</p>';
  else if (planState.candidateError) result = `<p class="notice notice--bad">${esc(planState.candidateError)}</p>`;
  else if (c) {
    const r = evaluateCandidate({ summary: m.summary, market: state.market, profile: state.profile, ticker: c.key, quote: c.quote });
    result = `
      <div class="candidate">
        <p class="candidate__name"><strong>${esc(c.quote.name ?? c.key)}</strong> <span class="muted">${esc(c.key)} · ${money(c.quote.currentPrice, { cents: true })}</span></p>
        <div class="verdict verdict--${esc(r.tone)}">
          <p class="verdict__label">${esc(r.owned ? `Ya la tienes: ${r.label}` : r.label)}</p>
          <ul class="verdict__why">${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        </div>
        ${marketExplain(c.quote)}
      </div>`;
  }
  return `
    <details class="tool" name="tools" data-tool="candidate" ${planState.openTool === 'candidate' ? 'open' : ''}>
      <summary class="tool__head"><span id="cand-title">Revisar otra acción</span></summary>
      <p class="muted small">¿Te interesa una empresa o un ETF? Te digo si encaja en tu cartera y cuánto poner como máximo.</p>
      <form class="field" data-form="candidate">
        <label class="field__label" for="cand-ticker">Símbolo</label>
        <div class="field__row">
          <input id="cand-ticker" name="ticker" placeholder="Ej.: AAPL" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(c?.key ?? '')}">
          <button class="btn btn--primary" type="submit">Revisar</button>
        </div>
      </form>
      <div aria-live="polite">${result}</div>
    </details>`;
}

const QUESTIONS = ['¿Debo vender algo?', '¿Por qué bajé este mes?', '¿Cuál es mi mayor riesgo?', '¿Qué significa el PER de mis acciones?'];

function aiBlock() {
  let out = '';
  if (planState.aiLoading) out = '<p class="muted">Pensando…</p>';
  else if (planState.aiError) out = `<p class="notice notice--bad">${esc(planState.aiError)}</p>`;
  else if (planState.ai) out = `<div class="answer"><p class="answer__q">${esc(planState.ai.q)}</p><p class="answer__a">${esc(planState.ai.a)}</p></div>`;
  return `
    <details class="tool" name="tools" data-tool="ai" ${planState.openTool === 'ai' ? 'open' : ''}>
      <summary class="tool__head"><span id="ai-title">Pregúntale a la IA</span></summary>
      <p class="muted small">Responde con tus números y las recomendaciones de arriba. Puede equivocarse.</p>
      <div class="chips">${QUESTIONS.map(q => `<button type="button" class="chip-btn" data-action="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form class="field" data-form="ask">
        <label class="sr-only" for="ask-q">Tu pregunta</label>
        <div class="field__row">
          <input id="ask-q" name="q" maxlength="400" placeholder="Escribe tu pregunta" autocomplete="off">
          <button class="btn btn--primary" type="submit" ${planState.aiLoading ? 'disabled' : ''}>Preguntar</button>
        </div>
      </form>
      <div aria-live="polite">${out}</div>
    </details>`;
}

// Plan: qué compro con mi próximo aporte, qué vendo, qué hago con cada acción,
// si me conviene otra acción, y preguntas libres a la IA.

import { state, nameOf } from '../data.js';
import { PROFILES, planContribution, evaluateCandidate } from '../core/advice.js';
import { money, plainPct, esc } from '../format.js';
import { marketExplain } from './holdings.js';

export const planState = { amount: '', candidate: null, candidateError: '', candidateLoading: false, ai: null, aiLoading: false, aiError: '' };

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
    ${sellBlock(m)}
    ${allBlock(m)}
    ${candidateBlock(m)}
    ${aiBlock()}
    <p class="muted small disclaimer">Son reglas generales para ordenar tu cartera (no concentrar, no perseguir precios altos, reforzar lo que está por debajo de su peso). No son asesoría financiera personalizada; la decisión final es tuya.</p>`;
}

function profileBlock() {
  const p = PROFILES[state.profile];
  const opts = Object.entries(PROFILES).map(([k, v]) => `
    <label class="seg__opt"><input type="radio" name="profile" value="${k}" ${k === state.profile ? 'checked' : ''} data-action="profile"> ${esc(v.label)}</label>`).join('');
  return `
    <section class="block" aria-labelledby="profile-title">
      <h2 id="profile-title" class="block__title">¿Cuánto riesgo aceptas?</h2>
      <div class="seg seg--block" role="radiogroup" aria-labelledby="profile-title">${opts}</div>
      <p class="muted small">${esc(p.label)}: un ${p.fundPct}% de tu dinero en fondos que reparten el riesgo y no más de ${p.cap}% en una sola empresa.</p>
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
            <span class="buy__what">en <strong>${esc(nameOf(b.ticker))}</strong>${b.isNew ? ' <span class="chip chip--good">nuevo</span>' : ''}</span>
            <span class="buy__why">${b.isNew
              ? 'Un fondo que reparte tu dinero entre 500 empresas.'
              : `Hoy pesa ${plainPct(h?.weight ?? 0)} de tu dinero en acciones; lo ideal para tu perfil es ${plainPct(b.target)}.`}</span>
            <button class="link" data-action="trade" data-kind="buy" data-ticker="${esc(b.ticker)}" data-amount="${b.usd}">Anotar cuando la compres</button>
          </li>`;
      }).join('')}</ol>
      ${plan.note ? `<p class="notice">${esc(plan.note)}</p>` : ''}`;
  return `
    <section class="block" aria-labelledby="contrib-title">
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

function sellBlock(m) {
  const list = Object.entries(m.verdicts).filter(([, v]) => v.action === 'recortar' || v.action === 'revisar');
  const body = !m.summary.complete
    ? `<p class="muted">Faltan precios de hoy para evaluarlo.</p>`
    : !list.length
      ? `<p>No hace falta vender nada. Ninguna acción pesa demasiado ni tiene señales de alarma.</p>`
      : `<ul class="todos">${list.map(([t, v]) => `
          <li><button class="todo todo--${esc(v.tone)}" data-action="holding" data-ticker="${esc(t)}">
            <span class="chip chip--${esc(v.tone)}">${esc(v.label)}</span>
            <span class="todo__who">${esc(nameOf(t))}${v.amount ? ` · unos ${money(v.amount)}` : ''}</span>
            <span class="todo__why">${esc(v.reasons[0])}</span>
          </button></li>`).join('')}</ul>`;
  return `
    <section class="block" aria-labelledby="sell-title">
      <h2 id="sell-title" class="block__title">¿Vendo algo?</h2>
      ${body}
    </section>`;
}

function allBlock(m) {
  if (!m.summary.holdings.length) return '';
  return `
    <section class="block" aria-labelledby="all-title">
      <h2 id="all-title" class="block__title">Qué hacer con cada una</h2>
      <ul class="verdicts">${m.summary.holdings.map(h => {
        const v = m.verdicts[h.ticker];
        return `<li><button class="vrow" data-action="holding" data-ticker="${esc(h.ticker)}">
          <span class="vrow__name">${esc(nameOf(h.ticker))}</span>
          <span class="chip chip--${esc(v.tone)}">${esc(v.label)}</span>
        </button></li>`;
      }).join('')}</ul>
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
    <section class="block" aria-labelledby="cand-title">
      <h2 id="cand-title" class="block__title">¿Me conviene otra acción?</h2>
      <form class="field" data-form="candidate">
        <label class="field__label" for="cand-ticker">Símbolo</label>
        <div class="field__row">
          <input id="cand-ticker" name="ticker" placeholder="Ej.: AAPL" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(c?.key ?? '')}">
          <button class="btn btn--primary" type="submit">Revisar</button>
        </div>
      </form>
      <div aria-live="polite">${result}</div>
    </section>`;
}

const QUESTIONS = ['¿Debo vender algo?', '¿Por qué bajé este mes?', '¿Cuál es mi mayor riesgo?', '¿Qué significa el PER de mis acciones?'];

function aiBlock() {
  let out = '';
  if (planState.aiLoading) out = '<p class="muted">Pensando…</p>';
  else if (planState.aiError) out = `<p class="notice notice--bad">${esc(planState.aiError)}</p>`;
  else if (planState.ai) out = `<div class="answer"><p class="answer__q">${esc(planState.ai.q)}</p><p class="answer__a">${esc(planState.ai.a)}</p></div>`;
  return `
    <section class="block" aria-labelledby="ai-title">
      <h2 id="ai-title" class="block__title">Pregúntale a la IA</h2>
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
    </section>`;
}

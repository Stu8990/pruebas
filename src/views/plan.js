// Plan: el plan acordado (objetivos, lo congelado, lo que se vende), si me
// conviene otra acción, y preguntas libres a la IA. El aporte del mes y el
// avance están en Inicio.

import { state, nameOf } from '../data.js';
import { evaluateCandidate } from '../core/advice.js';
import { fmtDate, roleOf } from '../core/plan.js';
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
        <p class="lead">Con lo que tienes en XTB calculo qué comprar con tu próximo aporte y qué te falta vender.</p>
        <button class="btn btn--primary btn--block" data-action="trade" data-kind="buy">Anotar una compra</button>
      </section>`;
  }
  return `
    <h1 class="title">Tu plan</h1>
    ${planDefinition(m)}
    <div class="tools">
      ${candidateBlock(m)}
      ${aiBlock()}
    </div>
    <p class="muted small disclaimer">Es el plan que acordaste el 2 oct 2026. Información general, no asesoría financiera personalizada; la decisión final es tuya.</p>`;
}

// El plan como lo acordaste: qué tienes que tener, qué se queda sin comprar y
// qué se vende. Lo que cada cosa pesa hoy está en Inicio.
function planDefinition(m) {
  const p = m.plan;
  const funds = p.targets.filter(t => !t.stock);
  const stocks = p.targets.filter(t => t.stock);
  const row = (name, val) => `<li class="plandef__row"><span>${esc(name)}</span><span class="num">${esc(val)}</span></li>`;
  return `
    <section class="block block--flush" aria-labelledby="def-title">
      <h2 id="def-title" class="sr-only">Objetivos</h2>
      <ul class="plandef">
        ${funds.map(t => row(`${t.label} (${t.buy})`, plainPct(t.pct))).join('')}
        ${row(`Acciones: ${stocks.map(t => t.label).join(', ')}`, `${plainPct(stocks[0]?.pct ?? 0, 1)} c/u`)}
        ${p.frozen.map(f => row(`${nameOf(f.ticker)}: se queda sin comprar`, `tope ${f.max}%`)).join('')}
      </ul>
      <p class="muted small">Cada mes, el aporte de ${money(p.monthly)} va a las 2–3 posiciones más por debajo de su objetivo.</p>
    </section>
    <section class="block" aria-labelledby="exit-title">
      <h2 id="exit-title" class="block__title">Lo que vas a vender</h2>
      <p>${p.exit.items.filter(e => e.now).map(e => `${esc(nameOf(e.ticker))} → ${esc(e.swapTo)}`).filter((x, i, a) => a.indexOf(x) === i).join(' · ')}: <strong>ya</strong>.</p>
      <p>${p.exit.items.filter(e => !e.now).map(e => esc(nameOf(e.ticker))).join(', ')}: con órdenes limitadas, antes del <strong>${esc(fmtDate(p.exit.deadline))}</strong>.</p>
      <p class="muted small">Por qué: SCHD y VOO retienen 30% de los dividendos a no residentes; los ETF irlandeses (CSPX, EIMI), 15%. Y menos acciones sueltas es menos riesgo de que una sola empresa te hunda.</p>
    </section>`;
}

function candidateBlock(m) {
  const c = planState.candidate;
  let result = '';
  if (planState.candidateLoading) result = '<p class="muted">Buscando…</p>';
  else if (planState.candidateError) result = `<p class="notice notice--bad">${esc(planState.candidateError)}</p>`;
  else if (c) {
    const role = roleOf(c.key, m.plan);
    const r = role.kind === 'outside' || !m.verdicts[c.key]
      ? evaluateCandidate({ summary: m.summary, market: state.market, profile: state.profile, ticker: c.key, quote: c.quote })
      : { ...m.verdicts[c.key], owned: true };
    const note = role.kind === 'outside'
      ? '<p class="notice">No está en tu plan. Si la compras, ese dinero no va a tus objetivos: decide primero si la agregas al plan.</p>'
      : role.kind === 'exit' ? '<p class="notice notice--warn">Está en tu lista de venta.</p>'
      : role.kind === 'frozen' ? '<p class="notice">Tu plan la mantiene sin comprar más.</p>'
      : `<p class="notice">Está en tu plan: cuenta para ${esc(role.target.label)}.</p>`;
    result = `
      <div class="candidate">
        <p class="candidate__name"><strong>${esc(c.quote.name ?? c.key)}</strong> <span class="muted">${esc(c.key)} · ${money(c.quote.currentPrice, { cents: true })}</span></p>
        ${note}
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

const QUESTIONS = ['¿Por qué CSPX y no VOO?', '¿Qué vendo primero y cómo?', '¿Le gano al S&P 500?', '¿Por qué bajé este mes?'];

function aiBlock() {
  let out = '';
  if (planState.aiLoading) out = '<p class="muted">Pensando…</p>';
  else if (planState.aiError) out = `<p class="notice notice--bad">${esc(planState.aiError)}</p>`;
  else if (planState.ai) out = `<div class="answer"><p class="answer__q">${esc(planState.ai.q)}</p><p class="answer__a">${esc(planState.ai.a)}</p></div>`;
  return `
    <details class="tool" name="tools" data-tool="ai" ${planState.openTool === 'ai' ? 'open' : ''}>
      <summary class="tool__head"><span id="ai-title">Pregúntale a la IA</span></summary>
      <p class="muted small">Responde con tus números y tu plan. No cambia el plan: lo explica. Puede equivocarse.</p>
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

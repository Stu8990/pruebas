// Plan: el plan de esta cuenta (objetivos, lo congelado, lo que se vende) y su
// editor, si me conviene otra acción, y preguntas libres a la IA. El aporte del
// mes y el avance están en Inicio.

import { state, nameOf } from '../data.js';
import { evaluateCandidate } from '../core/advice.js';
import { fmtDate, roleOf } from '../core/plan.js';
import { money, plainPct, esc } from '../format.js';
import { marketExplain } from './holdings.js';

export const planState = {
  amount: '', candidate: null, candidateError: '', candidateLoading: false, ai: null, aiLoading: false, aiError: '',
  openTool: null,
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
    ${m.plan ? planDefinition(m) : noPlan()}
    <div class="tools">
      ${candidateBlock(m)}
      ${aiBlock(m)}
    </div>
    <p class="muted small disclaimer">El plan lo decides tú y lo puedes cambiar cuando quieras. Información general, no asesoría financiera personalizada; la decisión final es tuya.</p>`;
}

function noPlan() {
  return `
    <section class="card card--hero" aria-labelledby="noplan-title">
      <h2 id="noplan-title" class="block__title">Todavía no tienes un plan</h2>
      <p>Dime qué quieres tener y en qué proporción (por ejemplo, 80% en un fondo del S&amp;P 500 y 20% en emergentes). Con eso te digo dónde poner cada aporte y qué te sobra.</p>
      <button class="btn btn--primary btn--block" data-action="edit-plan">Crear mi plan</button>
    </section>`;
}

// El plan como lo guardaste: qué tienes que tener, qué se queda sin comprar y
// qué se vende. Lo que cada cosa pesa hoy está en Inicio.
function planDefinition(m) {
  const p = m.plan;
  const row = (name, val) => `<li class="plandef__row"><span>${esc(name)}</span><span class="num">${esc(val)}</span></li>`;
  const now = p.exit.items.filter(e => e.now), later = p.exit.items.filter(e => !e.now);
  const names = list => list.map(e => esc(nameOf(e.ticker))).join(', ');
  const exits = now.length || later.length ? `
    <section class="block" aria-labelledby="exit-title">
      <h2 id="exit-title" class="block__title">Lo que vas a vender</h2>
      ${now.length ? `<p>${names(now)}: <strong>ya</strong>.</p>` : ''}
      ${later.length ? `<p>${names(later)}: con órdenes limitadas, antes del <strong>${esc(fmtDate(p.exit.deadline))}</strong>.</p>` : ''}
      <p class="muted small">El dinero de cada venta va a lo que esté más por debajo de su objetivo.</p>
    </section>` : '';
  return `
    <section class="block block--flush" aria-labelledby="def-title">
      <div class="block__head">
        <h2 id="def-title" class="block__title">Objetivos</h2>
        <button class="btn btn--quiet btn--small" data-action="edit-plan">Editar plan</button>
      </div>
      <ul class="plandef">
        ${p.targets.map(t => row(t.label === t.buy ? nameOf(t.buy) : `${t.label} (${t.buy})`, pc(t.pct))).join('')}
        ${p.frozen.map(f => row(`${nameOf(f.ticker)}: se queda sin comprar`, `tope ${pc(f.max)}`)).join('')}
      </ul>
      ${p.monthly ? `<p class="muted small">Cada mes, el aporte de ${money(p.monthly)} va a las 2–3 posiciones más por debajo de su objetivo.</p>` : ''}
      ${p.nonUS ? '<p class="muted small">Viviendo fuera de EE. UU., los ETF de EE. UU. (VOO, SCHD) te retienen 30% de los dividendos; los irlandeses (CSPX, EIMI), 15% dentro del fondo.</p>' : ''}
    </section>
    ${exits}`;
}

const pc = n => plainPct(n, Number.isInteger(n) ? 0 : 1);

const ROLE_OPTS = [['other', 'Lo decido luego'], ['frozen', 'Mantener sin comprar'], ['now', 'Vender ya'], ['later', 'Vender antes de la fecha']];
const TARGET_ROWS_FREE = 3;

/**
 * Formulario del plan (va en una hoja). `stored` es el plan guardado o la
 * plantilla; `held` lo que el usuario tiene hoy. Los nombres de los campos son
 * los que lee parsePlanForm.
 */
export function planForm({ stored, held, engine }) {
  const targets = [...stored.targets, ...Array.from({ length: TARGET_ROWS_FREE }, () => ({ ticker: '', pct: '' }))].slice(0, 12);
  const roleOfHeld = t => stored.frozen.some(f => f.ticker === t) ? 'frozen'
    : stored.exits.find(e => e.ticker === t)?.now === true ? 'now'
    : stored.exits.some(e => e.ticker === t) ? 'later' : 'other';
  const others = held.filter(t => !stored.targets.some(x => x.ticker === t));
  const roles = others.map(t => {
    const role = roleOfHeld(t);
    const counts = engine ? roleOf(t, engine) : null;
    const otherLabel = counts?.kind === 'target' ? `Cuenta para ${counts.target.label}` : ROLE_OPTS[0][1];
    const max = stored.frozen.find(f => f.ticker === t)?.max ?? 10;
    return `
      <div class="role">
        <span class="role__name">${esc(nameOf(t))} <small class="muted">${esc(t)}</small></span>
        <select name="role-${esc(t)}" aria-label="Qué hacer con ${esc(nameOf(t))}">
          ${ROLE_OPTS.map(([v, l]) => `<option value="${v}" ${v === role ? 'selected' : ''}>${esc(v === 'other' ? otherLabel : l)}</option>`).join('')}
        </select>
        <label class="role__max">Tope <input name="max-${esc(t)}" type="text" inputmode="decimal" autocomplete="off" value="${esc(max)}" aria-label="Tope de ${esc(nameOf(t))} en %"> %</label>
      </div>`;
  }).join('');
  return `
    <form id="plan-form" class="stack planform" novalidate>
      <fieldset class="field">
        <legend class="field__label">Qué quieres tener y en qué proporción</legend>
        <div class="planform__rows">
          ${targets.map((t, i) => `
            <div class="planform__row">
              <input name="t-${i}" value="${esc(t.ticker)}" placeholder="${i === 0 ? 'Ej.: CSPX' : 'Símbolo'}" aria-label="Símbolo ${i + 1}" autocomplete="off" autocapitalize="characters" spellcheck="false">
              <span class="planform__pct"><input name="p-${i}" value="${esc(t.pct)}" type="text" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Peso ${i + 1} en %"><span aria-hidden="true">%</span></span>
            </div>`).join('')}
        </div>
        <span class="field__hint">Hasta 100% en total. Si suman menos, los fondos se reparten el resto. CSPX, VOO e IVV cuentan como el mismo S&amp;P 500.</span>
      </fieldset>
      ${others.length ? `
      <fieldset class="field">
        <legend class="field__label">Lo que ya tienes y no está arriba</legend>
        <div class="roles">${roles}</div>
        <span class="field__hint">«Mantener sin comprar»: se queda, pero no recibe aportes; si pasa del tope, te aviso para vender el exceso.</span>
      </fieldset>
      <label class="field"><span class="field__label">Fecha tope para vender</span>
        <input name="deadline" type="date" value="${esc(stored.deadline)}">
        <span class="field__hint">Solo para lo que marques «Vender antes de la fecha».</span></label>` : ''}
      <label class="field"><span class="field__label">Aporte mensual (USD)</span>
        <input name="monthly" type="text" inputmode="decimal" autocomplete="off" value="${esc(stored.monthly || '')}" placeholder="100"></label>
      <label class="check"><input type="checkbox" name="nonUS" ${stored.nonUS ? 'checked' : ''}> Vivo fuera de EE. UU.</label>
      <p class="field__hint">Así la IA tiene en cuenta los impuestos que te retienen sobre los dividendos.</p>
      <p class="form-msg" role="alert" hidden></p>
      <button class="btn btn--primary btn--block" type="submit">Guardar plan</button>
    </form>`;
}

function candidateBlock(m) {
  const c = planState.candidate;
  let result = '';
  if (planState.candidateLoading) result = '<p class="muted">Buscando…</p>';
  else if (planState.candidateError) result = `<p class="notice notice--bad">${esc(planState.candidateError)}</p>`;
  else if (c) {
    const role = m.plan ? roleOf(c.key, m.plan) : { kind: 'outside' };
    const r = role.kind === 'outside' || !m.verdicts[c.key]
      ? evaluateCandidate({ summary: m.summary, market: state.market, profile: state.profile, ticker: c.key, quote: c.quote })
      : { ...m.verdicts[c.key], owned: true };
    const note = !m.plan
      ? '<p class="notice">Todavía no tienes plan: créalo para saber si encaja en tus objetivos.</p>'
      : role.kind === 'outside'
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

// Preguntas sugeridas según lo que haya: no se ofrece «¿qué vendo?» a quien
// no tiene nada que vender.
function questions(m) {
  const q = [];
  if (!m.plan) return ['¿Cómo armo un plan sencillo?', '¿Por qué subí o bajé este mes?'];
  q.push('¿Dónde pongo mi aporte y por qué?');
  if (m.plan.exit.items.length) q.push('¿Qué vendo primero y cómo?');
  if (m.vsIndex) q.push(`¿Le gano al ${m.vsIndex.label}?`);
  q.push('¿Por qué subí o bajé este mes?');
  return q;
}

function aiBlock(m) {
  let out = '';
  if (planState.aiLoading) out = '<p class="muted">Pensando…</p>';
  else if (planState.aiError) out = `<p class="notice notice--bad">${esc(planState.aiError)}</p>`;
  else if (planState.ai) out = `<div class="answer"><p class="answer__q">${esc(planState.ai.q)}</p><p class="answer__a">${esc(planState.ai.a)}</p></div>`;
  return `
    <details class="tool" name="tools" data-tool="ai" ${planState.openTool === 'ai' ? 'open' : ''}>
      <summary class="tool__head"><span id="ai-title">Pregúntale a la IA</span></summary>
      <p class="muted small">Responde con tus números y tu plan. No cambia el plan: lo explica. Puede equivocarse.</p>
      <div class="chips">${questions(m).map(q => `<button type="button" class="chip-btn" data-action="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
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

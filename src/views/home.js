// Inicio: tu plan primero. En este orden: dónde pongo el aporte de este mes,
// cuánto me falta para el plan, qué tengo pendiente, ¿cómo voy? (contra el
// S&P 500), ¿por qué subí o bajé este mes? y la curva. Todo en frases, con las
// cifras dentro.

import { state, nameOf } from '../data.js';
import { money, signedMoney, pct, plainPct, tone, monthName, esc } from '../format.js';
import { valueChart } from '../ui/chart.js';
import { monthlyBuys, fmtDate } from '../core/plan.js';
import { planState } from './plan.js';

const RANGES = { '1m': 31, '3m': 92, 'todo': Infinity };
let range = '3m';
export function setRange(r) { if (RANGES[r]) range = r; }

export function renderHome(m) {
  if (!m.hasPositions && !m.hasHistory) return emptyHome();
  if (!m.hasPositions) return legacyHome(m);
  if (!m.pricesReady && state.status.market !== 'error') return loadingHome();
  return `
    ${m.plan ? `${monthCard(m)}${progressBlock(m)}${pendingBlock(m)}` : planCta()}
    ${hero(m)}
    ${monthSection(m)}
    ${historySection(m)}
  `;
}

// Cuenta sin plan: sin plan no hay a dónde mandar el aporte, así que lo
// primero es crearlo. Nada de consejos con el plan de otro.
function planCta() {
  return `
    <section class="card card--hero plan-month" aria-labelledby="cta-title">
      <h1 id="cta-title" class="block__title">Crea tu plan y te digo dónde poner cada aporte</h1>
      <p>Elige qué quieres tener y en qué proporción, y qué hacer con lo que ya tienes. Toma un minuto y lo puedes cambiar cuando quieras.</p>
      <button class="btn btn--primary btn--block" data-action="edit-plan">Crear mi plan</button>
    </section>`;
}

function emptyHome() {
  return `
    <section class="empty">
      <h1 class="display">Empecemos por lo que tienes en XTB.</h1>
      <p class="lead">Anota cada compra (qué acción, cuántas y a qué precio). Con eso te diré cuánto vas ganando, por qué sube o baja tu dinero y dónde poner tu próximo aporte.</p>
      <button class="btn btn--primary btn--block" data-action="trade" data-kind="buy">Anotar mi primera compra</button>
      <p class="muted small">¿Dónde lo veo? En la app de XTB: Cartera → Posiciones abiertas. Ahí aparece el volumen (acciones) y el precio de apertura.</p>
    </section>`;
}

function loadingHome() {
  return `
    <section class="hero" aria-busy="true">
      <p class="hero__line skeleton" style="width:70%">&nbsp;</p>
      <p class="hero__line skeleton" style="width:90%">&nbsp;</p>
      <p class="hero__line skeleton" style="width:55%">&nbsp;</p>
      <p class="sr-only">Cargando precios de hoy…</p>
    </section>`;
}

function hero(m) {
  const s = m.summary;
  const pricesError = state.status.market === 'error';
  if (!s.holdings.some(h => h.value !== null)) {
    return `
      <section class="hero">
        <p class="hero__line">No pude traer los precios de hoy.</p>
        <p class="muted">${esc(state.errors.market ?? 'Revisa tu conexión.')}</p>
        <button class="btn btn--primary" data-action="refresh">Reintentar</button>
      </section>`;
  }
  const g = s.totalGain;
  const verb = g >= 0 ? 'ganando' : 'perdiendo';
  const month = m.month.total;
  const partial = !s.complete
    ? `<p class="notice notice--warn">Falta el precio de ${esc(s.missingPrices.join(', '))}; las cifras no lo incluyen.${pricesError ? ' <button class="link" data-action="refresh">Reintentar</button>' : ''}</p>`
    : '';
  return `
    <section class="block hero" aria-labelledby="hero-title">
      <h2 id="hero-title" class="block__title">¿Cómo voy?</h2>
      <p class="hero__line">Tienes <strong class="num">${money(s.total)}</strong>${s.cash > 0 ? ` <span class="hero__aside">(${money(s.cash)} en efectivo)</span>` : ''}.</p>
      <p class="hero__line">Pusiste ${money(s.invested)} en acciones y vas <strong class="num ${tone(g)}">${verb} ${money(Math.abs(g))}</strong> <span class="${tone(g)}">(${pct(s.totalGainPct)})</span>.</p>
      ${s.realized ? `<p class="muted small">Incluye ${signedMoney(s.realized)} que ya ganaste al vender.</p>` : ''}
      ${partial}
      <dl class="periods">
        <div class="period"><dt>Hoy</dt><dd class="num ${tone(s.today)}">${signedMoney(s.today)}</dd></div>
        <div class="period"><dt>En ${esc(monthName(m.today))}</dt><dd class="num ${tone(month)}">${month === null ? '—' : signedMoney(month)}</dd></div>
        <div class="period"><dt>Desde que empezaste</dt><dd class="num ${tone(g)}">${signedMoney(g)}</dd></div>
      </dl>
      ${indexLine(m)}
    </section>`;
}

// ¿Mis acciones le ganan al índice? Con lo que hay: tu S&P 500 contra todo lo
// demás, en % sobre lo que pagaste. No necesita fechas de compra.
function indexLine(m) {
  const v = m.vsIndex;
  if (!v) return '';
  const ahead = v.diffPp >= 0;
  return `
    <div class="vsindex" id="vsindex">
      <p>Tu ${esc(v.label)} va <strong class="num ${tone(v.index.gainPct)}">${pct(v.index.gainPct)}</strong>; todo lo demás, <strong class="num ${tone(v.rest.gainPct)}">${pct(v.rest.gainPct)}</strong>.
      ${ahead ? 'Tus otras posiciones le ganan al índice por ahora.' : 'Por ahora el índice solo lo hace mejor.'}</p>
      <p class="muted small">Revísalo cada 6 meses. Si en 2–3 años tus acciones no le ganan al ${esc(v.label)}, pásalas al fondo.</p>
    </div>`;
}

// ── Mi plan ────────────────────────────────────────────────

function monthCard(m) {
  const amt = planState.amount || (m.plan.monthly ? String(m.plan.monthly) : '');
  const r = monthlyBuys({ summary: m.summary, plan: m.plan, amount: amt });
  const n = Number(amt);
  const title = Number.isFinite(n) && n > 0 ? `Este mes pon tus ${money(n)} así` : '¿Cuánto vas a aportar?';
  const list = !r.buys.length
    ? `<p class="muted">${esc(r.note ?? 'Escribe un monto mayor que 0.')}</p>`
    : `
      <ol class="buys">${r.buys.map(b => `
        <li class="buy">
          <span class="buy__amt num">${money(b.usd)}</span>
          <span class="buy__what"><strong>${esc(b.ticker)}</strong> · ${esc(b.label)}${b.isNew ? ' <span class="chip chip--good">nuevo</span>' : ''}</span>
          <span class="buy__why">Pesa ${plainPct(b.weight)}; tu objetivo es ${plainPct(b.goal)}.
            <button class="link link--small" data-action="trade" data-kind="buy" data-ticker="${esc(b.ticker)}" data-amount="${b.usd}">Anotar compra</button></span>
        </li>`).join('')}</ol>`;
  return `
    <section class="card card--hero plan-month" aria-labelledby="month-plan-title">
      <h1 id="month-plan-title" class="block__title">${esc(title)}</h1>
      <div aria-live="polite">${list}</div>
      <form class="field" data-form="contribution">
        <div class="chips" role="group" aria-label="Monto del aporte">${[100, 250, 500].map(v => `<button type="button" class="chip-btn" data-action="amount" data-amount="${v}" aria-pressed="${String(v) === amt}">$${v}</button>`).join('')}</div>
        <label class="field__label" for="contrib-amount">¿Cuánto vas a invertir?</label>
        <div class="field__row">
          <span class="field__prefix" aria-hidden="true">$</span>
          <input id="contrib-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" value="${esc(amt)}" placeholder="100">
          <button class="btn btn--quiet" type="submit">Calcular</button>
        </div>
      </form>
      <p class="muted small">Regla de tu plan: el aporte va a lo que está más por debajo de su objetivo, nunca a lo que vas a vender.</p>
    </section>`;
}

// Todas las filas comparten escala (la del mayor peso u objetivo), para que
// una barra más larga sea de verdad más dinero. La marca es el objetivo.
function goalRow({ name, weight, goal, max, val, cls = '' }) {
  return `
    <li class="goal ${cls}">
      <span class="goal__name">${esc(name)}</span>
      <span class="goal__val num">${val ?? `${plainPct(weight)} <span aria-hidden="true">→</span><span class="sr-only">, objetivo</span> ${plainPct(goal)}`}</span>
      <span class="goal__track" aria-hidden="true">
        <span class="goal__fill" style="--w:${(weight / max * 100).toFixed(1)}%"></span>
        <span class="goal__mark" style="--g:${(goal / max * 100).toFixed(1)}%"></span>
      </span>
    </li>`;
}

function progressBlock(m) {
  const st = m.status;
  if (!st.complete) {
    return `
      <section class="block" aria-labelledby="progress-title">
        <h2 id="progress-title" class="block__title">Hacia tu plan</h2>
        <p class="muted">Faltan precios de hoy para medir tus pesos.</p>
      </section>`;
  }
  const max = Math.max(...st.targets.map(t => Math.max(t.weight, t.goal)), ...st.frozen.map(f => Math.max(f.weight, f.max)), st.exitWeight, 1) * 1.08;
  const rows = st.targets.map(t => goalRow({ name: t.label, weight: t.weight, goal: t.goal, max }));
  for (const f of st.frozen) {
    rows.push(goalRow({ name: `${nameOf(f.ticker)} (sin comprar)`, weight: f.weight, goal: f.max, max, cls: 'goal--frozen',
      val: `${plainPct(f.weight)} <span class="muted">· tope ${plainPct(f.max)}</span>` }));
  }
  if (st.exits.length) rows.push(goalRow({ name: 'Por vender', weight: st.exitWeight, goal: 0, max, cls: 'goal--exit', val: `${plainPct(st.exitWeight)} <span aria-hidden="true">→</span><span class="sr-only">, objetivo</span> 0%` }));
  const fz = st.frozen.find(f => f.weight >= 1);
  const core = st.targets[0];
  return `
    <section class="block" aria-labelledby="progress-title">
      <h2 id="progress-title" class="block__title">Hacia tu plan</h2>
      <ul class="goals">${rows.join('')}</ul>
      ${fz && core.goal < core.pct - 0.5 ? `<p class="muted small">${esc(nameOf(fz.ticker))} ocupa ${plainPct(fz.weight)} mientras la tengas; por eso el ${esc(core.label)} apunta a ${plainPct(core.goal)} y no a ${plainPct(core.pct)}. Con cada aporte vuelve a subir.</p>` : ''}
    </section>`;
}

function pendingBlock(m) {
  const st = m.status;
  const now = st.exits.filter(e => e.now);
  const later = st.exits.filter(e => !e.now);
  const items = [];
  for (const e of now) {
    items.push(todo({ ticker: e.ticker, chip: 'Ya', tone: 'warn',
      who: `Vender ${nameOf(e.ticker)}`,
      why: `Unos ${money(e.value)}. Con lo que salga, compra lo que esté más bajo en tu plan.` }));
  }
  if (later.length) {
    const d = st.daysLeft;
    items.push(`
      <li><div class="todo todo--static">
        <span class="chip chip--warn">${d > 0 ? `${d} días` : 'Vencido'}</span>
        <span class="todo__who">Vender ${later.length === 1 ? 'una posición' : `${later.length} posiciones`} antes del ${esc(fmtDate(st.deadline))}</span>
        <span class="todo__why">${later.map(e => `<button class="link link--small" data-action="holding" data-ticker="${esc(e.ticker)}">${esc(nameOf(e.ticker))}</button>`).join(' · ')}</span>
        <span class="todo__why">Pon órdenes limitadas cerca de tu precio de compra. Si llega la fecha, se venden igual. El dinero va a lo que esté más bajo en tu plan.</span>
      </div></li>`);
  }
  for (const f of st.frozen.filter(x => x.trim)) {
    items.push(todo({ ticker: f.ticker, chip: 'Vender una parte', tone: 'warn',
      who: nameOf(f.ticker), why: `Pesa ${plainPct(f.weight)} y el tope es ${f.max}%. Vende unos ${money(f.trim)} y pásalos a ${m.plan.targets[0].label}.` }));
  }
  for (const o of st.outside) {
    items.push(todo({ ticker: o.ticker, chip: 'Fuera de tu plan', tone: 'neutral',
      who: nameOf(o.ticker), why: 'No está en tus objetivos. Decide si la agregas al plan o la vendes.' }));
  }
  return `
    <section class="block" aria-labelledby="pending-title">
      <h2 id="pending-title" class="block__title">Pendiente</h2>
      ${items.length ? `<ul class="todos">${items.join('')}</ul>` : '<p class="calm">Nada pendiente: todo lo que tienes está en tu plan.</p>'}
    </section>`;
}

function todo({ ticker, chip, tone: t, who, why }) {
  return `
    <li><button class="todo" data-action="holding" data-ticker="${esc(ticker)}">
      <span class="chip chip--${esc(t)}">${esc(chip)}</span>
      <span class="todo__who">${esc(who)}</span>
      <span class="todo__why">${esc(why)}</span>
    </button></li>`;
}

function monthSection(m) {
  const mo = m.month;
  const mes = monthName(m.today);
  if (mo.total === null) {
    return `
      <section class="block" aria-labelledby="month-title">
        <h2 id="month-title" class="block__title">¿Cómo va ${esc(mes)}?</h2>
        <p class="muted">Todavía no tengo el precio con el que empezaste el mes. Aparecerá cuando se actualicen los precios.</p>
      </section>`;
  }
  const down = mo.total < 0;
  const title = Math.abs(mo.total) < 1 ? `${cap(mes)} va plano` : down ? `¿Por qué bajaste en ${mes}?` : `¿Por qué subiste en ${mes}?`;
  const drivers = mo.byTicker.filter(x => Math.sign(x.usd) === Math.sign(mo.total));
  const main = drivers[0];
  const share = main ? Math.abs(main.usd) / Math.max(1, drivers.reduce((a, x) => a + Math.abs(x.usd), 0)) : 0;
  let why = '';
  if (main) {
    const who = `${esc(nameOf(main.ticker))} (${signedMoney(main.usd)})`;
    why = share > 0.6
      ? `Casi todo viene de ${who}.`
      : `Sobre todo por ${who}${drivers[1] ? ` y ${esc(nameOf(drivers[1].ticker))} (${signedMoney(drivers[1].usd)})` : ''}.`;
  }
  const max = Math.max(...mo.byTicker.map(x => Math.abs(x.usd)), 1);
  const rows = mo.byTicker.map(x => `
    <li class="bar ${tone(x.usd)}">
      <span class="bar__name">${esc(nameOf(x.ticker))}</span>
      <span class="bar__track" aria-hidden="true"><span class="bar__fill" style="--w:${(Math.abs(x.usd) / max * 100).toFixed(1)}%"></span></span>
      <span class="bar__val num">${signedMoney(x.usd)}</span>
    </li>`).join('');
  return `
    <section class="block" aria-labelledby="month-title">
      <h2 id="month-title" class="block__title">${esc(title)}</h2>
      <p>${down ? 'Perdiste' : 'Ganaste'} <strong class="num ${tone(mo.total)}">${money(Math.abs(mo.total))}</strong> este mes por cambios de precio. ${why}</p>
      <ul class="bars" aria-label="Ganancia o pérdida de cada acción en ${esc(mes)}">${rows}</ul>
      <p class="muted small">${down ? 'Bajar un mes es normal en bolsa: no significa que hiciste algo mal. ' : ''}El dinero que agregaste no cuenta como ganancia.${mo.source === 'history' ? ' Algunas cifras son aproximadas (calculadas con tus registros).' : ''}</p>
    </section>`;
}

function historySection(m) {
  const pts = state.history.map(r => ({ d: r.fecha, v: +r.valor_total_usd })).filter(p => p.v > 0);
  if (pts.length < 2) {
    return `
      <section class="block" aria-labelledby="hist-title">
        <h2 id="hist-title" class="block__title">Cómo ha crecido tu dinero</h2>
        <p class="muted">Guardo el valor de tu cartera una vez al día cuando abres la app. En unos días verás aquí la curva.</p>
      </section>`;
  }
  const days = RANGES[range];
  const cutoff = Number.isFinite(days) ? new Date(Date.parse(m.today + 'T12:00:00') - days * 864e5).toISOString().slice(0, 10) : '';
  let shown = pts.filter(p => p.d >= cutoff);
  if (shown.length < 2) shown = pts.slice(-2);
  const tabs = Object.keys(RANGES).map(r => `
    <button class="seg__opt" data-action="range" data-range="${r}" aria-pressed="${r === range}">${r === 'todo' ? 'Todo' : r.toUpperCase()}</button>`).join('');
  return `
    <section class="block" aria-labelledby="hist-title">
      <div class="block__head">
        <h2 id="hist-title" class="block__title">Cómo ha crecido tu dinero</h2>
        <div class="seg" role="group" aria-label="Periodo">${tabs}</div>
      </div>
      ${valueChart(shown)}
      <p class="muted small">Es el valor total de tu cuenta cada día, incluido el dinero que fuiste agregando.</p>
    </section>`;
}

function legacyHome(m) {
  const last = state.history.at(-1);
  return `
    <section class="hero">
      <p class="hero__line">Tu último registro: <strong class="num">${money(last.valor_total_usd)}</strong>.</p>
      <p class="lead">Para saber cuánto ganas de verdad y qué hacer, anota tus acciones de XTB (qué tienes, cuántas y a qué precio las compraste).</p>
      <button class="btn btn--primary btn--block" data-action="trade" data-kind="buy">Anotar mis acciones</button>
    </section>
    ${historySection(m)}`;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

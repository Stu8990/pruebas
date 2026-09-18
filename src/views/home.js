// Inicio: responde, en este orden, ¿cómo voy?, ¿por qué subí o bajé este mes?
// y ¿qué hago ahora? Todo en frases, con las cifras dentro.

import { state, nameOf } from '../data.js';
import { money, signedMoney, pct, tone, monthName, esc } from '../format.js';
import { valueChart } from '../ui/chart.js';

const RANGES = { '1m': 31, '3m': 92, 'todo': Infinity };
let range = '3m';
export function setRange(r) { if (RANGES[r]) range = r; }

export function renderHome(m) {
  if (!m.hasPositions && !m.hasHistory) return emptyHome();
  if (!m.hasPositions) return legacyHome(m);
  if (!m.pricesReady && state.status.market !== 'error') return loadingHome();
  return `
    ${hero(m)}
    ${monthSection(m)}
    ${actionsSection(m)}
    ${historySection(m)}
  `;
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
    <section class="hero" aria-labelledby="hero-title">
      <h1 id="hero-title" class="sr-only">Cómo voy</h1>
      <p class="hero__line">Tienes <strong class="num">${money(s.total)}</strong>${s.cash > 0 ? ` <span class="hero__aside">(${money(s.cash)} en efectivo)</span>` : ''}.</p>
      <p class="hero__line">Pusiste ${money(s.invested)} en acciones y vas <strong class="num ${tone(g)}">${verb} ${money(Math.abs(g))}</strong> <span class="${tone(g)}">(${pct(s.totalGainPct)})</span>.</p>
      ${s.realized ? `<p class="muted small">Incluye ${signedMoney(s.realized)} que ya ganaste al vender.</p>` : ''}
      ${partial}
      <dl class="periods">
        <div class="period"><dt>Hoy</dt><dd class="num ${tone(s.today)}">${signedMoney(s.today)}</dd></div>
        <div class="period"><dt>En ${esc(monthName(m.today))}</dt><dd class="num ${tone(month)}">${month === null ? '—' : signedMoney(month)}</dd></div>
        <div class="period"><dt>Desde que empezaste</dt><dd class="num ${tone(g)}">${signedMoney(g)}</dd></div>
      </dl>
    </section>`;
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

function actionsSection(m) {
  const items = m.actions.map(a => {
    const open = a.ticker ? `data-action="holding" data-ticker="${esc(a.ticker)}"` : a.kind === 'vacio' ? 'data-action="trade" data-kind="buy"' : 'data-action="go" data-tab="plan"';
    return `
      <li>
        <button class="todo todo--${esc(a.tone)}" ${open}>
          <span class="chip chip--${esc(a.tone)}">${esc(a.label)}</span>
          ${a.ticker ? `<span class="todo__who">${esc(nameOf(a.ticker))}${a.amount ? ` · unos ${money(a.amount)}` : ''}</span>` : ''}
          <span class="todo__why">${esc(a.reason)}</span>
        </button>
      </li>`;
  }).join('');
  return `
    <section class="block" aria-labelledby="todo-title">
      <h2 id="todo-title" class="block__title">¿Qué hago ahora?</h2>
      <ul class="todos">${items}</ul>
      <button class="btn btn--quiet btn--block" data-action="go" data-tab="plan">¿Dónde pongo mi próximo aporte?</button>
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

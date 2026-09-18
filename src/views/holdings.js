// Acciones: qué tienes, cuánto vale, cuánto ganas con cada una y qué hacer.
// Cada fila abre una hoja con el detalle y las operaciones.

import { state, nameOf } from '../data.js';
import { money, signedMoney, pct, shares, tone, shortDate, plainPct, esc } from '../format.js';

export function renderHoldings(m) {
  const s = m.summary;
  const list = s.holdings.map(h => row(h, m.verdicts[h.ticker])).join('');
  const sold = Object.keys(state.positions).filter(t => !s.holdings.some(h => h.ticker === t));
  return `
    <section class="block block--flush" aria-labelledby="hold-title">
      <div class="block__head">
        <h1 id="hold-title" class="title">Mis acciones</h1>
      </div>
      <div class="btn-row">
        <button class="btn btn--primary" data-action="trade" data-kind="buy">Anotar compra</button>
        <button class="btn btn--quiet" data-action="trade" data-kind="sell" ${s.holdings.length ? '' : 'disabled'}>Anotar venta</button>
      </div>
      ${s.holdings.length ? `<ul class="holdings">${list}</ul>` : `<p class="muted">Todavía no anotaste ninguna acción.</p>`}
      <button class="cash" data-action="cash">
        <span>Efectivo sin invertir en XTB</span>
        <strong class="num">${money(s.cash)}</strong>
        <span class="cash__edit">Cambiar</span>
      </button>
      ${sold.length ? `<p class="muted small">Vendiste todo de: ${sold.map(t => `<button class="link" data-action="holding" data-ticker="${esc(t)}">${esc(t)}</button>`).join(', ')}.</p>` : ''}
    </section>`;
}

function row(h, v) {
  const priced = h.value !== null;
  return `
    <li>
      <button class="holding" data-action="holding" data-ticker="${esc(h.ticker)}">
        <span class="holding__id">
          <span class="holding__name">${esc(nameOf(h.ticker))}</span>
          <span class="holding__meta">${esc(h.ticker)} · ${shares(h.shares)} ${h.shares === 1 ? 'acción' : 'acciones'}</span>
        </span>
        <span class="holding__nums">
          <span class="holding__value num">${priced ? money(h.value) : 'Sin precio'}</span>
          <span class="holding__gain num ${tone(h.gain)}">${priced ? `${signedMoney(h.gain)} (${pct(h.gainPct)})` : '—'}</span>
        </span>
        <span class="holding__foot">
          ${priced ? `<span class="weight" aria-label="Pesa ${plainPct(h.weight)} de tu dinero en acciones"><span class="weight__bar" style="--w:${Math.min(100, h.weight).toFixed(1)}%"></span><span class="weight__txt">${plainPct(h.weight)}</span></span>` : '<span></span>'}
          ${v ? `<span class="chip chip--${esc(v.tone)}">${esc(v.label)}</span>` : ''}
        </span>
      </button>
    </li>`;
}

// ── Hoja de detalle de una acción ────────────────────────────
export function holdingSheet(ticker, m) {
  const h = m.summary.holdings.find(x => x.ticker === ticker);
  const v = m.verdicts[ticker];
  const q = state.market[ticker] ?? {};
  const p = state.positions[ticker] ?? {};

  const verdict = v ? `
    <div class="verdict verdict--${esc(v.tone)}">
      <p class="verdict__label">${esc(v.label)}${v.amount ? `: unos ${money(v.amount)}` : ''}</p>
      <ul class="verdict__why">${v.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    </div>` : '';

  const facts = h ? `
    <dl class="facts">
      <div><dt>Vale hoy</dt><dd class="num">${money(h.value)}</dd></div>
      <div><dt>Ganancia</dt><dd class="num ${tone(h.gain)}">${signedMoney(h.gain)} <small>(${pct(h.gainPct)})</small></dd></div>
      <div><dt>Acciones</dt><dd class="num">${shares(h.shares)}</dd></div>
      <div><dt>Precio medio de compra</dt><dd class="num">${money(h.avgPrice, { cents: true })}</dd></div>
      <div><dt>Precio hoy</dt><dd class="num">${money(h.price, { cents: true })} <small class="${tone(h.changePercent)}">${pct(h.changePercent, 2)}</small></dd></div>
      <div><dt>Peso en tu cartera</dt><dd class="num">${plainPct(h.weight)}</dd></div>
      ${h.realized ? `<div><dt>Ya ganado al vender</dt><dd class="num ${tone(h.realized)}">${signedMoney(h.realized)}</dd></div>` : ''}
    </dl>` : `<p class="muted">Ya no tienes acciones de ${esc(ticker)}.</p>`;

  return `
    ${h ? `<p class="sheet__sub">${esc(ticker)}${q.name && q.name !== nameOf(ticker) ? ` · ${esc(q.name)}` : ''}</p>` : ''}
    ${verdict}
    ${facts}
    ${marketExplain(q)}
    <h3 class="sheet__h">Tus operaciones</h3>
    ${operations(ticker, p)}
    <div class="btn-row">
      <button class="btn btn--primary" data-action="trade" data-kind="buy" data-ticker="${esc(ticker)}">Anotar compra</button>
      ${h ? `<button class="btn btn--quiet" data-action="trade" data-kind="sell" data-ticker="${esc(ticker)}">Anotar venta</button>` : ''}
    </div>`;
}

// Lo que dicen los datos de mercado, cada uno en una frase.
export function marketExplain(q) {
  const items = [];
  const pe = q.forwardPe > 0 ? q.forwardPe : q.pe;
  if (pe > 0) {
    const level = pe <= 15 ? 'barata' : pe <= 25 ? 'con precio normal' : pe <= 35 ? 'algo cara' : 'cara';
    items.push(`<li><strong>¿Está cara?</strong> Pagas unas ${Math.round(pe)} veces lo que la empresa gana en un año: ${level} para una empresa típica. Las que crecen rápido suelen costar más.</li>`);
  }
  if (q.analystRating) {
    const txt = { COMPRAR: 'la mayoría recomienda comprar', MANTENER: 'la mayoría recomienda mantener, ni comprar ni vender', VENDER: 'la mayoría recomienda vender' }[q.analystRating];
    if (txt) items.push(`<li><strong>Analistas:</strong> ${txt}.</li>`);
  }
  if (q.week52High > q.week52Low && q.currentPrice > 0) {
    const r = Math.max(0, Math.min(1, (q.currentPrice - q.week52Low) / (q.week52High - q.week52Low)));
    items.push(`<li><strong>Este año</strong> costó entre ${money(q.week52Low)} y ${money(q.week52High)}.
      <span class="range" aria-hidden="true"><span class="range__dot" style="--x:${(r * 100).toFixed(1)}%"></span></span>
      Hoy está ${r > 0.85 ? 'cerca de su máximo' : r < 0.15 ? 'cerca de su mínimo' : 'en la zona media'}.</li>`);
  }
  if (!items.length) return '';
  return `<h3 class="sheet__h">Qué dicen los datos</h3><ul class="explain">${items.join('')}</ul>`;
}

function operations(ticker, p) {
  const ops = [
    ...(p.purchases ?? []).map((x, i) => ({ ...x, kind: 'buy', i })),
    ...(p.sales ?? []).map((x, i) => ({ ...x, kind: 'sell', i })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!ops.length) return '<p class="muted">Sin operaciones.</p>';
  return `<ul class="ops">${ops.map(o => `
    <li class="op">
      <span class="op__kind op__kind--${o.kind}">${o.kind === 'buy' ? 'Compra' : 'Venta'}</span>
      <span class="op__desc num">${shares(o.shares)} × ${money(+o.price, { cents: true })} = ${money(o.shares * o.price)}</span>
      <span class="op__date">${esc(shortDate(o.date))}</span>
      <button class="icon-btn icon-btn--small" data-action="del-trade" data-ticker="${esc(ticker)}" data-kind="${o.kind}" data-idx="${o.i}" aria-label="Borrar ${o.kind === 'buy' ? 'compra' : 'venta'} del ${esc(shortDate(o.date))}">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </li>`).join('')}</ul>`;
}

// ── Formulario de compra / venta ─────────────────────────────
export function tradeForm({ kind = 'buy', ticker = '', today, price = '' }) {
  const sell = kind === 'sell';
  const owned = Object.keys(state.positions).filter(t => (state.positions[t].purchases ?? []).length);
  return `
    <form id="trade-form" class="stack" novalidate>
      <div class="seg seg--block" role="radiogroup" aria-label="Tipo de operación">
        <label class="seg__opt"><input type="radio" name="kind" value="buy" ${sell ? '' : 'checked'}> Compra</label>
        <label class="seg__opt"><input type="radio" name="kind" value="sell" ${sell ? 'checked' : ''}> Venta</label>
      </div>
      <label class="field"><span class="field__label">Acción o ETF</span>
        <input name="ticker" value="${esc(ticker)}" placeholder="Ej.: VOO, NVDA, AAPL" autocomplete="off" autocapitalize="characters" spellcheck="false" list="owned-tickers" required ${ticker ? '' : 'autofocus'}>
        <datalist id="owned-tickers">${owned.map(t => `<option value="${esc(t)}">${esc(nameOf(t))}</option>`).join('')}</datalist>
        <span class="field__hint" data-ticker-hint>Escribe el símbolo o el nombre.</span>
      </label>
      <div class="suggest" data-suggest hidden></div>
      <label class="field"><span class="field__label">Fecha</span>
        <input name="date" type="date" value="${esc(today)}" max="${esc(today)}" required></label>
      <label class="field"><span class="field__label">Precio por acción (USD)</span>
        <span class="field__row">
          <input name="price" type="text" inputmode="decimal" autocomplete="off" value="${esc(price)}" placeholder="0.00" required>
          <button type="button" class="btn btn--quiet btn--small" data-action="use-price">Precio de hoy</button>
        </span>
        <span class="field__hint">En XTB es el «precio de apertura» de la posición.</span></label>
      <fieldset class="field">
        <legend class="field__label">¿Cuánto ${sell ? 'vendiste' : 'compraste'}?</legend>
        <div class="field__row">
          <input name="amount" type="text" inputmode="decimal" autocomplete="off" placeholder="Monto en USD" aria-label="Monto en USD">
          <span class="field__or">o</span>
          <input name="shares" type="text" inputmode="decimal" autocomplete="off" placeholder="Nº de acciones" aria-label="Número de acciones">
        </div>
        <span class="field__hint">En XTB el número de acciones se llama «volumen».</span>
      </fieldset>
      <p class="form-msg" role="alert" hidden></p>
      <button class="btn btn--primary btn--block" type="submit">${sell ? 'Guardar venta' : 'Guardar compra'}</button>
    </form>`;
}

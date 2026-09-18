// Más: cuenta, historial, registro manual, datos y cómo funciona la app.

import { state } from '../data.js';
import { money, signedMoney, shortDate, tone, esc } from '../format.js';

export function renderMore({ theme = 'light' } = {}) {
  const hist = [...state.history].reverse().slice(0, 30);
  const rows = hist.map((r, i) => {
    const prev = hist[i + 1];
    const d = prev ? r.valor_total_usd - prev.valor_total_usd : null;
    return `<li class="hrow"><span>${esc(shortDate(r.fecha))}</span><span class="num">${money(r.valor_total_usd)}</span><span class="num ${tone(d)}">${d === null ? '' : signedMoney(d)}</span></li>`;
  }).join('');
  return `
    <h1 class="title">Más</h1>

    <section class="block" aria-labelledby="how-title">
      <h2 id="how-title" class="block__title">Cómo funciona</h2>
      ${faq('¿De dónde salen los números?', 'De lo que anotas (qué compraste, cuántas acciones y a qué precio) y del precio de cada acción hoy, que viene de Yahoo Finance. La app no se conecta a tu cuenta de XTB: si compras o vendes allá, anótalo aquí.')}
      ${faq('¿Qué es «vas ganando»?', 'Lo que valen hoy tus acciones menos lo que pagaste por ellas, más lo que ya ganaste al vender. El dinero que agregas a tu cuenta no es ganancia, así que no se cuenta.')}
      ${faq('¿Por qué bajé este mes?', 'Para cada acción se compara su precio al empezar el mes con el de hoy, multiplicado por las acciones que tienes. Así ves en dólares cuánto aportó cada una a la subida o la bajada.')}
      ${faq('¿Cómo decide qué comprar o vender?', 'Con reglas fijas, no con adivinanzas. 1) No concentrar: ninguna empresa debería pesar más que el tope de tu perfil (15%, 20% o 30%). 2) Tener una base en fondos que reparten el riesgo, como VOO. 3) No comprar más de algo que está cara y en su máximo del año. 4) Revisar una acción cuando los analistas recomiendan venderla. Tu próximo aporte va a lo que está más por debajo de su peso.')}
      ${faq('¿Qué es el PER?', 'Cuántas veces pagas lo que la empresa gana en un año. Un PER de 20 significa que, si la empresa ganara siempre lo mismo, tardarías 20 años en «recuperar» el precio. Más alto = más cara; las empresas que crecen rápido suelen tenerlo alto.')}
      ${faq('¿Qué es un ETF o fondo?', 'Una sola compra que reparte tu dinero entre muchas empresas. VOO, por ejemplo, tiene las 500 más grandes de EE. UU. Si una cae, las demás amortiguan.')}
      ${faq('¿Y la IA?', 'Sólo explica con palabras tus números y las recomendaciones. Las cifras y las reglas no dependen de ella.')}
    </section>

    <section class="block" aria-labelledby="hist-list-title">
      <div class="block__head">
        <h2 id="hist-list-title" class="block__title">Historial</h2>
        <button class="btn btn--quiet btn--small" data-action="manual">Anotar valor a mano</button>
      </div>
      <p class="muted small">La app guarda el valor total de tu cuenta una vez al día cuando la abres.</p>
      ${rows ? `<ul class="hlist">${rows}</ul>` : '<p class="muted">Sin registros todavía.</p>'}
    </section>

    <section class="block" aria-labelledby="look-title">
      <h2 id="look-title" class="block__title">Apariencia</h2>
      <div class="seg seg--block" role="radiogroup" aria-labelledby="look-title">
        ${[['light', 'Claro'], ['dark', 'Oscuro'], ['auto', 'Automático']].map(([v, l]) => `
          <label class="seg__opt"><input type="radio" name="theme" value="${v}" data-action="theme" ${theme === v ? 'checked' : ''}> ${l}</label>`).join('')}
      </div>
      <p class="muted small">Automático sigue la configuración de tu teléfono.</p>
    </section>

    <section class="block" aria-labelledby="acct-title">
      <h2 id="acct-title" class="block__title">Tu cuenta</h2>
      <p class="muted">${esc(state.user?.email ?? '')}</p>
      <div class="list-actions">
        <button class="row-btn" data-action="export">Descargar mis datos</button>
        <button class="row-btn" data-action="password">Cambiar contraseña</button>
        <button class="row-btn" data-action="signout">Cerrar sesión</button>
        <button class="row-btn row-btn--danger" data-action="wipe" ${state.history.length ? '' : 'disabled'}>Borrar historial de valores</button>
      </div>
    </section>`;
}

function faq(q, a) {
  return `<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`;
}

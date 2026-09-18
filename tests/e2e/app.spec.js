import AxeBuilder from '@axe-core/playwright';
import { test, expect, mockBackend, TODAY } from './fixtures.js';

// Cada prueba falla si la página registra errores de JavaScript.
test.beforeEach(async ({ page }) => {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') page.__errors.push(m.text()); });
});
test.afterEach(async ({ page }) => {
  expect(page.__errors, 'errores en consola').toEqual([]);
});

async function open(page, hash = 'inicio', scenario) {
  const calls = await mockBackend(page, scenario);
  await page.goto('./#' + hash);
  await expect(page.locator('#app')).toBeVisible();
  return calls;
}

test('Inicio responde cómo voy, por qué bajé en el mes y qué hacer', async ({ page }) => {
  await open(page);
  const hero = page.locator('.hero');
  await expect(hero).toContainText('Tienes $4,079');
  await expect(hero).toContainText('Pusiste $3,096 en acciones y vas ganando $533');
  await expect(page.getByRole('heading', { name: '¿Por qué bajaste en septiembre?' })).toBeVisible();
  await expect(page.locator('#month-title + p')).toContainText('Casi todo viene de NVIDIA (−$176)');
  await expect(page.getByRole('heading', { name: '¿Qué hago ahora?' })).toBeVisible();
  await expect(page.locator('.todo').first()).toContainText('Vender una parte');
  await expect(page.locator('.todo').first()).toContainText('NVIDIA');
});

test('guarda el registro de hoy una sola vez con el valor total', async ({ page }) => {
  const calls = await open(page);
  await expect(page.locator('.hero')).toContainText('Tienes');
  await expect.poll(() => calls.inserts.length).toBe(1);
  const row = calls.inserts[0];
  expect(row.fecha).toBe(TODAY);
  expect(row.valor_total_usd).toBeCloseTo(4078.6, 0);
  // Actualizar precios de nuevo no duplica: pasa a actualizar el mismo día.
  await page.getByRole('button', { name: /Precios|Actualizar/ }).click();
  await expect.poll(() => calls.inserts.length).toBe(2);
  expect(calls.inserts[1].patch).toBeTruthy();
});

test('el registro automático no pisa un registro manual del mismo día', async ({ page }) => {
  const { buildHistory } = await import('./fixtures.js');
  const history = [...buildHistory(), { fecha: TODAY, fase: 'Registro manual', valor_total_usd: 5000, rendimientos: { _capitalInjected: 300 } }];
  const calls = await open(page, 'inicio', { history });
  await expect(page.locator('.hero')).toContainText('Tienes');
  await page.getByRole('button', { name: /Precios|Actualizar/ }).click();
  await expect(page.locator('#toast')).toContainText('Precios actualizados');
  expect(calls.inserts).toEqual([]);
});

test('una compra se guarda sobre los datos más recientes (otro dispositivo pudo cambiarlos)', async ({ page }) => {
  const calls = await open(page, 'acciones');
  await expect(page.locator('.holdings')).toContainText('NVIDIA');
  // Otro dispositivo agregó una compra de MSFT después de que esta pestaña cargó.
  calls.store.row.data.MSFT.purchases.push({ date: '2026-09-15', shares: 1, price: 450 });
  calls.store.row.updated_at = '2026-09-18T13:00:00.000Z';
  await page.getByRole('button', { name: 'Anotar compra' }).first().click();
  const f = page.locator('#trade-form');
  await f.getByLabel('Acción o ETF').fill('AAPL');
  await f.getByLabel('Precio por acción (USD)').fill('200');
  await f.getByLabel('Número de acciones').fill('1');
  await f.getByRole('button', { name: 'Guardar compra' }).click();
  await expect(page.locator('#toast')).toContainText('Compra de AAPL guardada');
  const saved = calls.store.row.data;
  expect(saved.MSFT.purchases.length).toBe(2);
  expect(saved.AAPL.purchases.length).toBe(1);
});

test('si otro dispositivo guarda en el mismo instante, reintenta y no pierde ninguna compra', async ({ page }) => {
  const calls = await open(page, 'acciones', {
    conflictOnce: store => {
      store.row = { data: { ...store.row.data, GOOGL: { purchases: [{ date: '2026-09-17', shares: 1, price: 170 }] } }, updated_at: '2026-09-18T14:00:00.000Z' };
    },
  });
  await expect(page.locator('.holdings')).toContainText('NVIDIA');
  await page.getByRole('button', { name: 'Anotar compra' }).first().click();
  const f = page.locator('#trade-form');
  await f.getByLabel('Acción o ETF').fill('AAPL');
  await f.getByLabel('Precio por acción (USD)').fill('200');
  await f.getByLabel('Número de acciones').fill('1');
  await f.getByRole('button', { name: 'Guardar compra' }).click();
  await expect(page.locator('#toast')).toContainText('Compra de AAPL guardada');
  expect(Object.keys(calls.store.row.data)).toEqual(expect.arrayContaining(['GOOGL', 'AAPL', 'NVDA']));
});

test('elegir un monto rápido reemplaza lo que se había escrito', async ({ page }) => {
  await open(page, 'plan');
  await page.getByLabel('¿Cuánto vas a invertir?').fill('750');
  await page.getByRole('button', { name: '$500' }).click();
  await expect(page.getByLabel('¿Cuánto vas a invertir?')).toHaveValue('500');
});

test('si Yahoo no tiene el precio de inicio de mes de un activo, no lo vuelve a pedir en cada refresco', async ({ page }) => {
  const calls = await open(page, 'inicio', { noMonthFor: ['SCHD'] });
  await expect(page.locator('.hero')).toContainText('Tienes');
  await page.getByRole('button', { name: /Precios|Actualizar/ }).click();
  await expect.poll(() => calls.market.filter(b => b.tickers).length).toBe(2);
  expect(calls.market.filter(b => b.tickers).at(-1).monthStart).toBeUndefined();
});

test('pide el precio de inicio de mes con el mes del usuario, y sólo la primera vez', async ({ page }) => {
  const calls = await open(page);
  await expect(page.locator('.hero')).toContainText('Tienes');
  const first = calls.market.find(b => b.tickers);
  expect(first.monthStart).toBe('2026-09-01');
  await page.getByRole('button', { name: /Precios|Actualizar/ }).click();
  await expect.poll(() => calls.market.filter(b => b.tickers).length).toBe(2);
  expect(calls.market.filter(b => b.tickers).at(-1).monthStart).toBeUndefined();
  // El dato del mes se conserva: la explicación del mes sigue ahí.
  await expect(page.locator('#month-title + p')).toContainText('NVIDIA');
});

test('actualizar precios no borra lo que el usuario está escribiendo', async ({ page }) => {
  await open(page, 'plan');
  await page.getByLabel('¿Cuánto vas a invertir?').fill('750');
  await page.getByLabel('Símbolo').fill('MSF');
  await page.getByLabel('Símbolo').focus();
  await page.getByRole('button', { name: /Precios|Actualizar/ }).dispatchEvent('click');
  await expect(page.locator('#toast')).toContainText('Precios actualizados');
  await expect(page.getByLabel('¿Cuánto vas a invertir?')).toHaveValue('750');
  await expect(page.getByLabel('Símbolo')).toHaveValue('MSF');
  await expect(page.getByLabel('Símbolo')).toBeFocused();
});

test('al pasar del detalle al formulario el foco queda dentro de la hoja', async ({ page }) => {
  await open(page, 'acciones');
  await page.getByRole('button', { name: /NVIDIA/ }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Anotar venta' }).click();
  await expect(sheet.getByRole('heading', { name: 'Anotar venta' })).toBeVisible();
  const inside = await page.evaluate(() => !!document.activeElement?.closest('dialog') && document.activeElement !== document.body);
  expect(inside).toBe(true);
});

test('abrir una acción muestra el veredicto con sus razones y lo que dicen los datos', async ({ page }) => {
  await open(page, 'acciones');
  await page.getByRole('button', { name: /NVIDIA/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'NVIDIA' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Vender una parte: unos $442');
  await expect(sheet).toContainText('Pesa 32% de tu dinero en acciones');
  await expect(sheet).toContainText('¿Está cara?');
  await expect(sheet).toContainText('Analistas:');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('anotar una compra la guarda y aparece en la lista', async ({ page }) => {
  const calls = await open(page, 'acciones');
  await page.getByRole('button', { name: 'Anotar compra' }).first().click();
  const f = page.locator('#trade-form');
  await f.getByLabel('Acción o ETF').fill('AAPL');
  await f.getByLabel('Precio por acción (USD)').fill('200');
  await f.getByLabel('Monto en USD').fill('400');
  await f.getByRole('button', { name: 'Guardar compra' }).click();
  await expect(page.locator('#toast')).toContainText('Compra de AAPL guardada');
  const saved = calls.positionWrites.at(-1).data;
  expect(saved.AAPL.purchases).toEqual([{ date: TODAY, shares: 2, price: 200 }]);
  expect(saved.NVDA.purchases.length).toBe(1);
  await expect(page.locator('.holdings')).toContainText('Apple');
});

test('acepta coma decimal al anotar una compra', async ({ page }) => {
  const calls = await open(page, 'acciones');
  await page.getByRole('button', { name: 'Anotar compra' }).first().click();
  const f = page.locator('#trade-form');
  await f.getByLabel('Acción o ETF').fill('VOO');
  await f.getByLabel('Precio por acción (USD)').fill('480,25');
  await f.getByLabel('Número de acciones').fill('0,5');
  await f.getByRole('button', { name: 'Guardar compra' }).click();
  await expect(page.locator('#toast')).toContainText('Compra de VOO guardada');
  expect(calls.positionWrites.at(-1).data.VOO.purchases.at(-1)).toEqual({ date: TODAY, shares: 0.5, price: 480.25 });
});

test('no deja vender más acciones de las que tienes', async ({ page }) => {
  const calls = await open(page, 'acciones');
  await page.getByRole('button', { name: 'Anotar venta' }).first().click();
  const f = page.locator('#trade-form');
  await f.getByLabel('Acción o ETF').fill('NVDA');
  await f.getByLabel('Precio por acción (USD)').fill('150');
  await f.getByLabel('Número de acciones').fill('9');
  await f.getByRole('button', { name: 'Guardar venta' }).click();
  await expect(f.locator('.form-msg')).toHaveText('Sólo tienes 8 acciones de NVDA.');
  expect(calls.positionWrites ?? []).toEqual([]);
});

test('una venta registrada reduce las acciones y suma la ganancia cobrada', async ({ page }) => {
  const calls = await open(page, 'acciones');
  await page.getByRole('button', { name: 'Anotar venta' }).first().click();
  const f = page.locator('#trade-form');
  await f.getByLabel('Acción o ETF').fill('NVDA');
  await f.getByLabel('Precio por acción (USD)').fill('150');
  await f.getByLabel('Número de acciones').fill('3');
  await f.getByRole('button', { name: 'Guardar venta' }).click();
  await expect(page.locator('#toast')).toContainText('Venta de NVDA guardada');
  expect(calls.positionWrites.at(-1).data.NVDA.sales).toEqual([{ date: TODAY, shares: 3, price: 150 }]);
  await expect(page.locator('.holding', { hasText: 'NVIDIA' })).toContainText('5 acciones');
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.locator('.hero')).toContainText('Incluye +$120 que ya ganaste al vender');
});

test('el plan reparte el aporte completo sin tocar lo que conviene recortar', async ({ page }) => {
  await open(page, 'plan');
  await page.getByRole('button', { name: '$500' }).click();
  const buys = page.locator('.buy');
  await expect(buys.first()).toBeVisible();
  const amounts = await page.locator('.buy__amt').allTextContents();
  const total = amounts.reduce((s, t) => s + Number(t.replace(/[$,]/g, '')), 0);
  expect(Math.abs(total - 500)).toBeLessThanOrEqual(2); // redondeo a dólares enteros
  await expect(page.locator('.buys')).not.toContainText('NVIDIA');
  await expect(page.getByRole('heading', { name: '¿Vendo algo?' }).locator('..')).toContainText('NVIDIA');
});

test('cambiar de perfil cambia las recomendaciones y se guarda en la cuenta', async ({ page }) => {
  const calls = await open(page, 'plan');
  await page.getByText('Agresivo', { exact: true }).click();
  await expect(page.locator('#profile-title ~ p')).toContainText('no más de 30% en una sola empresa');
  await expect.poll(() => (calls.userUpdates ?? []).some(u => u.data?.profile === 'agresivo')).toBe(true);
});

test('revisar otra acción da un solo veredicto con explicación', async ({ page }) => {
  await open(page, 'plan');
  await page.getByLabel('Símbolo').fill('aapl');
  await page.getByRole('button', { name: 'Revisar' }).click();
  const c = page.locator('.candidate');
  await expect(c).toContainText('Apple Inc.');
  await expect(c).toContainText('Puede encajar');
  await expect(c).toContainText('no pongas más de');
});

test('si la IA falla, lo dice y el resto del plan sigue funcionando', async ({ page }) => {
  await open(page, 'plan', { aiFails: true });
  await page.getByRole('button', { name: '¿Debo vender algo?' }).click();
  await expect(page.locator('.notice--bad')).toContainText('No pude responder: Servicio no configurado');
  await expect(page.getByRole('heading', { name: '¿Vendo algo?' })).toBeVisible();
  // El 500 simulado de la Edge Function aparece como recurso fallido: es esperado.
  page.__errors = page.__errors.filter(e => !e.includes('500'));
});

test('al enviar una pregunta a la IA la caja queda vacía para la siguiente', async ({ page }) => {
  await open(page, 'plan');
  await page.getByLabel('Tu pregunta').fill('¿Vendo NVIDIA?');
  await page.getByRole('button', { name: 'Preguntar' }).click();
  await expect(page.locator('.answer__q')).toHaveText('¿Vendo NVIDIA?');
  await expect(page.getByLabel('Tu pregunta')).toHaveValue('');
});

test('la IA recibe las recomendaciones calculadas por la app', async ({ page }) => {
  const calls = await open(page, 'plan');
  await page.getByRole('button', { name: '¿Debo vender algo?' }).click();
  await expect(page.locator('.answer')).toContainText('Respuesta de prueba del asesor.');
  const body = calls.ai.at(-1);
  expect(body.mode).toBe('advisor');
  expect(body.facts.verdicts.find(v => v.ticker === 'NVDA').action).toBe('Vender una parte');
  expect(body.facts.monthTotal).toBeLessThan(0);
});

test('usuario nuevo ve cómo empezar, no un tablero vacío', async ({ page }) => {
  await open(page, 'inicio', { positions: {}, history: [] });
  await expect(page.getByRole('heading', { name: 'Empecemos por lo que tienes en XTB.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anotar mi primera compra' })).toBeVisible();
});

test('si no llegan precios lo explica y ofrece reintentar', async ({ page }) => {
  await mockBackend(page);
  await page.route('**/functions/v1/market-data', r => r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'No se pudo autenticar con Yahoo Finance' }), headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('./#inicio');
  await expect(page.locator('.hero')).toContainText('No pude traer los precios de hoy.');
  await expect(page.locator('.hero')).toContainText('No se pudo autenticar con Yahoo Finance');
  await expect(page.locator('.refresh')).toContainText('Reintentar');
  page.__errors = page.__errors.filter(e => !e.includes('502'));
});

test('el acceso y las hojas no se desbordan a lo ancho en teléfonos pequeños', async ({ page }) => {
  // Sin service worker: en WebKit las peticiones que pasan por él esquivan el
  // simulador de Playwright y llegarían al Supabase real.
  await page.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ update() {} }); });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 640 });
    await page.goto('./');
    await expect(page.locator('#form-login')).toBeVisible();
    expect(await overflow(), `acceso a ${width}px`).toBeLessThanOrEqual(0);
  }
  await mockBackend(page);
  await page.goto('./?con-sesion#acciones'); // URL distinta: recarga de verdad
  await page.getByRole('button', { name: /NVIDIA/ }).first().click();
  expect(await page.locator('dialog').evaluate(d => d.scrollWidth - d.clientWidth), 'hoja de detalle').toBeLessThanOrEqual(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Anotar compra' }).click();
  expect(await page.locator('dialog').evaluate(d => d.scrollWidth - d.clientWidth), 'formulario').toBeLessThanOrEqual(0);
  expect(await overflow(), 'página con hoja abierta').toBeLessThanOrEqual(0);
  page.__errors = page.__errors.filter(e => !/Failed to load resource/.test(e));
});

// Se mide cada elemento contra el ancho de la pantalla. Medir sólo el ancho
// del documento no basta: body tiene overflow-x:hidden, que en el emulador
// oculta el desborde, pero Safari de iPhone lo ignora y agranda la página.
async function wideElements(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    return [...document.querySelectorAll('#view *, .tabs, .topbar')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > W + 1 || r.left < -1); })
      .map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} → ${Math.round(el.getBoundingClientRect().right)}px de ${W}`)
      .slice(0, 5);
  });
}

test('ninguna pantalla se desborda a lo ancho en un teléfono pequeño', async ({ page }) => {
  // Respuesta de IA con cadenas largas sin espacios, como las reales.
  await mockBackend(page, { aiAnswer: 'Tu cartera VOO/SCHD/NVDA/MSFT/AMZN/VISA/GOOGL/META está bien. Mira https://finance.yahoo.com/quote/NVDA/key-statistics?p=NVDA&.tsrc=fin-srch para más.' });
  // Con las fuentes reales: la de respaldo es más estrecha y escondía el fallo.
  await page.route('https://fonts.googleapis.com/**', r => r.continue());
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 700 });
    for (const tab of ['inicio', 'acciones', 'plan', 'mas']) {
      await page.goto(`./?w=${width}#${tab}`);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('#view')).not.toBeEmpty();
      await expect(page.locator('.refresh')).toContainText('Precios');
      if (tab === 'plan') {
        await page.getByRole('button', { name: '$500' }).click();
        await page.getByLabel('Símbolo').fill('AAPL');
        await page.getByRole('button', { name: 'Revisar' }).click();
        await expect(page.locator('.candidate')).toBeVisible();
        await page.getByRole('button', { name: '¿Debo vender algo?' }).click();
        await expect(page.locator('.answer')).toBeVisible();
      }
      expect(await wideElements(page), `${tab} a ${width}px`).toEqual([]);
      const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(extra, `${tab} a ${width}px: la página es ${extra}px más ancha que la pantalla`).toBeLessThanOrEqual(0);
    }
  }
});
// Cuenta B: otro id, una sola posición (AAPL), y su carga tarda en llegar.
async function routeAccountB(page) {
  // Cuenta B: otro id, una sola posición, y su carga tarda en llegar.
  const B = { id: '00000000-0000-4000-8000-00000000000b', aud: 'authenticated', role: 'authenticated', email: 'b@test', user_metadata: {}, app_metadata: {} };
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'HS256' })}.${b64({ sub: B.id, exp: 4102444800 })}.sig`;
  const bWrites = [];
  await page.route('https://fjufxwkhjgbkhqvpmryb.supabase.co/**', async route => {
    const req = route.request(); const u = new URL(req.url());
    const json = (b, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(b), headers: { 'access-control-allow-origin': '*' } });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.startsWith('/auth/v1/token')) return json({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: B });
    if (u.pathname === '/auth/v1/user') return json(B);
    if (u.pathname === '/rest/v1/user_positions') {
      if (req.method() !== 'GET') { bWrites.push(req.postDataJSON()); return json([], 201); }
      await new Promise(r => setTimeout(r, 1500));
      return json([{ data: { AAPL: { purchases: [{ date: '2026-09-01', shares: 1, price: 200 }] } } }]);
    }
    if (u.pathname === '/rest/v1/sessions') { await new Promise(r => setTimeout(r, 1500)); return json([]); }
    return route.fallback();
  });

  return bWrites;
}

async function signOutAndInAsB(page) {
  await page.getByRole('link', { name: 'Más' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.locator('#form-login')).toBeVisible();
  await page.locator('#form-login').getByLabel('Correo').fill('b@test');
  await page.locator('#form-login').getByLabel('Contraseña', { exact: true }).fill('secreta');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#app')).toBeVisible();
}

test('al cambiar de cuenta no se ve ni se guarda nada de la cuenta anterior', async ({ page }) => {
  const calls = await open(page, 'acciones');
  await expect(page.locator('.holdings')).toContainText('NVIDIA');

  const bWrites = await routeAccountB(page);

  await page.getByRole('link', { name: 'Más' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.locator('#form-login')).toBeVisible();
  await page.locator('#form-login').getByLabel('Correo').fill('b@test');
  await page.locator('#form-login').getByLabel('Contraseña', { exact: true }).fill('secreta');
  // Vigía: anota si la app visible muestra algo de A aunque sea un instante.
  await page.evaluate(() => {
    window.__leak = [];
    setInterval(() => {
      const app = document.getElementById('app');
      const txt = document.getElementById('view')?.textContent ?? '';
      // Nombres de sus acciones o montos de su historial ($3,xxx / $4,xxx).
      if (!app.hidden && /NVIDIA|Vanguard|Microsoft|\$[34],\d{3}/.test(txt)) window.__leak.push(txt.slice(0, 80));
    }, 20);
  });
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#app')).toBeVisible();
  await page.evaluate(() => { location.hash = 'acciones'; });
  await expect(page.locator('.holdings')).toContainText('Apple', { timeout: 8000 });
  expect(await page.evaluate(() => window.__leak.length), 'se vio la cartera de la cuenta anterior').toBe(0);
  await expect(page.locator('.holdings')).not.toContainText('NVIDIA');
  expect(bWrites).toEqual([]);
  expect(calls.positionWrites ?? []).toEqual([]);
});

test('una respuesta tardía de la IA pedida por la cuenta anterior no aparece en la nueva', async ({ page }) => {
  await open(page, 'plan');
  await page.route('**/functions/v1/ai-analysis', async route => {
    await new Promise(r => setTimeout(r, 1200));
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ answer: 'Respuesta para la cuenta A' }) });
  });
  await page.route('**/functions/v1/market-data', async route => {
    const body = route.request().postDataJSON();
    if (body?.tickers?.includes('AAPL') && body.tickers.length === 1) await new Promise(r => setTimeout(r, 1200));
    return route.fallback();
  });
  await page.getByRole('button', { name: '¿Debo vender algo?' }).click();
  await page.getByLabel('Símbolo').fill('AAPL');
  await page.getByRole('button', { name: 'Revisar' }).click();
  await routeAccountB(page);
  await signOutAndInAsB(page);
  await page.evaluate(() => { location.hash = 'plan'; });
  await expect(page.getByRole('heading', { name: 'Pregúntale a la IA' })).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('.answer')).toHaveCount(0);
  await expect(page.locator('.candidate')).toHaveCount(0);
});

test('la app es clara por defecto aunque el teléfono esté en modo oscuro, y se puede cambiar', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, 'mas');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bg();
  const [r, g, b] = light.match(/\d+/g).map(Number);
  expect(r + g + b, `fondo ${light} debería ser claro`).toBeGreaterThan(600);
  await page.getByText('Oscuro', { exact: true }).click();
  await expect.poll(async () => (await bg()).match(/\d+/g).map(Number).reduce((a, x) => a + x, 0)).toBeLessThan(150);
  await page.reload();
  await expect(page.locator('#view')).not.toBeEmpty();
  expect((await bg()).match(/\d+/g).map(Number).reduce((a, x) => a + x, 0)).toBeLessThan(150);
});

// Una prueba por pantalla: axe tarda varios segundos por análisis y, juntas,
// superaban el límite de 30 s con la máquina cargada.
for (const tab of ['inicio', 'acciones', 'plan', 'mas']) {
  test(`la pantalla ${tab} no tiene fallos de accesibilidad graves`, async ({ page }) => {
    await mockBackend(page);
    await page.goto('./#' + tab);
    await expect(page.locator('#view')).not.toBeEmpty();
    await expect(page.locator('.refresh')).toContainText('Precios');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = r.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    expect(serious.map(v => `${v.id} — ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  });
}

// Sin mockBackend: aquí el service worker real se registra. Esta prueba cazó
// que la primera activación recargaba la página y borraba lo escrito.
test('la pantalla de acceso valida y muestra errores claros', async ({ page }) => {
  await page.route('https://fjufxwkhjgbkhqvpmryb.supabase.co/**', r => r.fulfill({
    status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }),
  }));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Tu cartera de XTB, explicada en simple.' })).toBeVisible();
  await page.locator('#form-login').getByLabel('Correo').fill('a@b.com');
  await page.locator('#form-login').getByLabel('Contraseña', { exact: true }).fill('malapass');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#form-login .form-msg')).toHaveText('Correo o contraseña incorrectos.');
  page.__errors = page.__errors.filter(e => !e.includes('400'));
});

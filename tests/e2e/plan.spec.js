import { test, expect, mockBackend } from './fixtures.js';

async function openPlan(page, scenario) {
  const calls = await mockBackend(page, scenario);
  await page.goto('./#plan');
  await expect(page.getByRole('heading', { name: 'Tu plan' })).toBeVisible();
  await expect(page.locator('.refresh')).toContainText('Precios');
  return calls;
}

test('revisar otra acción y la IA empiezan plegadas', async ({ page }) => {
  await openPlan(page);
  await expect(page.getByLabel('Símbolo')).toBeHidden();
  await expect(page.getByLabel('Tu pregunta')).toBeHidden();
  await page.getByText('Revisar otra acción').click();
  await expect(page.getByLabel('Símbolo')).toBeVisible();
});

test('el aporte del mes es lo primero que se ve al abrir la app', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await mockBackend(page);
  await page.goto('./#inicio');
  await expect(page.locator('.plan-month .buy').first()).toBeInViewport();
});

test('revisar una acción del plan dice qué papel tiene; una de fuera lo advierte', async ({ page }) => {
  await openPlan(page);
  await page.getByText('Revisar otra acción').click();
  await page.getByLabel('Símbolo').fill('SCHD');
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  await expect(page.locator('.candidate')).toContainText('Está en tu lista de venta');
  await page.getByLabel('Símbolo').fill('AAPL');
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  await expect(page.locator('.candidate')).toContainText('No está en tu plan');
});

test('Diseño es lo primero en Más y muestra las tres opciones con su vista previa', async ({ page }) => {
  await mockBackend(page);
  await page.goto('./#mas');
  const first = page.locator('#view .block').first();
  await expect(first.getByRole('heading', { level: 2 })).toHaveText('Diseño');
  const options = first.locator('.design');
  await expect(options).toHaveCount(3);
  for (const name of ['Jacarandá', 'Ámbar', 'Guayaba']) {
    const opt = options.filter({ hasText: name });
    await expect(opt.locator('.design__preview')).toBeVisible();
    await expect(opt.locator('.design__desc')).not.toBeEmpty();
  }
});

test('se puede elegir el estilo de color y queda guardado', async ({ page }) => {
  await mockBackend(page);
  await page.goto('./#mas');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'jacaranda');
  const brand = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toUpperCase());
  expect(await brand()).toBe('#6B3FA0');
  await page.getByText('Ámbar', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'ambar');
  expect(await brand()).toBe('#7B5700');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'ambar');
});

test('una cuenta sin plan no ve consejos de compra ni el plan de otro', async ({ page }) => {
  const calls = await mockBackend(page, { plan: null });
  await page.goto('./#inicio');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Crea tu plan y te digo dónde poner cada aporte');
  await expect(page.locator('.buys')).toHaveCount(0);
  await expect(page.locator('#view')).not.toContainText('CSPX');
  await page.goto('./#acciones');
  await expect(page.locator('.holding').first()).toBeVisible();
  await expect(page.locator('.holding .chip')).toHaveCount(0);

  // La IA recibe que no hay plan.
  await page.goto('./#plan');
  await page.getByText('Pregúntale a la IA').click();
  await page.getByLabel('Tu pregunta').fill('¿Qué compro?');
  await page.getByRole('button', { name: 'Preguntar' }).click();
  await expect.poll(() => calls.ai.length).toBe(1);
  expect(calls.ai[0].facts.plan).toBeNull();
  expect(calls.ai[0].facts.verdicts).toEqual([]);
});

test('crear el plan desde la app lo guarda en la cuenta y Inicio lo usa', async ({ page }) => {
  const calls = await mockBackend(page, { plan: null });
  await page.goto('./#plan');
  await page.getByRole('button', { name: 'Crear mi plan' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByLabel('Símbolo 1')).toHaveValue('CSPX');
  await expect(sheet.getByLabel('Peso 2 en %')).toHaveValue('20');

  // Validación: más de 100% no se guarda.
  await sheet.getByLabel('Símbolo 3').fill('MSFT');
  await sheet.getByLabel('Peso 3 en %').fill('10');
  await sheet.getByRole('button', { name: 'Guardar plan' }).click();
  await expect(sheet.locator('.form-msg')).toContainText('suman 110%');

  await sheet.getByLabel('Peso 1 en %').fill('70');
  await sheet.getByLabel('Qué hacer con NVIDIA').selectOption('frozen');
  await expect(sheet.getByLabel('Tope de NVIDIA en %')).toBeVisible();
  await sheet.getByLabel('Qué hacer con Amazon').selectOption('now');
  await sheet.getByRole('button', { name: 'Guardar plan' }).click();
  await expect(sheet).toBeHidden();

  const saved = calls.userUpdates.at(-1).data.plan;
  expect(saved.targets).toEqual([{ ticker: 'CSPX', pct: 70 }, { ticker: 'EIMI', pct: 20 }, { ticker: 'MSFT', pct: 10 }]);
  expect(saved.frozen).toEqual([{ ticker: 'NVDA', max: 10 }]);
  expect(saved.exits).toEqual([{ ticker: 'AMZN', now: true }]);

  await expect(page.locator('.plandef')).toContainText('S&P 500 (CSPX)');
  await expect(page.locator('#view')).toContainText('Lo que vas a vender');
  await page.goto('./#inicio');
  await expect(page.locator('.plan-month .buy').first()).toBeVisible();
  await expect(page.locator('.plan-month')).not.toContainText('AMZN');
});

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

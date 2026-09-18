import { test, expect, mockBackend, LONG_POSITIONS } from './fixtures.js';

async function openPlan(page, scenario) {
  const calls = await mockBackend(page, scenario);
  await page.goto('./#plan');
  await expect(page.getByRole('heading', { name: 'Tu plan' })).toBeVisible();
  await expect(page.locator('.refresh')).toContainText('Precios');
  return calls;
}

test('el Plan muestra sólo lo que requiere atención y resume el resto', async ({ page }) => {
  await openPlan(page, { positions: LONG_POSITIONS });
  const attention = page.locator('#attention');
  await expect(attention.getByRole('heading', { name: 'Atención ahora' })).toBeVisible();
  const items = attention.locator('.todo');
  expect(await items.count()).toBeLessThanOrEqual(3);
  await expect(items.first()).toContainText('NVIDIA');
  await expect(attention.locator('.calm')).toContainText(/Las otras \d+ están para mantener/);
  await expect(attention.getByRole('link', { name: 'Ver todas en Acciones' })).toHaveAttribute('href', '#acciones');
  // Ya no se repite el inventario completo de Acciones.
  await expect(page.locator('.verdicts')).toHaveCount(0);
});

test('el perfil de riesgo es una línea compacta que se despliega para cambiarlo', async ({ page }) => {
  const calls = await openPlan(page);
  await expect(page.locator('#profile')).toContainText('Perfil: Equilibrado');
  await expect(page.getByText('Agresivo', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Cambiar perfil' }).click();
  await page.getByText('Agresivo', { exact: true }).click();
  await expect(page.locator('#profile')).toContainText('Perfil: Agresivo');
  await expect(page.getByText('Conservador', { exact: true })).toBeHidden();
  await expect.poll(() => (calls.userUpdates ?? []).some(u => u.data?.profile === 'agresivo')).toBe(true);
});

test('revisar otra acción y la IA empiezan plegadas', async ({ page }) => {
  await openPlan(page);
  await expect(page.getByLabel('Símbolo')).toBeHidden();
  await expect(page.getByLabel('Tu pregunta')).toBeHidden();
  await page.getByText('Revisar otra acción').click();
  await expect(page.getByLabel('Símbolo')).toBeVisible();
});

test('el próximo aporte es lo primero que se ve y no hay que buscarlo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openPlan(page);
  await expect(page.getByRole('button', { name: '$500' })).toBeInViewport();
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

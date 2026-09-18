import { test, expect, REF, USER } from './fixtures.js';

// Supabase simulado SIN sesión iniciada: para las pantallas de acceso.
async function mockAuth(page) {
  const calls = { recover: [], updates: [] };
  await page.route(`https://${REF}.supabase.co/**`, async route => {
    const req = route.request(); const u = new URL(req.url());
    const json = (b, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(b), headers: { 'access-control-allow-origin': '*' } });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname === '/auth/v1/recover') { calls.recover.push({ query: u.search, body: req.postDataJSON() }); return json({}); }
    if (u.pathname === '/auth/v1/user') {
      if (req.method() === 'PUT') { calls.updates.push(req.postDataJSON()); return json(USER); }
      return json(USER);
    }
    if (u.pathname === '/rest/v1/user_positions') return json([]);
    if (u.pathname === '/rest/v1/sessions') return json([]);
    return json({});
  });
  await page.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ update() {} }); });
  return calls;
}

test('olvidé mi contraseña pide el enlace para volver a esta misma app', async ({ page }) => {
  const calls = await mockAuth(page);
  await page.goto('./');
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
  await page.locator('#form-forgot').getByLabel('Correo').fill('yo@correo.com');
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.locator('#form-forgot .form-msg')).toContainText('Te enviamos un enlace a yo@correo.com');
  expect(calls.recover).toHaveLength(1);
  expect(decodeURIComponent(calls.recover[0].query)).toContain('redirect_to=http://localhost:3100/pruebas/');
});

test('al abrir el enlace del correo pide crear la contraseña nueva antes de entrar', async ({ page }) => {
  const calls = await mockAuth(page);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'HS256' })}.${b64({ sub: USER.id, exp: 4102444800 })}.sig`;
  await page.goto(`./#access_token=${token}&expires_at=4102444800&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery`);
  await expect(page.getByRole('heading', { name: 'Crea tu contraseña nueva' })).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  const f = page.locator('#form-reset');
  await f.getByLabel('Contraseña nueva').fill('nueva123');
  await f.getByLabel('Repítela').fill('nueva123');
  await f.getByRole('button', { name: 'Guardar y entrar' }).click();
  await expect(page.locator('#app')).toBeVisible();
  expect(calls.updates.at(-1)).toMatchObject({ password: 'nueva123' });
});

test('si el enlace del correo caducó lo dice y deja pedir otro', async ({ page }) => {
  await mockAuth(page);
  await page.goto('./#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.locator('#form-forgot')).toBeVisible();
  await expect(page.locator('#form-forgot .form-msg')).toContainText('El enlace caducó');
});

test('en el celular el botón de entrar queda a mano sin hacer scroll y se puede ver la contraseña', async ({ page }) => {
  await mockAuth(page);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('./');
  const btn = page.getByRole('button', { name: 'Entrar', exact: true });
  await expect(btn).toBeInViewport({ ratio: 1 });
  const box = await btn.boundingBox();
  expect(box.y, 'el botón debe estar en la mitad inferior, al alcance del pulgar').toBeGreaterThan(780 / 2);
  const pwd = page.locator('#form-login').getByLabel('Contraseña', { exact: true });
  await pwd.fill('secreta');
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
  await expect(pwd).toHaveAttribute('type', 'text');
});

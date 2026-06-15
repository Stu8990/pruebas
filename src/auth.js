import { SUPA_URL, SUPA_KEY } from './config.js';
import { setSyncState } from './sync.js';
import { toast } from './utils.js';

/* global supabase */
const { createClient } = supabase;

export const db = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export function createAuthenticatedClient(accessToken) {
  return createClient(SUPA_URL, SUPA_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth:   { persistSession: false, autoRefreshToken: false },
  });
}

function showAuthErr(msg) {
  const e = document.getElementById('auth-err');
  if (e) { e.textContent = msg; e.style.display = msg ? 'block' : 'none'; }
}

export function toggleAuthPwd() {
  const inp = document.getElementById('auth-password');
  if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
}

export async function loginWithPassword() {
  const email = document.getElementById('auth-email').value.trim();
  const pwd   = document.getElementById('auth-password').value;
  if (!email || !pwd) { showAuthErr('Completa correo y contraseña'); return; }
  showAuthErr('');
  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Entrando…';
  const { error } = await db.auth.signInWithPassword({ email, password: pwd });
  btn.disabled = false; btn.textContent = 'Entrar a mi portafolio';
  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('email not confirmed'))
      showAuthErr('Correo no confirmado. Ve a Supabase → Authentication → Providers → Email y desactiva "Confirm email".');
    else if (msg.includes('invalid login') || msg.includes('invalid credentials'))
      showAuthErr('Correo o contraseña incorrectos.');
    else
      showAuthErr('Error: ' + error.message);
  }
}

export function showForgot() {
  document.getElementById('auth-login-form').style.display  = 'none';
  document.getElementById('auth-forgot-form').style.display = 'block';
}

export function backToLogin() {
  document.getElementById('auth-forgot-form').style.display = 'none';
  document.getElementById('auth-login-form').style.display  = 'block';
}

export async function sendReset() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) return;
  await db.auth.resetPasswordForEmail(email);
  const msg = document.getElementById('forgot-msg');
  if (msg) { msg.textContent = 'Enlace enviado. Revisa tu correo.'; msg.style.display = 'block'; }
}

export function showChangePwd() {
  const m = document.getElementById('pwd-modal');
  if (m) m.style.display = 'flex';
}

export function closePwdModal() {
  const m = document.getElementById('pwd-modal');
  if (m) m.style.display = 'none';
  const e = document.getElementById('pwd-err');
  if (e) e.style.display = 'none';
}

export async function changePassword() {
  const p1 = document.getElementById('new-pwd').value;
  const p2 = document.getElementById('new-pwd2').value;
  const err = document.getElementById('pwd-err');
  if (!p1 || p1.length < 6) { if (err) { err.textContent = 'Mínimo 6 caracteres'; err.style.display = 'block'; } return; }
  if (p1 !== p2)             { if (err) { err.textContent = 'Las contraseñas no coinciden'; err.style.display = 'block'; } return; }
  const { error } = await db.auth.updateUser({ password: p1 });
  if (error) { if (err) { err.textContent = 'Error: ' + error.message; err.style.display = 'block'; } return; }
  closePwdModal();
  toast('✓ Contraseña actualizada');
}

export async function signOut() {
  await db.auth.signOut();
}


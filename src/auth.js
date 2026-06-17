import { SUPA_URL, SUPA_KEY } from './config.js';
import { setSyncState } from './sync.js';
import { toast } from './utils.js';

/* global supabase */
const { createClient } = supabase;

export const db = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});


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
  document.getElementById('auth-signup-form').style.display = 'none';
  document.getElementById('auth-forgot-form').style.display = 'block';
}

export function backToLogin() {
  document.getElementById('auth-forgot-form').style.display = 'none';
  document.getElementById('auth-signup-form').style.display = 'none';
  document.getElementById('auth-login-form').style.display  = 'block';
}

export function showSignup() {
  document.getElementById('auth-login-form').style.display  = 'none';
  document.getElementById('auth-forgot-form').style.display = 'none';
  document.getElementById('auth-signup-form').style.display = 'block';
  document.getElementById('signup-email')?.focus();
}

export function toggleSignupPwd() {
  const inp = document.getElementById('signup-password');
  if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
}

export async function signUp() {
  const email = document.getElementById('signup-email')?.value.trim();
  const pwd   = document.getElementById('signup-password')?.value;
  const pwd2  = document.getElementById('signup-password2')?.value;
  const err   = document.getElementById('signup-err');

  const show = (msg, color = 'var(--danger)') => {
    if (err) { err.textContent = msg; err.style.color = color; err.style.display = 'block'; }
  };
  const hide = () => { if (err) err.style.display = 'none'; };

  if (!email || !pwd)  { show('Completa todos los campos'); return; }
  if (pwd.length < 6)  { show('La contraseña debe tener al menos 6 caracteres'); return; }
  if (pwd !== pwd2)    { show('Las contraseñas no coinciden'); return; }
  hide();

  const btn = document.getElementById('btn-signup');
  btn.disabled = true; btn.textContent = 'Creando cuenta…';
  const { data, error } = await db.auth.signUp({ email, password: pwd });
  btn.disabled = false; btn.textContent = 'Crear cuenta';

  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('already registered') || msg.includes('user already'))
      show('Este correo ya tiene cuenta. Inicia sesión.');
    else
      show('Error: ' + error.message);
    return;
  }

  if (data.session) {
    // Confirmación de email desactivada → ya está autenticado, onAuthStateChange lo maneja
    hide();
  } else {
    // Supabase requiere confirmar el email
    show('✓ ¡Cuenta creada! Revisa tu correo para confirmar y luego inicia sesión.', 'var(--success)');
    btn.textContent = 'Revisa tu correo';
  }
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


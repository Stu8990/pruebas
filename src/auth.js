// Autenticación. El único cliente Supabase de la app vive aquí: todos los
// módulos importan `db`. Un segundo createClient() provoca el aviso
// "Multiple GoTrueClient" y sesiones que se pisan.

import { SUPA_URL, SUPA_KEY } from './config.js';

const { createClient } = supabase;

export const db = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Cada función devuelve { error?: string, info?: string } con un mensaje listo
// para mostrar. No tocan el DOM.

export async function signIn(email, password) {
  if (!email || !password) return { error: 'Escribe tu correo y tu contraseña.' };
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (!error) return {};
  const m = error.message?.toLowerCase() ?? '';
  if (m.includes('email not confirmed')) return { error: 'Confirma tu correo con el enlace que te enviamos y vuelve a entrar.' };
  if (m.includes('invalid')) return { error: 'Correo o contraseña incorrectos.' };
  return { error: `No se pudo entrar: ${error.message}` };
}

export async function signUp(email, password, password2) {
  if (!email || !password) return { error: 'Completa todos los campos.' };
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };
  if (password !== password2) return { error: 'Las contraseñas no coinciden.' };
  const { data, error } = await db.auth.signUp({ email, password });
  if (error) {
    const m = error.message?.toLowerCase() ?? '';
    if (m.includes('already')) return { error: 'Ese correo ya tiene cuenta. Entra con tu contraseña.' };
    return { error: `No se pudo crear la cuenta: ${error.message}` };
  }
  if (data.session) return {};
  return { info: 'Cuenta creada. Revisa tu correo para confirmarla y luego entra.' };
}

export async function sendReset(email) {
  if (!email) return { error: 'Escribe tu correo.' };
  const { error } = await db.auth.resetPasswordForEmail(email);
  if (error) return { error: `No se pudo enviar: ${error.message}` };
  return { info: 'Enlace enviado. Revisa tu correo.' };
}

export async function changePassword(p1, p2) {
  if (!p1 || p1.length < 6) return { error: 'Mínimo 6 caracteres.' };
  if (p1 !== p2) return { error: 'Las contraseñas no coinciden.' };
  const { error } = await db.auth.updateUser({ password: p1 });
  if (error) return { error: `No se pudo cambiar: ${error.message}` };
  return { info: 'Contraseña actualizada.' };
}

export async function signOut() {
  await db.auth.signOut();
}

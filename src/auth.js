// Autenticación. El único cliente Supabase de la app vive aquí: todos los
// módulos importan `db`. Un segundo createClient() provoca el aviso
// "Multiple GoTrueClient" y sesiones que se pisan.

import { SUPA_URL, SUPA_KEY } from './config.js';

// Lo que trae la URL al volver del correo de «olvidé mi contraseña». Se lee
// ANTES de crear el cliente: Supabase consume y borra esos parámetros al
// iniciar, y la app necesita saber que hay que pedir una contraseña nueva.
function readLanding() {
  const p = new URLSearchParams(location.hash.slice(1));
  return {
    recovery: p.get('type') === 'recovery' && p.has('access_token'),
    error: p.get('error_code') || p.get('error') || null,
  };
}
export const landing = readLanding();

// Dirección a la que debe volver el enlace del correo: esta misma app
// (en producción https://stu8990.github.io/pruebas/). Sin esto Supabase usa
// la «Site URL» del proyecto, que puede apuntar a localhost.
export function appUrl() {
  return location.origin + location.pathname.replace(/[^/]*$/, '');
}

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
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
  if (error) {
    const m = error.message?.toLowerCase() ?? '';
    if (error.status === 429 || m.includes('rate limit') || m.includes('seconds')) {
      return { error: 'Ya pediste un enlace hace poco. Espera un minuto y vuelve a intentarlo.' };
    }
    return { error: `No se pudo enviar: ${error.message}` };
  }
  return { info: `Te enviamos un enlace a ${email}. Ábrelo desde este teléfono. Si no llega en unos minutos, revisa la carpeta de spam.` };
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

// Formato de cifras y textos. Todo número que ve el usuario pasa por aquí.

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ok = n => n !== null && n !== undefined && Number.isFinite(+n);

// Cifras de cartera en dólares enteros, para que se lean de un vistazo y
// todas tengan la misma forma. Centavos sólo en precios por acción (cents:
// true) o en montos menores a $1, donde el redondeo los borraría.
export function money(n, { cents } = {}) {
  if (!ok(n)) return '—';
  const v = +n;
  return (cents ?? (Math.abs(v) < 1 && v !== 0)) ? usd2.format(v) : usd0.format(v);
}

export function signedMoney(n, opts) {
  if (!ok(n)) return '—';
  const v = +n;
  if (Math.abs(v) < 0.005) return money(0, opts);
  return (v > 0 ? '+' : '−') + money(Math.abs(v), opts);
}

export function pct(n, digits = 1) {
  if (!ok(n)) return '—';
  const v = +n;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%`;
}

export function plainPct(n, digits = 0) {
  if (!ok(n)) return '—';
  return `${(+n).toFixed(digits)}%`;
}

export function shares(n) {
  if (!ok(n)) return '—';
  return (+n).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function tone(n) {
  if (!ok(n) || Math.abs(+n) < 0.005) return 'flat';
  return +n > 0 ? 'up' : 'down';
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function monthName(iso) { return MONTHS[+iso.slice(5, 7) - 1]; }
export function shortDate(iso) {
  if (!iso) return 'sin fecha';
  return `${+iso.slice(8, 10)} ${MONTHS_SHORT[+iso.slice(5, 7) - 1]}${iso.slice(0, 4) !== String(new Date().getFullYear()) ? ' ' + iso.slice(0, 4) : ''}`;
}
export function timeAgo(date) {
  if (!date) return '';
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return `a las ${date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
}

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

import { BK, ASSETS } from './config.js';
import { Store } from './store.js';
import { Learn, generateDescription } from './learn.js';
import { Charts } from './charts.js';
import { UI } from './ui.js';
import { fetchMarketData } from './market.js';
import { evaluateAllPer, perZone } from './per.js';
import { set, toast } from './utils.js';
import { setSyncState } from './sync.js';
import { setDbClient } from './repository.js';
import {
  db,
  createAuthenticatedClient,
  loginWithPassword,
  showForgot,
  backToLogin,
  sendReset,
  showChangePwd,
  closePwdModal,
  changePassword,
  toggleAuthPwd,
  signOut,
} from './auth.js';

// ── Navigation ────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: 'Mi Portafolio · Resumen',
  portfolio: 'Mis Acciones · Detalle',
  ai:        'Recomendaciones · IA',
  record:    'Registrar sesión de hoy',
  history:   'Historial de sesiones',
  per:       '¿Está cara mi acción? · Análisis PER',
};

function goTo(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  set('page-title', PAGE_TITLES[id] || '');
  closeSidebar();
  if (id === 'dashboard') { Charts.value(); Charts.sector(); }
  if (id === 'portfolio')   Charts.returns();
  if (id === 'history')     UI.history();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('active');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('active');
}

function toggleExplain() {
  const b = document.getElementById('explain-body');
  const a = document.getElementById('explain-arrow');
  b.classList.toggle('open');
  a.textContent = b.classList.contains('open') ? '▲' : '▼';
}

function checkBanner() {
  if (!localStorage.getItem(BK))
    document.getElementById('welcome-banner').style.display = 'block';
}

function dismissBanner() {
  document.getElementById('welcome-banner').style.display = 'none';
  localStorage.setItem(BK, '1');
}

function refreshData()      { UI.all(); toast('✓ Dashboard actualizado'); }
function onRecordChange(e)  { Store.idx = +e.target.value; UI.all(); }
function checkMenuBtn()     { const b = document.getElementById('menu-btn'); if (b) b.style.display = window.innerWidth <= 1024 ? 'flex' : 'none'; }

function autoDesc() {
  const fecha = document.getElementById('f-fecha')?.value;
  const valor = parseFloat(document.getElementById('f-valor')?.value || '0');
  if (!fecha || !valor) return;
  const rend = {};
  ASSETS.forEach(a => { const v = document.getElementById('inp-' + a)?.value; rend[a] = (v === '' || v === undefined) ? null : +v; });
  const desc = generateDescription({ fecha, valor_total_usd: valor, rendimientos: rend });
  const ta = document.getElementById('f-fase');
  if (ta) ta.value = desc;
}

// ── App lifecycle ─────────────────────────────────────
let _appReady = false;

async function initApp(userId, email) {
  const el = document.getElementById('user-email-label');
  if (el) el.textContent = email || '';
  document.getElementById('auth-overlay').classList.add('hidden');

  Store.load(userId);
  Learn.train(Store.history);
  UI.returnInputs();
  UI.prefill();
  UI.all();
  checkBanner();
  checkMenuBtn();

  Store._syncCloud().then(changed => {
    if (changed) { Learn.train(Store.history); UI.prefill(); UI.all(); }
  });

  fetchMarketData();
}

async function startApp(session) {
  if (_appReady) return;
  _appReady = true;
  const adb = createAuthenticatedClient(session.access_token);
  setDbClient(adb);
  await initApp(session.user.id, session.user.email);
}

function showLogin() {
  _appReady = false;
  document.getElementById('auth-overlay').classList.remove('hidden');
  setSyncState('err', 'Sin sesión');
}

// ── Event listeners ───────────────────────────────────
document.getElementById('record-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-save-record');
  btn.disabled = true; btn.textContent = 'Guardando…';
  const rend = {};
  ASSETS.forEach(a => { const v = document.getElementById('inp-' + a)?.value; rend[a] = (v === '' || v === undefined) ? null : +v; });
  const fecha = document.getElementById('f-fecha').value;
  const valor = +document.getElementById('f-valor').value;
  const fase  = document.getElementById('f-fase').value.trim() || generateDescription({ fecha, valor_total_usd: valor, rendimientos: rend });
  const ok = await Store.add({ fecha, fase, valor_total_usd: valor, rendimientos: rend });
  btn.disabled = false; btn.textContent = 'Guardar en la nube';
  if (ok) { UI.all(); toast('✓ Sesión guardada en la nube.'); goTo('dashboard', document.querySelector('.nav-item')); }
});

document.getElementById('btn-reset').addEventListener('click', async () => {
  if (!confirm('¿Borrar todos tus registros? Esta acción no se puede deshacer.')) return;
  await Store.reset(Store.userId);
  UI.returnInputs(); UI.prefill(); UI.all(); toast('✓ Datos restaurados');
});

document.getElementById('btn-export').addEventListener('click', () => {
  const b = new Blob([JSON.stringify(Store.history, null, 2)], { type: 'application/json' });
  const u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = 'investsmart-historial.json'; a.click(); URL.revokeObjectURL(u);
  toast('✓ Datos exportados');
});

document.getElementById('per-form').addEventListener('submit', e => {
  e.preventDefault();
  const ticker = document.getElementById('per-ticker').value.trim();
  const per    = parseFloat(document.getElementById('per-val').value);
  if (!ticker || isNaN(per) || per <= 0) { toast('Completa los dos campos'); return; }
  const z  = perZone(per);
  const el = document.getElementById('per-result');
  el.style.display = 'block';
  el.innerHTML = `<div style="background:${z.bg};border:1px solid ${z.border};border-radius:11px;padding:15px;">
    <div style="font-size:14px;font-weight:700;color:${z.text};margin-bottom:5px;">${ticker} con PER ${per.toFixed(1)}x → ${z.zone}</div>
    <p style="font-size:13px;color:${z.text};opacity:.9;margin:0;line-height:1.7;">${z.tip}</p>
  </div>`;
});

document.getElementById('auth-email').addEventListener('keydown',    e => { if (e.key === 'Enter') document.getElementById('auth-password').focus(); });
document.getElementById('auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') loginWithPassword(); });

window.addEventListener('resize', checkMenuBtn);

db.auth.onAuthStateChange((_event, session) => {
  if (session?.user) startApp(session);
  else showLogin();
});

// ── Expose to HTML inline handlers ────────────────────
window.goTo            = goTo;
window.toggleSidebar   = toggleSidebar;
window.closeSidebar    = closeSidebar;
window.toggleExplain   = toggleExplain;
window.checkBanner     = checkBanner;
window.dismissBanner   = dismissBanner;
window.refreshData     = refreshData;
window.onRecordChange  = onRecordChange;
window.checkMenuBtn    = checkMenuBtn;
window.autoDesc        = autoDesc;
window.fetchMarketData = fetchMarketData;
window.evaluateAllPer  = evaluateAllPer;
window.loginWithPassword = loginWithPassword;
window.toggleAuthPwd   = toggleAuthPwd;
window.showForgot      = showForgot;
window.backToLogin     = backToLogin;
window.sendReset       = sendReset;
window.showChangePwd   = showChangePwd;
window.closePwdModal   = closePwdModal;
window.changePassword  = changePassword;
window.signOut         = signOut;

// ── Bootstrap ─────────────────────────────────────────
(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) await startApp(session);
  else showLogin();
})();

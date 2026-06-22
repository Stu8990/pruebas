import { BK, ASSET_META, EDGE_BASE } from './config.js';
import { getAllAssets, addCustomAsset, removeCustomAsset as _removeCustomAsset } from './assets.js';
import { Store } from './store.js';
import { Learn, generateDescription } from './learn.js';
import { Charts } from './charts.js';
import { UI, renderPositionsPanel, kpiLive, renderSetupChecklist } from './ui.js';
import { fetchMarketData } from './prices.js';
import { fetchAiAnalysis, renderAiPage, clearAiCache } from './ai.js';
import { analyzeBuy, clearBuySlot, loadBuySlots, autoRecommend, refreshBuyRecommendations } from './buy.js';
import { evaluateAllPer, analyzeTickerPer, renderWatchlist } from './per.js';
import { set, toast, attachTickerSearch } from './utils.js';
import { getPositions, addPurchase, removePurchase, getAvgPrice, getTotalShares, hasPositions, loadPositions } from './positions.js';
import { setSyncState } from './sync.js';
import { showOnboarding, isOnboardingDone } from './onboarding.js';
import { quickRecord, applyQuickRecord, clearSavedCash, autoDesc, refreshCashHint, autoRecord, fetchLiveValue, syncLiveNow } from './record.js';
import {
  db,
  loginWithPassword,
  showForgot,
  backToLogin,
  showSignup,
  signUp,
  toggleSignupPwd,
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

function _todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function goTo(id, btn) {
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
  if (id === 'per')         renderWatchlist();
  if (id === 'ai')          triggerAiAnalysis();
  if (id === 'record') {
    const f = document.getElementById('f-fecha'); if (f) f.value = _todayStr();
    refreshCashHint();
  }
}

export function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('active');
}

export function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('active');
}

export function toggleExplain() {
  const b = document.getElementById('explain-body');
  const a = document.getElementById('explain-arrow');
  b.classList.toggle('open');
  a.textContent = b.classList.contains('open') ? '▲' : '▼';
}

export function checkBanner() {
  if (!localStorage.getItem(BK))
    document.getElementById('welcome-banner').style.display = 'block';
}

export function dismissBanner() {
  document.getElementById('welcome-banner').style.display = 'none';
  localStorage.setItem(BK, '1');
}

export function refreshData() { UI.all(); toast('✓ Dashboard actualizado'); }

// ── AI analysis ───────────────────────────────────────
let _aiLoading = false;
async function triggerAiAnalysis(force = false) {
  if (_aiLoading) return;
  if (Store.history.length < 2) return;
  const insightEl = document.getElementById('daily-insight');
  const recsEl    = document.getElementById('recommendations');
  if (!force) {
    try {
      const cached = await fetchAiAnalysis(false);
      if (cached) { renderAiPage(cached); return; }
    } catch { /* fall through to full load */ }
  }
  _aiLoading = true;
  if (insightEl) insightEl.textContent = '🤖 Analizando tu portafolio con IA…';
  if (recsEl)    recsEl.innerHTML = _aiSkeleton();
  try {
    const data = await fetchAiAnalysis(force);
    if (data) renderAiPage(data);
    else UI.recs(Store.cur(), Store.prev());
  } catch {
    if (insightEl) insightEl.textContent = 'Análisis IA no disponible. Mostrando análisis local.';
    UI.pulse(); UI.insight(Store.cur(), Store.prev()); UI.recs(Store.cur(), Store.prev());
  } finally {
    _aiLoading = false;
  }
}

function _aiSkeleton() {
  return Array(3).fill(0).map(() =>
    `<div class="rec2 rec2-blue" style="opacity:.35;animation:pulse-skeleton 1.4s ease infinite;">
      <div class="rec2-bar"></div>
      <div class="rec2-body">
        <div style="height:13px;background:#bae6fd;border-radius:6px;width:55%;margin-bottom:12px;"></div>
        <div style="height:10px;background:#bae6fd;border-radius:6px;width:90%;margin-bottom:6px;"></div>
        <div style="height:10px;background:#bae6fd;border-radius:6px;width:75%;"></div>
      </div>
    </div>`
  ).join('');
}

export function refreshAi() { clearAiCache(); triggerAiAnalysis(true); toast('🤖 Actualizando análisis IA…'); }

// ── Live value refresh ────────────────────────────────
let _liveInterval = null;

async function _refreshLiveValue() {
  const btn = document.getElementById('btn-live-refresh');
  if (btn) { btn.disabled = true; btn.textContent = '⟳'; }
  const data = await fetchLiveValue();
  kpiLive(data);
  if (btn) { btn.disabled = false; btn.textContent = '↻'; }
}

function _startLiveRefresh() {
  if (_liveInterval) clearInterval(_liveInterval);
  _refreshLiveValue();
  _liveInterval = setInterval(_refreshLiveValue, 5 * 60 * 1000);
}

export async function refreshLiveValue() { await _refreshLiveValue(); }
export { syncLiveNow };

// ── Positions form handlers ───────────────────────────
export function toggleAddPosition() {
  const panel = document.getElementById('add-position-panel');
  if (!panel) return;
  panel.style.display = panel.style.display !== 'none' ? 'none' : 'block';
}

export function calcPosShares() {
  const price = parseFloat(document.getElementById('pos-price')?.value || '');
  const monto = parseFloat(document.getElementById('pos-monto')?.value || '');
  const sharesEl = document.getElementById('pos-shares');
  if (price > 0 && monto > 0 && sharesEl && !sharesEl._manual) {
    sharesEl.value = (monto / price).toFixed(6);
  }
}

export function clearPosMonto() {
  const sharesEl = document.getElementById('pos-shares');
  if (sharesEl) sharesEl._manual = true;
  const montoEl = document.getElementById('pos-monto');
  if (montoEl) montoEl.value = '';
}

export function savePosition() {
  const ticker = document.getElementById('pos-ticker')?.value.trim().toUpperCase();
  const price  = parseFloat(document.getElementById('pos-price')?.value || '');
  const msg    = document.getElementById('pos-msg');

  const sharesEl = document.getElementById('pos-shares');
  const montoEl  = document.getElementById('pos-monto');
  let shares = parseFloat(sharesEl?.value || '');
  if ((!shares || shares <= 0) && price > 0) {
    const monto = parseFloat(montoEl?.value || '');
    if (monto > 0) shares = monto / price;
  }

  if (!ticker || !/^[A-Z0-9.\-]{1,10}$/.test(ticker)) { if (msg) { msg.textContent = 'Escribe un símbolo válido (ej: VOO, NVDA, BRK-B)'; msg.style.color = 'var(--danger)'; } return; }
  if (!shares || shares <= 0)  { if (msg) { msg.textContent = 'Ingresa el volumen XTB o el monto invertido'; msg.style.color = 'var(--danger)'; } return; }
  if (!price  || price  <= 0)  { if (msg) { msg.textContent = 'Ingresa el precio por acción al momento de la compra'; msg.style.color = 'var(--danger)'; } return; }

  addPurchase(ticker, '', shares, price);
  renderPositionsPanel();

  ['pos-ticker','pos-shares','pos-price','pos-monto'].forEach(id => {
    const e = document.getElementById(id);
    if (e) { e.value = ''; if (id === 'pos-shares') e._manual = false; }
  });
  if (msg) { msg.textContent = `✓ ${ticker} · ${shares.toFixed(4)} vol. a $${price.toFixed(2)} guardado`; msg.style.color = 'var(--success)'; }
  toast(`✓ ${ticker} guardado`);
}

export function removePurchaseEntry(ticker, idx) {
  removePurchase(ticker, idx);
  renderPositionsPanel();
}

// ── Custom assets ─────────────────────────────────────
export function openAddAsset() {
  let panel = document.getElementById('add-asset-panel');
  if (panel) { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; return; }
  panel = document.createElement('div');
  panel.id = 'add-asset-panel';
  panel.style.cssText = 'margin-top:8px;padding:14px;background:#f5f3ff;border-radius:11px;border:1px solid #ddd6fe;';
  panel.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:10px;">Agregar activo personalizado</div>
    <div style="display:flex;gap:8px;align-items:flex-end;">
      <label style="flex:1;margin:0;">
        <span style="font-size:11px;font-weight:600;color:var(--text-2);display:block;margin-bottom:4px;">Símbolo (ticker)</span>
        <input id="new-asset-ticker" placeholder="Ej: AAPL, GLD, BTC-USD" style="text-transform:uppercase;font-size:13px;" />
      </label>
      <button type="button" onclick="confirmAddAsset()" class="btn btn-primary btn-sm">Agregar</button>
      <button type="button" onclick="document.getElementById('add-asset-panel').style.display='none'" class="btn btn-ghost btn-sm">✕</button>
    </div>
    <div id="add-asset-msg" style="font-size:11px;margin-top:7px;min-height:16px;"></div>`;
  const container = document.getElementById('return-inputs');
  container?.insertAdjacentElement('afterend', panel);
}

export async function confirmAddAsset() {
  const inp = document.getElementById('new-asset-ticker');
  const msg = document.getElementById('add-asset-msg');
  const ticker = inp?.value.trim().toUpperCase();
  if (!ticker) return;
  if (msg) { msg.textContent = `Buscando ${ticker}…`; msg.style.color = 'var(--text-3)'; }
  try {
    const { data: { session } } = await db.auth.getSession();
    const res = await fetch(`${EDGE_BASE}/market-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ tickers: [ticker] }),
    });
    const items = await res.json();
    const item  = items[0];
    if (item?.error) {
      if (msg) { msg.textContent = `No se encontró "${ticker}". Verifica el símbolo exacto.`; msg.style.color = 'var(--danger)'; }
      return;
    }
    const added = addCustomAsset(ticker, item.name ?? ticker);
    if (!added) {
      if (msg) { msg.textContent = `${ticker} ya está en tu lista.`; msg.style.color = 'var(--warning)'; }
      return;
    }
    if (inp) inp.value = '';
    if (msg) { msg.textContent = `✓ ${ticker} (${item.name ?? ''}) agregado`; msg.style.color = 'var(--success)'; }
    UI.returnInputs(); UI.prefill();
    const panel = document.getElementById('add-asset-panel');
    if (panel) document.getElementById('return-inputs')?.insertAdjacentElement('afterend', panel);
  } catch (err) {
    if (msg) { msg.textContent = 'Error: ' + err.message; msg.style.color = 'var(--danger)'; }
  }
}

export function removeCustomAsset(ticker) {
  _removeCustomAsset(ticker);
  UI.returnInputs(); UI.prefill();
  const panel = document.getElementById('add-asset-panel');
  if (panel) document.getElementById('return-inputs')?.insertAdjacentElement('afterend', panel);
  toast(`✓ ${ticker} eliminado`);
}

// ── Ticker search autocomplete ────────────────────────
async function _fetchTickerSuggestions(query) {
  try {
    const { data: { session } } = await db.auth.getSession();
    const res = await fetch(`${EDGE_BASE}/market-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ search: query }),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

function _attachAllTickerSearches() {
  const posTicker = document.getElementById('pos-ticker');
  if (posTicker) attachTickerSearch(posTicker, _fetchTickerSuggestions);
  document.querySelectorAll('.buy-ticker-input').forEach(input => {
    attachTickerSearch(input, _fetchTickerSuggestions);
  });
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

  document.addEventListener('autorecord:done', () => {
    Learn.train(Store.history); UI.prefill(); UI.all(); renderSetupChecklist();
  }, { once: false });

  Store._syncCloud().then(changed => {
    if (changed) { Learn.train(Store.history); UI.prefill(); UI.all(); }
    if (Store.history.length === 0 && !isOnboardingDone()) showOnboarding();
    autoRecommend();
    autoRecord();
  });

  const fechaEl = document.getElementById('f-fecha');
  if (fechaEl) fechaEl.value = _todayStr();
  refreshCashHint();

  fetchMarketData();
  loadBuySlots();
  loadPositions().then(() => { renderPositionsPanel(); renderSetupChecklist(); _startLiveRefresh(); });
  _attachAllTickerSearches();
}

const _LAST_USER_KEY = 'investsmart-last-user';

function _clearCacheIfUserChanged(userId) {
  const lastUser = localStorage.getItem(_LAST_USER_KEY);
  if (lastUser && lastUser !== userId) {
    Object.keys(localStorage)
      .filter(k => k.startsWith('investsmart-') && k !== _LAST_USER_KEY)
      .forEach(k => localStorage.removeItem(k));
  }
  localStorage.setItem(_LAST_USER_KEY, userId);
}

async function startApp(session) {
  if (_appReady) return;
  _appReady = true;
  _clearCacheIfUserChanged(session.user.id);
  await initApp(session.user.id, session.user.email);
}

function showLogin() {
  _appReady = false;
  document.getElementById('auth-overlay').classList.remove('hidden');
  setSyncState('err', 'Sin sesión');
}

export function onRecordChange(e) { Store.idx = +e.target.value; UI.all(); }
export function checkMenuBtn()    { const b = document.getElementById('menu-btn'); if (b) b.style.display = window.innerWidth <= 1024 ? 'flex' : 'none'; }

// ── Event listeners ───────────────────────────────────
document.getElementById('record-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-save-record');
  btn.disabled = true; btn.textContent = 'Guardando…';
  const rend = {};
  getAllAssets().forEach(({ ticker: t }) => { const v = document.getElementById('inp-' + t)?.value; rend[t] = (v === '' || v === undefined) ? null : +v; });
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
  analyzeTickerPer(ticker);
});

document.getElementById('auth-email').addEventListener('keydown',    e => { if (e.key === 'Enter') document.getElementById('auth-password').focus(); });
document.getElementById('auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') loginWithPassword(); });

window.addEventListener('resize', checkMenuBtn);

db.auth.onAuthStateChange((_event, session) => {
  if (session?.user) startApp(session);
  else showLogin();
});

// ── Bootstrap ─────────────────────────────────────────
(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) await startApp(session);
  else showLogin();
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/pruebas/sw.js', { scope: '/pruebas/' })
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

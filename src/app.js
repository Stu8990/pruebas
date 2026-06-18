import { BK, ASSETS, ASSET_META, EDGE_BASE } from './config.js';
import { getAllAssets, addCustomAsset, removeCustomAsset as _removeCustomAsset } from './assets.js';
import { Store } from './store.js';
import { Learn, generateDescription } from './learn.js';
import { Charts } from './charts.js';
import { UI } from './ui.js';
import { fetchMarketData } from './prices.js';
import { fetchAiAnalysis, renderAiPage, clearAiCache } from './ai.js';
import { analyzeBuy, clearBuySlot, loadBuySlots, autoRecommend, refreshBuyRecommendations } from './buy.js';
import { evaluateAllPer, perZone, analyzeTickerPer, renderWatchlist } from './per.js';
import { set, toast, attachTickerSearch } from './utils.js';
import { getPositions, addPurchase, removePurchase, getAvgPrice, getTotalShares, hasPositions, renderPositionsPanel, loadPositions } from './positions.js';
import { setSyncState } from './sync.js';
import { showOnboarding, isOnboardingDone } from './onboarding.js';
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
  if (id === 'per')         renderWatchlist();
  if (id === 'ai')          triggerAiAnalysis();
  if (id === 'record')      { const f = document.getElementById('f-fecha'); if (f) f.value = _todayStr(); }
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

let _aiLoading = false;
async function triggerAiAnalysis(force = false) {
  if (_aiLoading) return;
  if (Store.history.length < 2) return; // Learn.recommendations handles empty state
  const insightEl = document.getElementById('daily-insight');
  const recsEl    = document.getElementById('recommendations');
  if (!force) {
    // Check cache first — if valid, just render without showing spinner
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
    else UI.recs(Store.cur(), Store.prev()); // fallback to rule-based
  } catch (err) {
    console.error('[ai-analysis]', err);
    if (insightEl) insightEl.textContent = 'Análisis IA no disponible. Mostrando análisis local.';
    UI.pulse(); UI.insight(Store.cur(), Store.prev()); UI.recs(Store.cur(), Store.prev());
  } finally {
    _aiLoading = false;
  }
}

function _aiSkeleton() {
  return Array(3).fill(0).map(() =>
    `<div class="rec rec-blue" style="opacity:.4;animation:pulse-skeleton 1.4s ease infinite;">
      <div style="height:12px;background:#bae6fd;border-radius:6px;width:60%;margin-bottom:8px;"></div>
      <div style="height:10px;background:#bae6fd;border-radius:6px;width:90%;margin-bottom:5px;"></div>
      <div style="height:10px;background:#bae6fd;border-radius:6px;width:75%;"></div>
    </div>`
  ).join('');
}

function refreshAi() { clearAiCache(); triggerAiAnalysis(true); toast('🤖 Actualizando análisis IA…'); }

// ── Positions ─────────────────────────────────────────
function toggleAddPosition() {
  const panel = document.getElementById('add-position-panel');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
}

function calcPosShares() {
  const price = parseFloat(document.getElementById('pos-price')?.value || '');
  const monto = parseFloat(document.getElementById('pos-monto')?.value || '');
  const sharesEl = document.getElementById('pos-shares');
  if (price > 0 && monto > 0 && sharesEl && !sharesEl._manual) {
    sharesEl.value = (monto / price).toFixed(6);
  }
}

function clearPosMonto() {
  const sharesEl = document.getElementById('pos-shares');
  if (sharesEl) sharesEl._manual = true;
  const montoEl = document.getElementById('pos-monto');
  if (montoEl) montoEl.value = '';
}

function savePosition() {
  const ticker = document.getElementById('pos-ticker')?.value.trim().toUpperCase();
  const price  = parseFloat(document.getElementById('pos-price')?.value || '');
  const msg    = document.getElementById('pos-msg');

  // Resolve shares: manual volume OR monto / price
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

function removePurchaseEntry(ticker, idx) {
  removePurchase(ticker, idx);
  renderPositionsPanel();
}

// ── Quick record ──────────────────────────────────────
let _qrData = null;

async function quickRecord() {
  if (!hasPositions()) {
    toast('Agrega tus posiciones primero en la sección "Mis posiciones"');
    return;
  }
  const btn = document.getElementById('btn-quick-record');
  if (btn) { btn.disabled = true; btn.textContent = 'Calculando…'; }

  try {
    const positions = getPositions();
    const tickers   = Object.keys(positions);

    // Map position tickers to Yahoo Finance tickers (e.g. VISA → V)
    const toYf      = {};
    const fromYf    = {};
    for (const t of tickers) {
      const yf = ASSET_META[t]?.yfTicker ?? t;
      toYf[t]  = yf;
      fromYf[yf] = t;
    }
    const yfTickers = tickers.map(t => toYf[t]);

    const { data: { session } } = await db.auth.getSession();
    const res = await fetch(`${EDGE_BASE}/market-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ tickers: yfTickers }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    // Re-key response by position ticker (un-maps V → VISA, etc.)
    const byTicker = Object.fromEntries(
      items.map(i => [fromYf[i.ticker] ?? i.ticker, i])
    );

    let stocksValue = 0;
    const rendimientosCalc = {};

    for (const ticker of tickers) {
      const market = byTicker[ticker];
      if (!market?.currentPrice) continue;
      const avgPrice    = getAvgPrice(ticker);
      const totalShares = getTotalShares(ticker);
      if (!avgPrice || !totalShares) continue;
      const rend = ((market.currentPrice - avgPrice) / avgPrice) * 100;
      stocksValue += totalShares * market.currentPrice;
      rendimientosCalc[ticker] = +rend.toFixed(2);
    }

    _qrData = { stocksValue, rendimientosCalc };

    const cashRow  = document.getElementById('qr-cash-row');
    const stocksEl = document.getElementById('qr-stocks-value');
    if (stocksEl) stocksEl.textContent = `$${stocksValue.toFixed(2)}`;
    if (cashRow)  cashRow.style.display = 'block';
  } catch (err) {
    toast('Error al calcular precios: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Calcular desde mis posiciones'; }
  }
}

function applyQuickRecord() {
  if (!_qrData) return;
  const { stocksValue, rendimientosCalc } = _qrData;
  const cash  = parseFloat(document.getElementById('qr-cash')?.value || '0') || 0;
  const total = stocksValue + cash;

  const valorEl = document.getElementById('f-valor');
  if (valorEl) { valorEl.value = total.toFixed(2); valorEl.dispatchEvent(new Event('input')); }

  for (const [ticker, rend] of Object.entries(rendimientosCalc)) {
    const inp = document.getElementById('inp-' + ticker);
    if (inp) inp.value = rend;
  }

  autoDesc();
  document.getElementById('qr-cash-row').style.display = 'none';
  document.getElementById('qr-cash').value = '';
  _qrData = null;
  toast('✓ Formulario pre-llenado. Revisa los datos y guarda.');
  document.getElementById('record-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function onRecordChange(e)  { Store.idx = +e.target.value; UI.all(); }
function checkMenuBtn()     { const b = document.getElementById('menu-btn'); if (b) b.style.display = window.innerWidth <= 1024 ? 'flex' : 'none'; }

function autoDesc() {
  const fecha = document.getElementById('f-fecha')?.value;
  const valor = parseFloat(document.getElementById('f-valor')?.value || '0');
  if (!fecha || !valor) return;
  const rend = {};
  getAllAssets().forEach(({ ticker: t }) => { const v = document.getElementById('inp-' + t)?.value; rend[t] = (v === '' || v === undefined) ? null : +v; });
  const desc = generateDescription({ fecha, valor_total_usd: valor, rendimientos: rend });
  const ta = document.getElementById('f-fase');
  if (ta) ta.value = desc;
}

// ── Custom assets ─────────────────────────────────────
function openAddAsset() {
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

async function confirmAddAsset() {
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
    // Reinsert the panel after re-render
    const panel = document.getElementById('add-asset-panel');
    if (panel) document.getElementById('return-inputs')?.insertAdjacentElement('afterend', panel);
  } catch (err) {
    if (msg) { msg.textContent = 'Error: ' + err.message; msg.style.color = 'var(--danger)'; }
  }
}

function removeCustomAsset(ticker) {
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

  Store._syncCloud().then(changed => {
    if (changed) { Learn.train(Store.history); UI.prefill(); UI.all(); }
    if (Store.history.length === 0 && !isOnboardingDone()) showOnboarding();
    autoRecommend();
  });

  const fechaEl = document.getElementById('f-fecha');
  if (fechaEl) fechaEl.value = _todayStr();

  fetchMarketData();
  loadBuySlots();
  loadPositions().then(() => renderPositionsPanel());
  _attachAllTickerSearches();
}

async function startApp(session) {
  if (_appReady) return;
  _appReady = true;
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
window.refreshAi       = refreshAi;
window.evaluateAllPer  = evaluateAllPer;
window.analyzeTickerPer  = analyzeTickerPer;
window.openAddAsset      = openAddAsset;
window.confirmAddAsset   = confirmAddAsset;
window.removeCustomAsset = removeCustomAsset;
window.loginWithPassword = loginWithPassword;
window.toggleAuthPwd     = toggleAuthPwd;
window.showForgot        = showForgot;
window.backToLogin       = backToLogin;
window.showSignup        = showSignup;
window.signUp            = signUp;
window.toggleSignupPwd   = toggleSignupPwd;
window.sendReset         = sendReset;
window.showChangePwd   = showChangePwd;
window.closePwdModal   = closePwdModal;
window.changePassword  = changePassword;
window.signOut         = signOut;
window.analyzeBuy                = analyzeBuy;
window.clearBuySlot              = clearBuySlot;
window.refreshBuyRecommendations = refreshBuyRecommendations;
window.toggleAddPosition         = toggleAddPosition;
window.savePosition              = savePosition;
window.removePurchaseEntry       = removePurchaseEntry;
window.quickRecord               = quickRecord;
window.applyQuickRecord          = applyQuickRecord;
window.calcPosShares             = calcPosShares;
window.clearPosMonto             = clearPosMonto;

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

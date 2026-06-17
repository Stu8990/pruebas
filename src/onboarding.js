import { ASSETS, ASSET_META, EDGE_BASE } from './config.js';
import { getAllAssets, addCustomAsset } from './assets.js';
import { Store } from './store.js';
import { UI } from './ui.js';
import { db } from './auth.js';
import { toast, esc } from './utils.js';
import { generateDescription } from './learn.js';

const DONE_KEY = 'investsmart-onboarding-done';

const POPULAR = [
  { ticker: 'VOO',   name: 'Vanguard S&P 500',    color: '#3b82f6' },
  { ticker: 'QQQ',   name: 'Nasdaq 100 ETF',       color: '#8b5cf6' },
  { ticker: 'SPY',   name: 'SPDR S&P 500',         color: '#6366f1' },
  { ticker: 'AAPL',  name: 'Apple',                color: '#374151' },
  { ticker: 'MSFT',  name: 'Microsoft',            color: '#8b5cf6' },
  { ticker: 'NVDA',  name: 'NVIDIA',               color: '#f59e0b' },
  { ticker: 'AMZN',  name: 'Amazon',               color: '#f97316' },
  { ticker: 'GOOGL', name: 'Alphabet',             color: '#10b981' },
  { ticker: 'META',  name: 'Meta Platforms',       color: '#3b82f6' },
  { ticker: 'TSLA',  name: 'Tesla',                color: '#ef4444' },
  { ticker: 'SCHD',  name: 'Schwab Dividend',      color: '#14b8a6' },
  { ticker: 'GLD',   name: 'Gold ETF (SPDR)',      color: '#eab308' },
];

const PALETTE = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#6366f1','#14b8a6','#f97316','#ef4444'];

const state = {
  step: 1,
  capital: 0,
  selected: new Map(), // Map<ticker, {ticker, name, color}>
};

export function isOnboardingDone() {
  return !!localStorage.getItem(DONE_KEY);
}

export function showOnboarding() {
  if (document.getElementById('ob-overlay')) return;
  state.step = 1; state.capital = 0; state.selected.clear();

  const overlay = document.createElement('div');
  overlay.id = 'ob-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:450;overflow-y:auto;',
    'background:linear-gradient(135deg,#1e1035 0%,#2d1b69 100%);',
    'display:flex;align-items:center;justify-content:center;padding:20px;',
  ].join('');
  overlay.innerHTML = `<div id="ob-card" style="background:white;border-radius:20px;width:100%;max-width:480px;box-shadow:0 24px 64px rgba(0,0,0,.35);"><div id="ob-content"></div></div>`;
  document.body.appendChild(overlay);
  _renderStep(1);
}

export function hideOnboarding() {
  document.getElementById('ob-overlay')?.remove();
  localStorage.setItem(DONE_KEY, '1');
}

// ── Step renderer ─────────────────────────────────────

function _renderStep(n) {
  state.step = n;
  const card = document.getElementById('ob-content');
  if (!card) return;

  const steps = ['Capital', 'Activos', 'Confirmar'];
  const progress = `
    <div style="display:flex;align-items:center;margin-bottom:24px;">
      ${steps.map((s, i) => {
        const done   = i + 1 < n;
        const active = i + 1 === n;
        const dot    = `<div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;
          background:${done||active?'#7c3aed':'#f5f3ff'};color:${done||active?'white':'#c4b5fd'};">${done?'✓':i+1}</div>`;
        const label  = `<div style="font-size:10px;font-weight:600;text-align:center;margin-top:3px;color:${active?'#7c3aed':'#a8a29e'};">${s}</div>`;
        const line   = i < steps.length - 1
          ? `<div style="flex:1;height:2px;background:${i+1<n?'#7c3aed':'#e7e5e4'};margin:0 6px;margin-bottom:16px;"></div>` : '';
        return `<div style="display:flex;flex-direction:column;align-items:center;">${dot}${label}</div>${line}`;
      }).join('')}
    </div>`;

  const header = `<div style="padding:28px 28px 0;">${progress}</div>`;

  if (n === 1) {
    card.innerHTML = header + `
      <div style="padding:0 28px 28px;">
        <div style="font-size:22px;font-weight:800;font-family:'Space Grotesk',sans-serif;margin-bottom:6px;">Bienvenido a InvestSmart 👋</div>
        <div style="font-size:13px;color:#78716c;line-height:1.6;margin-bottom:22px;">Configuremos tu portafolio en 3 pasos rápidos. Puedes actualizar los datos en cualquier momento.</div>
        <label>
          <div style="font-size:12px;font-weight:700;color:#57534e;margin-bottom:7px;">¿Cuánto tienes invertido en total hoy? (USD)</div>
          <input id="ob-capital" type="number" step="0.01" min="0" placeholder="Ej: 1500.00" value="${state.capital || ''}"
            style="font-size:22px;font-weight:700;padding:14px 16px;border-radius:12px;width:100%;letter-spacing:-.01em;" />
          <div style="font-size:11px;color:#a8a29e;margin-top:5px;">Puedes ser aproximado. Lo importante es empezar.</div>
        </label>
        <div style="display:flex;gap:10px;margin-top:24px;">
          <button onclick="window._obSkip()" style="flex:1;padding:12px;background:none;border:1.5px solid #e7e5e4;border-radius:10px;cursor:pointer;font-size:13px;color:#a8a29e;font-family:inherit;">Omitir por ahora</button>
          <button onclick="window._obNext1()" style="flex:2;padding:12px;background:#7c3aed;color:white;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;">Siguiente →</button>
        </div>
      </div>`;
    setTimeout(() => document.getElementById('ob-capital')?.focus(), 60);
    return;
  }

  if (n === 2) {
    card.innerHTML = header + `
      <div style="padding:0 28px 28px;">
        <div style="font-size:20px;font-weight:800;font-family:'Space Grotesk',sans-serif;margin-bottom:4px;">¿En qué inviertes?</div>
        <div style="font-size:12px;color:#78716c;margin-bottom:14px;">Busca por nombre o símbolo, o elige entre los más populares.</div>
        <div style="position:relative;margin-bottom:12px;">
          <input id="ob-search" placeholder="Buscar: Apple, S&P 500, NVDA…" oninput="window._obSearch(this.value)"
            style="font-size:13px;padding:10px 14px 10px 36px;border-radius:10px;width:100%;" />
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px;pointer-events:none;">🔍</span>
        </div>
        <div id="ob-search-results"></div>
        <div style="font-size:11px;font-weight:700;color:#a8a29e;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Populares</div>
        <div id="ob-popular" style="display:flex;flex-wrap:wrap;gap:7px;"></div>
        <div id="ob-sel-section" style="${state.selected.size?'':'display:none'}margin-top:14px;">
          <div id="ob-sel-label" style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Seleccionados (${state.selected.size})</div>
          <div id="ob-sel-list" style="display:flex;flex-wrap:wrap;gap:7px;"></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:18px;">
          <button onclick="window._obBack()" style="padding:12px 18px;background:none;border:1.5px solid #e7e5e4;border-radius:10px;cursor:pointer;font-size:13px;color:#57534e;font-family:inherit;">← Volver</button>
          <button id="ob-next2-btn" onclick="window._obNext2()" style="flex:1;padding:12px;background:#7c3aed;color:white;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;${state.selected.size?'':'opacity:.5;cursor:not-allowed;'}" ${state.selected.size?'':'disabled'}>Siguiente →</button>
        </div>
      </div>`;
    _renderPopular();
    _renderSelected();
    return;
  }

  // Step 3 — confirmation
  const assets = [...state.selected.values()];
  card.innerHTML = header + `
    <div style="padding:0 28px 28px;">
      <div style="font-size:20px;font-weight:800;font-family:'Space Grotesk',sans-serif;margin-bottom:4px;">¡Todo listo! 🚀</div>
      <div style="font-size:12px;color:#78716c;margin-bottom:18px;">Tu portafolio inicial quedará así:</div>
      <div style="background:#f5f3ff;border-radius:12px;padding:16px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Capital inicial</div>
        <div style="font-size:28px;font-weight:800;color:#1c1917;font-family:'Space Grotesk',sans-serif;">$${Number(state.capital).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
      </div>
      <div style="background:#fafaf9;border:1px solid #f5f5f4;border-radius:12px;padding:16px;margin-bottom:18px;">
        <div style="font-size:11px;font-weight:700;color:#78716c;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Activos seleccionados (${assets.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:7px;">
          ${assets.map(a => `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:600;background:${a.color}18;border:1px solid ${a.color}44;">
            <span style="width:7px;height:7px;border-radius:50%;background:${a.color};display:inline-block;"></span>${esc(a.ticker)}
          </span>`).join('')}
        </div>
        <div style="font-size:11px;color:#a8a29e;margin-top:10px;">Los rendimientos empiezan en 0%. Actualiza cuando tengas tus datos reales.</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button onclick="window._obBack()" style="padding:12px 18px;background:none;border:1.5px solid #e7e5e4;border-radius:10px;cursor:pointer;font-size:13px;color:#57534e;font-family:inherit;">← Volver</button>
        <button id="ob-create-btn" onclick="window._obCreate()" style="flex:1;padding:13px;background:#7c3aed;color:white;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;">Crear mi portafolio ✓</button>
      </div>
    </div>`;
}

// ── Sub-renders ───────────────────────────────────────

function _renderPopular() {
  const el = document.getElementById('ob-popular'); if (!el) return;
  el.innerHTML = POPULAR.map(p => {
    const sel = state.selected.has(p.ticker);
    return `<button type="button" onclick="window._obToggle('${p.ticker}','${esc(p.name).replace(/'/g,'&#39;')}','${p.color}')"
      style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;
      background:${sel?p.color:'white'};color:${sel?'white':'#57534e'};border:1.5px solid ${sel?p.color:'#e7e5e4'};">
      <span style="width:7px;height:7px;border-radius:50%;background:${sel?'white':p.color};display:inline-block;"></span>
      ${esc(p.ticker)}
    </button>`;
  }).join('');
}

function _renderSelected() {
  const section = document.getElementById('ob-sel-section');
  const label   = document.getElementById('ob-sel-label');
  const list    = document.getElementById('ob-sel-list');
  const nextBtn = document.getElementById('ob-next2-btn');
  const assets  = [...state.selected.values()];
  if (section) section.style.display = assets.length ? '' : 'none';
  if (label)   label.textContent = `Seleccionados (${assets.length})`;
  if (list) {
    list.innerHTML = assets.map(a =>
      `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:600;background:${a.color}18;border:1px solid ${a.color}44;">
        <span style="width:6px;height:6px;border-radius:50%;background:${a.color};display:inline-block;"></span>
        ${esc(a.ticker)}
        <button type="button" onclick="window._obToggle('${a.ticker}','${esc(a.name).replace(/'/g,'&#39;')}','${a.color}')" style="background:none;border:none;cursor:pointer;color:#a8a29e;padding:0;margin-left:2px;font-size:11px;line-height:1;">✕</button>
      </span>`
    ).join('');
  }
  if (nextBtn) {
    nextBtn.disabled = assets.length === 0;
    nextBtn.style.opacity  = assets.length ? '1' : '.5';
    nextBtn.style.cursor   = assets.length ? 'pointer' : 'not-allowed';
  }
}

// ── Search ────────────────────────────────────────────

let _searchTimer = null;

async function _doSearch(q) {
  const el = document.getElementById('ob-search-results'); if (!el) return;
  if (!q.trim()) { el.innerHTML = ''; return; }
  el.innerHTML = '<div style="font-size:12px;color:#a8a29e;padding:6px 0;">Buscando…</div>';
  try {
    const { data: { session } } = await db.auth.getSession();
    const res = await fetch(`${EDGE_BASE}/market-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ search: q }),
    });
    const results = await res.json();
    if (!Array.isArray(results) || !results.length) {
      el.innerHTML = '<div style="font-size:12px;color:#a8a29e;padding:6px 0;">Sin resultados. Prueba con el símbolo exacto (ej: AAPL).</div>';
      return;
    }
    el.innerHTML = results.map(r => {
      const sel   = state.selected.has(r.ticker);
      const color = _colorFor(r.ticker);
      const safeName = esc(r.name).replace(/'/g, '&#39;');
      return `<button type="button" onclick="window._obToggle('${r.ticker}','${safeName}','${color}')"
        style="width:100%;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;cursor:pointer;font-family:inherit;text-align:left;
        background:${sel?'#f5f3ff':'white'};border:1.5px solid ${sel?'#7c3aed':'#e7e5e4'};margin-bottom:4px;">
        <div style="width:32px;height:32px;border-radius:8px;background:${color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:10px;font-weight:800;color:${color};">${esc(r.ticker.slice(0,4))}</span>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:#1c1917;">${esc(r.ticker)}</div>
          <div style="font-size:11px;color:#78716c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(r.name)} · ${esc(r.exchange ?? '')}</div>
        </div>
        ${sel ? '<span style="color:#7c3aed;font-size:16px;flex-shrink:0;">✓</span>' : ''}
      </button>`;
    }).join('');
  } catch {
    el.innerHTML = '<div style="font-size:12px;color:#dc2626;padding:6px 0;">Error al buscar. Intenta de nuevo.</div>';
  }
}

function _colorFor(ticker) {
  if (ASSET_META[ticker]) return ASSET_META[ticker].color;
  const pop = POPULAR.find(p => p.ticker === ticker);
  if (pop) return pop.color;
  const idx = state.selected.size % PALETTE.length;
  return PALETTE[idx];
}

// ── Create first session ──────────────────────────────

async function _createFirstSession() {
  const btn = document.getElementById('ob-create-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Creando…'; }
  try {
    const rend = {};
    [...state.selected.keys()].forEach(t => { rend[t] = 0; });

    // Save non-base assets as custom
    [...state.selected.values()].filter(a => !ASSETS.includes(a.ticker))
      .forEach(a => addCustomAsset(a.ticker, a.name));

    const today = new Date().toISOString().split('T')[0];
    const ok = await Store.add({
      fecha: today,
      fase: generateDescription({ fecha: today, valor_total_usd: state.capital, rendimientos: rend }),
      valor_total_usd: state.capital,
      rendimientos: rend,
    });
    if (!ok) throw new Error('Error al guardar en la nube');
    hideOnboarding();
    UI.returnInputs(); UI.prefill(); UI.all();
    toast('🚀 ¡Tu portafolio está listo!');
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Crear mi portafolio ✓'; }
    toast('⚠️ ' + err.message);
  }
}

// ── Window handlers (called from inline onclick in dynamic HTML) ──────────────
window._obSkip   = () => hideOnboarding();
window._obBack   = () => _renderStep(state.step - 1);
window._obNext1  = () => {
  const v = parseFloat(document.getElementById('ob-capital')?.value || '0');
  if (!v || v <= 0) {
    const inp = document.getElementById('ob-capital');
    if (inp) { inp.style.borderColor = '#dc2626'; inp.focus(); }
    return;
  }
  state.capital = v;
  _renderStep(2);
};
window._obNext2  = () => { if (state.selected.size > 0) _renderStep(3); };
window._obSearch = v => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => _doSearch(v), 380);
};
window._obToggle = (ticker, name, color) => {
  if (state.selected.has(ticker)) state.selected.delete(ticker);
  else state.selected.set(ticker, { ticker, name, color });
  _renderPopular();
  _renderSelected();
  // Refresh search results to update checkmarks
  const q = document.getElementById('ob-search')?.value;
  if (q?.trim()) _doSearch(q);
};
window._obCreate = () => _createFirstSession();

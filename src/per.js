import { ASSETS, ASSET_META, EDGE_BASE } from './config.js';
import { toast, esc } from './utils.js';
import { db } from './auth.js';

export const WATCHLIST = [
  { ticker: 'SPY',   name: 'SPDR S&P 500 ETF',      type: 'ETF',   color: '#3b82f6',
    thesis: 'El ETF más líquido del mundo. Replica las 500 mayores empresas de EE.UU. Base ideal para cualquier portafolio a largo plazo. Históricamente sube ~10% anual.' },
  { ticker: 'QQQ',   name: 'Invesco Nasdaq 100',     type: 'ETF',   color: '#8b5cf6',
    thesis: 'Las 100 mayores tecnológicas en un solo ETF. Más concentrado que SPY pero con mayor crecimiento histórico. Ideal si crees en el dominio tech a largo plazo.' },
  { ticker: 'AAPL',  name: 'Apple',                  type: 'Stock', color: '#6366f1',
    thesis: 'Ecosistema cerrado con lealtad extrema del consumidor. iPhone + Servicios + Mac = ingresos muy recurrentes. Buybacks masivos que impulsan el precio por acción.' },
  { ticker: 'GOOGL', name: 'Alphabet (Google)',       type: 'Stock', color: '#10b981',
    thesis: 'Domina el 90%+ de búsquedas globales. YouTube + Google Cloud + IA Gemini. Cotiza más barato que la mayoría de sus pares tech con una caja enorme.' },
  { ticker: 'META',  name: 'Meta Platforms',         type: 'Stock', color: '#f59e0b',
    thesis: 'Más de 3 mil millones de usuarios diarios entre Instagram, WhatsApp y Facebook. Líder indiscutible en publicidad digital y con fuerte inversión en IA generativa.' },
  { ticker: 'COST',  name: 'Costco Wholesale',       type: 'Stock', color: '#14b8a6',
    thesis: 'Modelo de membresías recurrentes con renovación del 93%. Los bajos márgenes generan lealtad extrema. Crece de forma estable en expansión y recesión.' },
  { ticker: 'JNJ',   name: 'Johnson & Johnson',      type: 'Stock', color: '#ef4444',
    thesis: 'Farmacéutica y dispositivos médicos con 60+ años aumentando su dividendo. El activo más defensivo de esta lista. Ideal para balancear un portafolio agresivo.' },
  { ticker: 'TSLA',  name: 'Tesla',                  type: 'Stock', color: '#f97316',
    thesis: 'Líder en vehículos eléctricos con marca aspiracional única. Alto riesgo / alta recompensa. Su PER históricamente elevado refleja expectativas de crecimiento futuro.' },
];

export function perZone(per) {
  if (per < 18) return { bg:'#f0fdf4', border:'#bbf7d0', dot:'#10b981', text:'#065f46', zone:'Posiblemente barata 🟢', tip:'Precio razonable. Investiga: ¿la empresa gana dinero? ¿tiene deudas? ¿crece?' };
  if (per > 25) return { bg:'#fef2f2', border:'#fecaca', dot:'#dc2626', text:'#7f1d1d', zone:'Cara 🔴',                tip:'PER alto. Solo tiene sentido si crece muy rápido. Investiga antes de comprar más.' };
  return          { bg:'#fffbeb', border:'#fde68a', dot:'#f59e0b', text:'#78350f', zone:'Precio normal 🟡',          tip:'Ni barata ni cara. Evalúa si el negocio sigue creciendo y si tiene ventajas sobre la competencia.' };
}

async function _fetchTickers(tickers) {
  const { data: { session } } = await db.auth.getSession();
  const res = await fetch(`${EDGE_BASE}/market-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ tickers }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function analyzeTickerPer(rawTicker) {
  const ticker  = rawTicker.trim().toUpperCase();
  const loading = document.getElementById('per-loading');
  const result  = document.getElementById('per-result');
  if (!ticker) { toast('Escribe un símbolo. Ej: AAPL'); return; }
  if (!/^[A-Z]{1,6}$/.test(ticker)) { toast('Símbolo inválido. Usa letras mayúsculas, máx 6. Ej: MSFT'); return; }

  if (loading) { loading.style.display = 'block'; loading.textContent = `Buscando datos de ${ticker}…`; }
  if (result)    result.style.display = 'none';

  try {
    const items = await _fetchTickers([ticker]);
    const item  = items[0];
    if (loading) loading.style.display = 'none';
    if (!result) return;

    if (item.error) {
      result.style.display = 'block';
      result.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:11px;padding:15px;color:#7f1d1d;font-size:13px;">
        No se encontraron datos para <strong>${esc(ticker)}</strong>. Verifica que el símbolo sea correcto (usa el símbolo de bolsa, no el nombre).
      </div>`;
      return;
    }

    const wl   = WATCHLIST.find(w => w.ticker === ticker);
    const z    = item.pe ? perZone(item.pe) : null;
    const chgColor = (item.changePercent ?? 0) >= 0 ? '#059669' : '#dc2626';
    const chgSign  = (item.changePercent ?? 0) >= 0 ? '+' : '';
    const ratingCfg = { 'COMPRAR': { bg:'#ecfdf5', color:'#059669' }, 'MANTENER': { bg:'#fffbeb', color:'#d97706' }, 'VENDER': { bg:'#fef2f2', color:'#dc2626' } };
    const rc = ratingCfg[item.analystRating ?? ''];

    // Barra de rango 52 semanas
    let rangeBar = '';
    if (item.week52Low && item.week52High && item.currentPrice) {
      const pct = Math.min(100, Math.max(0, ((item.currentPrice - item.week52Low) / (item.week52High - item.week52Low)) * 100));
      rangeBar = `<div style="margin-top:12px;">
        <div style="font-size:11px;color:#78716c;margin-bottom:5px;font-weight:600;">Rango 52 semanas</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;color:#a8a29e;">$${item.week52Low.toFixed(0)}</span>
          <div style="flex:1;height:5px;background:#e7e5e4;border-radius:3px;position:relative;">
            <div style="position:absolute;left:${pct}%;transform:translateX(-50%);top:-3px;width:11px;height:11px;border-radius:50%;background:var(--primary);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.2);"></div>
          </div>
          <span style="font-size:11px;color:#a8a29e;">$${item.week52High.toFixed(0)}</span>
        </div>
        <div style="text-align:center;font-size:10px;color:var(--text-3);margin-top:3px;">${pct.toFixed(0)}% del rango anual</div>
      </div>`;
    }

    result.style.display = 'block';
    result.innerHTML = `
      <div style="border:1px solid var(--border);border-radius:13px;overflow:hidden;">
        <!-- Header -->
        <div style="padding:16px 18px;background:linear-gradient(135deg,#f5f3ff,#faf5ff);border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
            <div>
              <div style="font-size:20px;font-weight:800;font-family:'Space Grotesk',sans-serif;">${esc(ticker)}</div>
              <div style="font-size:13px;color:var(--text-2);margin-top:2px;">${esc(item.name ?? '')}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:22px;font-weight:700;font-family:'Space Grotesk',sans-serif;">$${item.currentPrice?.toFixed(2) ?? 'N/D'}</div>
              <div style="font-size:12px;font-weight:600;color:${chgColor};">${chgSign}${item.changePercent?.toFixed(2) ?? '—'}% hoy</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
            ${rc ? `<span style="font-size:11px;font-weight:700;background:${rc.bg};color:${rc.color};padding:3px 10px;border-radius:20px;">Analistas: ${esc(item.analystRating)}</span>` : ''}
            ${item.pe ? `<span style="font-size:11px;font-weight:700;background:#f5f3ff;color:var(--primary);padding:3px 10px;border-radius:20px;">PER ${item.pe.toFixed(1)}x</span>` : ''}
            ${item.forwardPe ? `<span style="font-size:11px;font-weight:600;background:#f5f5f4;color:#78716c;padding:3px 10px;border-radius:20px;">PER futuro ${item.forwardPe.toFixed(1)}x</span>` : ''}
          </div>
        </div>
        <!-- PER Analysis -->
        <div style="padding:16px 18px;">
          ${z ? `<div style="background:${z.bg};border:1px solid ${z.border};border-radius:10px;padding:14px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <div style="width:10px;height:10px;border-radius:50%;background:${z.dot};flex-shrink:0;"></div>
              <div style="font-size:14px;font-weight:700;color:${z.text};">${esc(ticker)} con PER ${item.pe.toFixed(1)}x → ${z.zone}</div>
            </div>
            <p style="font-size:12px;color:${z.text};opacity:.9;margin:0;line-height:1.7;">${z.tip}</p>
          </div>` : '<div style="background:#f5f5f4;border-radius:10px;padding:12px;font-size:13px;color:#78716c;">PER no disponible para este activo (puede ser ETF o empresa sin beneficios publicados).</div>'}
          ${rangeBar}
          ${wl ? `<div style="margin-top:12px;padding:12px;background:#fafaf9;border:1px solid var(--border);border-radius:10px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">¿Por qué está en la lista?</div>
            <p style="font-size:12px;color:var(--text-2);line-height:1.7;margin:0;">${esc(wl.thesis)}</p>
          </div>` : ''}
        </div>
      </div>`;
  } catch (err) {
    if (loading) loading.style.display = 'none';
    if (result) {
      result.style.display = 'block';
      result.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:11px;padding:15px;color:#7f1d1d;font-size:13px;">Error al obtener datos: ${esc(err.message)}</div>`;
    }
  }
}

export async function renderWatchlist() {
  const el = document.getElementById('per-watchlist');
  if (!el) return;

  // Skeleton loading
  el.innerHTML = WATCHLIST.map(w =>
    `<div style="background:#fafaf9;border:1px solid var(--border);border-radius:11px;padding:13px;display:flex;align-items:center;gap:10px;animate:pulse;">
      <div style="width:38px;height:38px;border-radius:9px;background:#e7e5e4;flex-shrink:0;"></div>
      <div style="flex:1;"><div style="height:12px;background:#e7e5e4;border-radius:4px;width:40%;margin-bottom:6px;"></div><div style="height:10px;background:#f5f5f4;border-radius:4px;width:70%;"></div></div>
      <div style="width:50px;height:20px;background:#e7e5e4;border-radius:6px;"></div>
    </div>`
  ).join('');

  try {
    const tickers = WATCHLIST.map(w => w.ticker);
    const items   = await _fetchTickers(tickers);
    const byTicker = Object.fromEntries(items.map(i => [i.ticker, i]));

    el.innerHTML = WATCHLIST.map(w => {
      const d = byTicker[w.ticker] ?? {};
      const z = d.pe ? perZone(d.pe) : null;
      const chgColor = (d.changePercent ?? 0) >= 0 ? '#059669' : '#dc2626';
      const chgSign  = (d.changePercent ?? 0) >= 0 ? '+' : '';
      const typeBg   = w.type === 'ETF' ? '#f0fdf4' : '#f5f3ff';
      const typeClr  = w.type === 'ETF' ? '#059669' : '#7c3aed';

      return `<button onclick="analyzeTickerPer('${w.ticker}')" style="width:100%;text-align:left;background:white;border:1px solid var(--border);border-radius:11px;padding:13px 15px;cursor:pointer;transition:box-shadow .15s,transform .15s;display:flex;align-items:flex-start;gap:12px;font-family:inherit;" onmouseover="this.style.boxShadow='0 4px 14px rgba(0,0,0,.08)';this.style.transform='translateY(-1px)'" onmouseout="this.style.boxShadow='';this.style.transform=''">
        <div style="width:40px;height:40px;border-radius:10px;background:${w.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1.5px solid ${w.color}33;">
          <span style="font-size:13px;font-weight:800;color:${w.color};">${w.ticker.slice(0,3)}</span>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">
            <span style="font-size:13px;font-weight:700;">${esc(w.ticker)}</span>
            <span style="font-size:10px;font-weight:700;background:${typeBg};color:${typeClr};padding:1px 7px;border-radius:20px;">${w.type}</span>
            ${z ? `<span style="font-size:10px;font-weight:700;background:${z.bg};color:${z.text};padding:1px 7px;border-radius:20px;">PER ${d.pe.toFixed(0)}x</span>` : ''}
          </div>
          <div style="font-size:11px;color:var(--text-3);margin-bottom:4px;">${esc(w.name)}</div>
          <div style="font-size:11px;color:var(--text-2);line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${esc(w.thesis)}</div>
        </div>
        <div style="flex-shrink:0;text-align:right;">
          ${d.currentPrice ? `<div style="font-size:13px;font-weight:700;">$${d.currentPrice.toFixed(2)}</div>
          <div style="font-size:11px;color:${chgColor};font-weight:600;">${chgSign}${d.changePercent?.toFixed(2) ?? '—'}%</div>` : '<div style="font-size:11px;color:#a8a29e;">—</div>'}
        </div>
      </button>`;
    }).join('');
  } catch {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-3);padding:8px;">No se pudieron cargar las recomendaciones.</div>';
  }
}

export function evaluateAllPer() {
  const results = ASSETS
    .map(a => ({ a, per: parseFloat(document.getElementById('per-inp-' + a)?.value || '') }))
    .filter(x => !isNaN(x.per) && x.per > 0);
  if (!results.length) { toast('Ingresa al menos un PER para evaluar'); return; }
  const el = document.getElementById('per-my-results');
  el.style.display = 'block';
  el.innerHTML = '<div style="font-size:13px;font-weight:700;margin-bottom:10px;">Resultado de tus acciones:</div>' +
    results.map(({ a, per }) => {
      const z = perZone(per);
      return `<div class="per-row" style="background:${z.bg};border-color:${z.border};">
        <div class="per-dot" style="background:${z.dot};"></div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:${z.text};">${esc(a)} — ${esc(ASSET_META[a].full)} · PER ${per.toFixed(1)}x → ${z.zone}</div>
          <div style="font-size:12px;color:${z.text};opacity:.85;margin-top:2px;">${z.tip}</div>
        </div>
      </div>`;
    }).join('');
}

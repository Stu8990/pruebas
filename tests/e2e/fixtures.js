// Supabase simulado para las pruebas de navegador. Intercepta auth, REST y
// Edge Functions, así la app corre completa sin tocar la base real.
import { test as base, expect } from '@playwright/test';

export const REF = 'fjufxwkhjgbkhqvpmryb';
export const USER_ID = '00000000-0000-4000-8000-000000000001';
export const TODAY = '2026-09-18';

// Posiciones del usuario de prueba (formato de la tabla user_positions).
export const POSITIONS = {
  VOO:  { purchases: [{ date: '2026-03-02', shares: 1.2, price: 480 }] },
  AMZN: { purchases: [{ date: '2026-03-02', shares: 3,   price: 180 }] },
  MSFT: { purchases: [{ date: '2026-03-02', shares: 1,   price: 410 }] },
  NVDA: { purchases: [{ date: '2026-03-02', shares: 8,   price: 110 }] },
  VISA: { purchases: [{ date: '2026-04-10', shares: 1.5, price: 280 }] },
  SCHD: { purchases: [{ date: '2026-04-10', shares: 10,  price: 27 }] },
};
export const CASH = 150;

// Precio de cada activo en tres momentos: 1 jul, 31 ago (cierre de agosto) y hoy.
// Septiembre es malo para NVDA y AMZN: eso es lo que la app debe saber explicar.
const PATH = {
  VOO:  [520, 545, 538],
  AMZN: [205, 214, 199],
  MSFT: [440, 455, 452],
  NVDA: [150, 168, 146],
  V:    [300, 312, 318],
  SCHD: [28, 28.6, 28.9],
};
const YF = { VISA: 'V' };

const MARKET = {
  VOO:  { name: 'Vanguard S&P 500 ETF', pe: 26.1, forwardPe: 22.4, week52High: 552, week52Low: 470, analystRating: null },
  AMZN: { name: 'Amazon.com, Inc.',      pe: 34.2, forwardPe: 28.9, week52High: 232, week52Low: 161, analystRating: 'COMPRAR' },
  MSFT: { name: 'Microsoft Corporation', pe: 33.5, forwardPe: 29.8, week52High: 468, week52Low: 385, analystRating: 'COMPRAR' },
  NVDA: { name: 'NVIDIA Corporation',    pe: 48.7, forwardPe: 31.2, week52High: 175, week52Low: 98,  analystRating: 'COMPRAR' },
  V:    { name: 'Visa Inc.',             pe: 30.4, forwardPe: 26.1, week52High: 320, week52Low: 262, analystRating: 'COMPRAR' },
  SCHD: { name: 'Schwab US Dividend Equity ETF', pe: 16.2, forwardPe: null, week52High: 29.4, week52Low: 25.8, analystRating: null },
  AAPL: { name: 'Apple Inc.',            pe: 31.0, forwardPe: 28.0, week52High: 260, week52Low: 190, analystRating: 'MANTENER' },
};
const PRICE_NOW = { AAPL: 231 };
const CHANGE_TODAY = { VOO: -0.4, AMZN: -1.8, MSFT: 0.3, NVDA: -2.9, V: 0.6, SCHD: 0.1, AAPL: 0.5 };

export function yf(t) { return YF[t] ?? t; }
export function priceNow(yft) { return PRICE_NOW[yft] ?? PATH[yft]?.[2] ?? null; }
export function priceMonthStart(yft) { return PATH[yft]?.[1] ?? null; }

function lerp(a, b, t) { return a + (b - a) * t; }
function iso(d) { return d.toISOString().slice(0, 10); }

// Precio "de mercado" de un activo en una fecha, interpolado entre los tres puntos.
function priceAt(yft, date) {
  const [p0, p1, p2] = PATH[yft];
  const d = new Date(date + 'T12:00:00Z').getTime();
  const t0 = Date.parse('2026-07-01T12:00:00Z'), t1 = Date.parse('2026-08-31T12:00:00Z'), t2 = Date.parse(TODAY + 'T12:00:00Z');
  // pequeña ondulación determinista para que la curva no sea una recta
  const wobble = 1 + Math.sin(d / 8.64e7 / 2.3 + yft.length) * 0.012;
  if (d <= t1) return lerp(p0, p1, (d - t0) / (t1 - t0)) * wobble;
  return lerp(p1, p2, (d - t1) / (t2 - t1)) * wobble;
}

function avgPrice(t) {
  const p = POSITIONS[t].purchases;
  const sh = p.reduce((s, x) => s + x.shares, 0);
  return p.reduce((s, x) => s + x.shares * x.price, 0) / sh;
}

// Historial de días hábiles del 1 jul al día anterior a hoy, con un aporte
// declarado de $300 el 14 ago (entra como efectivo).
export function buildHistory({ until = '2026-09-17' } = {}) {
  const out = [];
  for (let d = new Date('2026-07-01T12:00:00Z'); iso(d) <= until; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const fecha = iso(d);
    const cash = fecha >= '2026-08-14' ? CASH + 300 : CASH;
    let value = cash;
    const rend = {};
    for (const t of Object.keys(POSITIONS)) {
      const px = priceAt(yf(t), fecha);
      const sh = POSITIONS[t].purchases.reduce((s, x) => s + x.shares, 0);
      value += sh * px;
      rend[t] = +(((px - avgPrice(t)) / avgPrice(t)) * 100).toFixed(2);
    }
    if (fecha === '2026-08-14') rend._capitalInjected = 300;
    out.push({ fecha, fase: '', valor_total_usd: +value.toFixed(2), rendimientos: rend });
  }
  return out;
}

function marketItem(yft, withMonth = true) {
  const m = MARKET[yft];
  if (!m) return { ticker: yft, error: 'not found' };
  return {
    ticker: yft, name: m.name, currentPrice: priceNow(yft), changePercent: CHANGE_TODAY[yft] ?? 0,
    pe: m.pe, forwardPe: m.forwardPe, week52High: m.week52High, week52Low: m.week52Low,
    analystRating: m.analystRating, ...(withMonth ? { monthStartPrice: priceMonthStart(yft) } : {}),
    latestNews: { title: `${m.name}: titular de prueba`, url: 'https://example.com/news' },
  };
}

function fakeJwt() {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, exp: 4102444800, role: 'authenticated' })}.sig`;
}

export const USER = {
  id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'demo@investsmart.test',
  user_metadata: { last_cash: CASH + 300 }, app_metadata: {}, created_at: '2026-03-01T00:00:00Z',
};

/**
 * Deja la página con sesión iniciada y el backend simulado.
 * scenario: { history, positions, aiFails, ai }
 */
export async function mockBackend(page, scenario = {}) {
  const history   = [...(scenario.history ?? buildHistory())];
  const positions = scenario.positions ?? POSITIONS;
  const calls = { ai: [], market: [], inserts: [] };
  let clock = Date.parse('2026-09-18T12:00:00Z');
  const bump = () => new Date(clock += 1000).toISOString();
  const store = { row: Object.keys(positions).length ? { data: JSON.parse(JSON.stringify(positions)), updated_at: bump() } : null };
  calls.store = store;

  await page.addInitScript(({ ref, session, today }) => {
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
    // Fecha fija para que los cálculos de "este mes" sean deterministas.
    const fixed = new Date(today + 'T15:00:00').getTime();
    const RealDate = Date;
    class FakeDate extends RealDate {
      constructor(...a) { super(...(a.length ? a : [fixed])); }
      static now() { return fixed; }
    }
    window.Date = FakeDate;
    // No registrar el service worker en pruebas: cachearía los módulos.
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ update() {} });
  }, {
    ref: REF, today: TODAY,
    session: {
      access_token: fakeJwt(), refresh_token: 'r', token_type: 'bearer',
      expires_in: 3600, expires_at: 4102444800, user: USER,
    },
  });

  await page.route(`https://${REF}.supabase.co/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'access-control-allow-origin': '*' },
    });
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: {
        'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*',
      } });
    }
    const p = url.pathname;
    if (p === '/auth/v1/user') {
      if (req.method() === 'PUT') { calls.userUpdates = [...(calls.userUpdates ?? []), req.postDataJSON()]; }
      return json(USER);
    }
    if (p === '/auth/v1/logout') return json({});
    if (p.startsWith('/auth/v1/token')) return json({});
    if (p === '/rest/v1/sessions') {
      if (req.method() === 'GET') {
        const f = url.searchParams.get('fecha');
        return json(f ? history.filter(r => `eq.${r.fecha}` === f) : history);
      }
      if (req.method() === 'POST') {
        const body = req.postDataJSON();
        calls.inserts.push(body);
        for (const r of [].concat(body)) history.push({ fecha: r.fecha, fase: r.fase, valor_total_usd: r.valor_total_usd, rendimientos: r.rendimientos });
        return json([], 201);
      }
      if (req.method() === 'PATCH') {
        const patch = req.postDataJSON();
        calls.inserts.push({ patch, query: url.search });
        const f = url.searchParams.get('fecha'), fase = url.searchParams.get('fase');
        for (const r of history) if (`eq.${r.fecha}` === f && (!fase || `eq.${r.fase}` === fase)) Object.assign(r, patch);
        return json([]);
      }
      if (req.method() === 'DELETE') { calls.deletes = (calls.deletes ?? 0) + 1; return json([]); }
    }
    if (p === '/rest/v1/user_positions') {
      // Semántica de la tabla real: una fila por usuario (PK user_id) con
      // updated_at; PATCH filtrado por updated_at sólo actualiza si coincide.
      if (req.method() === 'GET') {
        if (!store.row) return json([]);
        const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
        const row = { data: store.row.data, updated_at: store.row.updated_at };
        return json(single ? row : [row]);
      }
      const body = req.postDataJSON();
      if (req.method() === 'PATCH') {
        // Otro dispositivo escribe justo entre nuestra lectura y nuestra escritura.
        if (scenario.conflictOnce && !store.conflicted) { store.conflicted = true; scenario.conflictOnce(store); }
        const want = url.searchParams.get('updated_at');
        if (!store.row || (want && want !== `eq.${store.row.updated_at}`)) return json([]);
        store.row = { data: body.data, updated_at: bump() };
        calls.positionWrites = [...(calls.positionWrites ?? []), { data: body.data }];
        return json([{ user_id: USER_ID }]);
      }
      if (req.method() === 'POST') {
        if (store.row) return json({ code: '23505', message: 'duplicate key' }, 409);
        store.row = { data: body.data, updated_at: bump() };
        calls.positionWrites = [...(calls.positionWrites ?? []), { data: body.data }];
        return json([], 201);
      }
      return json([]);
    }
    if (p === '/functions/v1/market-data') {
      const body = req.postDataJSON() ?? {};
      calls.market.push(body);
      if (body.search) {
        const q = String(body.search).toUpperCase();
        return json(Object.entries(MARKET).filter(([t, m]) => t.includes(q) || m.name.toUpperCase().includes(q))
          .map(([t, m]) => ({ ticker: t, name: m.name, exchange: 'NMS', type: 'EQUITY' })));
      }
      return json((body.tickers ?? []).map(t => marketItem(t, !!body.monthStart && !(scenario.noMonthFor ?? []).includes(t))));
    }
    if (p === '/functions/v1/ai-analysis') {
      const body = req.postDataJSON() ?? {};
      calls.ai.push(body);
      if (scenario.aiFails) return json({ error: 'Servicio no configurado' }, 500);
      if (body.mode === 'advisor') return json({ answer: 'Respuesta de prueba del asesor.' });
      if (body.mode === 'explain') return json({ summary: 'Resumen de prueba de la IA.' });
      return json(scenario.ai ?? {
        insight: 'Insight de prueba.',
        recommendations: [{ type: 'amber', icon: 'chart', title: 'Rec de prueba', body: 'Cuerpo', action: 'Mantén', conf: 70 }],
        pulse: [],
      });
    }
    return json({});
  });

  // Bloquea CDNs de fuentes (no afectan a la lógica y ralentizan).
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  return calls;
}

export const test = base;
export { expect };

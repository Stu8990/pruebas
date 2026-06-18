// Edge Function: market-data
// Modos: { tickers: string[] } — precios en vivo
//        { search: string }    — búsqueda de activos por nombre/símbolo
// Deploy: supabase functions deploy market-data

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS dinámico — solo orígenes autorizados ─────────────────
const ALLOWED_ORIGINS = [
  'https://stu8990.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const TICKER_RE        = /^[A-Z0-9.\-]{1,10}$/;
const MAX_TICKERS      = 20;
const RATE_LIMIT_PRICE = 200; // precios en vivo — por usuario por hora
const RATE_LIMIT_SEARCH = 60; // búsquedas de activos — por usuario por hora
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Auth: retorna el usuario o null ──────────────────────────
async function getAuthUser(req: Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  return (!error && user) ? user : null;
}

// ── Rate limiting — SERVICE_ROLE para escribir sin RLS ───────
async function checkRateLimit(userId: string, endpoint: string, limit: number): Promise<boolean> {
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .gte('created_at', since);

    if ((count ?? 0) >= limit) return false;
    await admin.from('api_usage').insert({ user_id: userId, endpoint });
    return true;
  } catch { return true; } // si falla el check, no bloqueamos
}

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  try {
    const cookieRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'follow' });
    const rawCookie = cookieRes.headers.get('set-cookie') ?? '';
    const cookie = rawCookie.split(',').map(c => c.split(';')[0].trim()).join('; ');
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Cookie': cookie },
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes('<')) return null;
    return { crumb, cookie };
  } catch { return null; }
}

async function fetchTicker(ticker: string, crumb: string, cookie: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
      `?modules=price,summaryDetail,recommendationTrend&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Cookie': cookie } });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const json   = await res.json();
    const result = json.quoteSummary?.result?.[0];
    if (!result) throw new Error('No result');

    const price   = result.price ?? {};
    const summary = result.summaryDetail ?? {};
    const reco    = result.recommendationTrend?.trend?.[0];

    let analystRating: string | null = null;
    if (reco) {
      const buy  = (reco.strongBuy ?? 0) + (reco.buy ?? 0);
      const sell = (reco.strongSell ?? 0) + (reco.sell ?? 0);
      const hold = reco.hold ?? 0;
      const total = buy + sell + hold;
      if (total > 0) {
        const score = (buy * 2 + hold) / total;
        analystRating = score > 1.4 ? 'COMPRAR' : score > 0.7 ? 'MANTENER' : 'VENDER';
      }
    }

    let latestNews: { title: string; url: string } | null = null;
    try {
      const newsRes = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=1&crumb=${encodeURIComponent(crumb)}`,
        { headers: { 'User-Agent': UA, 'Cookie': cookie } }
      );
      if (newsRes.ok) {
        const nj    = await newsRes.json();
        const first = nj.news?.[0];
        if (first?.link?.startsWith('https://'))
          latestNews = { title: String(first.title ?? '').slice(0, 200), url: first.link };
      }
    } catch { /* news es opcional */ }

    return {
      ticker,
      name:          price.longName ?? price.shortName ?? ticker,
      currentPrice:  price.regularMarketPrice?.raw ?? null,
      changePercent: price.regularMarketChangePercent?.raw != null
                       ? price.regularMarketChangePercent.raw * 100 : null,
      pe:            summary.trailingPE?.raw ?? null,
      forwardPe:     summary.forwardPE?.raw ?? null,
      week52High:    summary.fiftyTwoWeekHigh?.raw ?? null,
      week52Low:     summary.fiftyTwoWeekLow?.raw ?? null,
      analystRating,
      buyCount:  reco ? (reco.strongBuy ?? 0) + (reco.buy ?? 0) : 0,
      holdCount: reco?.hold ?? 0,
      sellCount: reco ? (reco.strongSell ?? 0) + (reco.sell ?? 0) : 0,
      latestNews,
      error: null,
    };
  } catch (err) {
    return { ticker, error: (err as Error).message, currentPrice: null, pe: null };
  }
}

async function searchAssets(q: string, crumb: string, cookie: string) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&crumb=${encodeURIComponent(crumb)}`;
  const res  = await fetch(url, { headers: { 'User-Agent': UA, 'Cookie': cookie } });
  if (!res.ok) throw new Error(`Yahoo search HTTP ${res.status}`);
  const json = await res.json();
  return (json.quotes ?? [])
    .filter((r: Record<string, string>) => r.quoteType === 'EQUITY' || r.quoteType === 'ETF')
    .slice(0, 8)
    .map((r: Record<string, string>) => ({
      ticker:   r.symbol,
      name:     r.longname || r.shortname || r.symbol,
      exchange: r.exchDisp || r.exchange,
      type:     r.quoteType,
    }));
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const user = await getAuthUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json() as { tickers?: unknown; search?: unknown };

    // ── Modo búsqueda ────────────────────────────────
    if (body.search !== undefined) {
      const allowed = await checkRateLimit(user.id, 'market-data-search', RATE_LIMIT_SEARCH);
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Límite de búsquedas alcanzado. Intenta en unos minutos.' }), {
          status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      const q = String(body.search).slice(0, 80).replace(/[^\w\s.\-]/g, '');
      if (!q.trim()) return new Response(JSON.stringify([]), { headers: { ...cors, 'Content-Type': 'application/json' } });
      const auth = await getYahooCrumb();
      if (!auth) return new Response(JSON.stringify({ error: 'No se pudo conectar con Yahoo Finance' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      const results = await searchAssets(q, auth.crumb, auth.cookie);
      return new Response(JSON.stringify(results), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // ── Modo precios ─────────────────────────────────
    const allowed = await checkRateLimit(user.id, 'market-data', RATE_LIMIT_PRICE);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Límite de solicitudes alcanzado. Intenta en unos minutos.' }), {
        status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { tickers } = body;
    if (!Array.isArray(tickers) || tickers.length === 0 || tickers.length > MAX_TICKERS)
      return new Response(JSON.stringify({ error: 'tickers debe ser un array de 1-20 elementos' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const invalid = tickers.find(t => typeof t !== 'string' || !TICKER_RE.test(t));
    if (invalid !== undefined)
      return new Response(JSON.stringify({ error: `Símbolo inválido: ${invalid}` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const auth = await getYahooCrumb();
    if (!auth)
      return new Response(JSON.stringify({ error: 'No se pudo autenticar con Yahoo Finance' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });

    const results = await Promise.all((tickers as string[]).map(t => fetchTicker(t, auth.crumb, auth.cookie)));
    return new Response(JSON.stringify(results), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

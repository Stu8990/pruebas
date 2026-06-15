// Edge Function: market-data
// Proxy para Yahoo Finance — requiere JWT válido de Supabase Auth
// Deploy: supabase functions deploy market-data

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TICKER_RE = /^[A-Z]{1,6}$/;
const MAX_TICKERS = 20;

async function verifyAuth(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user;
}

async function fetchTicker(ticker: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
      `?modules=price,summaryDetail,recommendationTrend,assetProfile`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestSmart/1.0)' },
    });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

    const json = await res.json();
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
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=1`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (newsRes.ok) {
        const newsJson = await newsRes.json();
        const first = newsJson.news?.[0];
        if (first?.link?.startsWith('https://')) {
          latestNews = { title: String(first.title ?? '').slice(0, 200), url: first.link };
        }
      }
    } catch { /* news is optional */ }

    return {
      ticker,
      name:           price.longName ?? price.shortName ?? ticker,
      currentPrice:   price.regularMarketPrice?.raw ?? null,
      changePercent:  price.regularMarketChangePercent?.raw != null
                        ? price.regularMarketChangePercent.raw * 100
                        : null,
      pe:             summary.trailingPE?.raw ?? null,
      forwardPe:      summary.forwardPE?.raw ?? null,
      week52High:     summary.fiftyTwoWeekHigh?.raw ?? null,
      week52Low:      summary.fiftyTwoWeekLow?.raw ?? null,
      analystRating,
      buyCount:       reco ? (reco.strongBuy ?? 0) + (reco.buy ?? 0) : 0,
      holdCount:      reco?.hold ?? 0,
      sellCount:      reco ? (reco.strongSell ?? 0) + (reco.sell ?? 0) : 0,
      latestNews,
      error:          null,
    };
  } catch (err) {
    return { ticker, error: (err as Error).message, currentPrice: null, pe: null };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!(await verifyAuth(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { tickers } = await req.json() as { tickers: unknown };

    if (!Array.isArray(tickers) || tickers.length === 0 || tickers.length > MAX_TICKERS) {
      return new Response(JSON.stringify({ error: 'tickers must be an array of 1-20 items' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const invalid = tickers.find(t => typeof t !== 'string' || !TICKER_RE.test(t));
    if (invalid !== undefined) {
      return new Response(JSON.stringify({ error: `Invalid ticker: ${invalid}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = await Promise.all((tickers as string[]).map(fetchTicker));

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

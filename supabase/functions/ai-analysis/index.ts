// Edge Function: ai-analysis
// mode: undefined → portfolio analysis (original)
// mode: 'buy'    → buy/sell analysis for a specific ticker

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS dinámico ─────────────────────────────────────────────
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

const RATE_LIMIT = 20; // llamadas por hora

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

async function checkRateLimit(userId: string): Promise<boolean> {
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
      .eq('endpoint', 'ai-analysis')
      .gte('created_at', since);

    if ((count ?? 0) >= RATE_LIMIT) return false;
    await admin.from('api_usage').insert({ user_id: userId, endpoint: 'ai-analysis' });
    return true;
  } catch { return true; }
}

interface Session {
  fecha: string;
  valor_total_usd: number;
  rendimientos: Record<string, number | null>;
}

interface PositionItem {
  ticker: string;
  shares: number;
  avgPrice: number;
  costBasis: number;
}

interface MarketItem {
  ticker: string;
  name: string;
  currentPrice: number | null;
  changePercent: number | null;
  pe: number | null;
  forwardPe: number | null;
  week52High: number | null;
  week52Low: number | null;
  analystRating: string | null;
}

interface BuyPortfolio {
  valorActual: number | null;
  riskScore: number;
  sesiones: number;
  existingReturn: number | null;
  dominantSector: string | null;
  tickerIsInPortfolio: boolean;
}

interface SuggestPortfolio {
  valorActual: number | null;
  riskScore: number;
  sesiones: number;
  currentTickers: string[];
  dominantSector: string | null;
}

// ── Input sanitization (prevent prompt injection) ───────
function sanitizeSuggestPortfolio(p: unknown): SuggestPortfolio {
  const raw = (p ?? {}) as Record<string, unknown>;
  return {
    valorActual:    typeof raw.valorActual === 'number' ? raw.valorActual : null,
    riskScore:      Math.max(0, Math.min(1, Number(raw.riskScore) || 0)),
    sesiones:       Math.max(0, Math.floor(Number(raw.sesiones) || 0)),
    currentTickers: Array.isArray(raw.currentTickers)
      ? raw.currentTickers.map(t => String(t).slice(0, 10).replace(/[^A-Z0-9.\-]/g, '')).filter(Boolean).slice(0, 30)
      : [],
    dominantSector: raw.dominantSector ? String(raw.dominantSector).slice(0, 60).replace(/[^\w\s()áéíóúñ]/gi, '') : null,
  };
}

function sanitizeBuyPortfolio(p: unknown): BuyPortfolio {
  const raw = (p ?? {}) as Record<string, unknown>;
  return {
    valorActual:        typeof raw.valorActual === 'number' ? raw.valorActual : null,
    riskScore:          Math.max(0, Math.min(1, Number(raw.riskScore) || 0)),
    sesiones:           Math.max(0, Math.floor(Number(raw.sesiones) || 0)),
    existingReturn:     typeof raw.existingReturn === 'number' ? raw.existingReturn : null,
    dominantSector:     raw.dominantSector ? String(raw.dominantSector).slice(0, 60).replace(/[^\w\s()áéíóúñ]/gi, '') : null,
    tickerIsInPortfolio: !!raw.tickerIsInPortfolio,
  };
}

// ── Suggest prompt ──────────────────────────────────────
function buildSuggestPrompt(portfolio: SuggestPortfolio): string {
  const riskLabel = portfolio.riskScore > 0.7 ? 'alta' : portfolio.riskScore > 0.5 ? 'moderada' : 'conservadora';
  return `Eres un asesor de inversiones senior. Recomienda exactamente 2 activos del mercado americano (acciones o ETFs) que este usuario debería CONSIDERAR COMPRAR ahora, como complemento a su portafolio actual.

Responde EXCLUSIVAMENTE en JSON válido:
{ "tickers": ["TICKER1", "TICKER2"] }

REGLAS ESTRICTAS:
- Solo el JSON, sin texto adicional ni markdown
- Usa símbolos exactos de Yahoo Finance (ej: AAPL, BRK-B, VTI, QQQ)
- NO repitas los activos que ya tiene el usuario
- Elige activos que complementen el portafolio (diversificación de sector, balance riesgo)
- Considera el perfil de riesgo para calibrar la agresividad de las recomendaciones

PORTAFOLIO DEL USUARIO:
- Valor actual: $${portfolio.valorActual?.toFixed(2) ?? 'N/D'}
- Sesiones registradas: ${portfolio.sesiones}
- Tolerancia al riesgo: ${riskLabel}
- Sector dominante: ${portfolio.dominantSector ?? 'sin datos suficientes'}
- Activos actuales: ${portfolio.currentTickers.join(', ') || 'ninguno registrado'}`;
}

// ── Buy analysis prompt ─────────────────────────────────
function buildBuyPrompt(ticker: string, marketData: MarketItem, portfolio: BuyPortfolio): string {
  const chg    = marketData.changePercent;
  const chgStr = chg !== null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : 'N/D';
  const riskLabel = portfolio.riskScore > 0.7 ? 'alta' : portfolio.riskScore > 0.5 ? 'moderada' : 'conservadora';

  let rangeInfo = '';
  if (marketData.week52Low && marketData.week52High && marketData.currentPrice) {
    const pct = ((marketData.currentPrice - marketData.week52Low) / (marketData.week52High - marketData.week52Low) * 100).toFixed(0);
    rangeInfo = `Rango 52 semanas: $${marketData.week52Low.toFixed(2)} – $${marketData.week52High.toFixed(2)} | Posición actual: ${pct}% del rango`;
  }

  const portfolioSection = portfolio.valorActual
    ? `PORTAFOLIO DEL USUARIO:
- Valor actual: $${portfolio.valorActual.toFixed(2)}
- Sesiones registradas: ${portfolio.sesiones}
- Tolerancia al riesgo: ${riskLabel} (score: ${(portfolio.riskScore * 10).toFixed(1)}/10)
${portfolio.dominantSector ? `- Sector dominante: ${portfolio.dominantSector}` : ''}
${portfolio.tickerIsInPortfolio
  ? `- YA TIENE ${ticker} con rendimiento actual: ${portfolio.existingReturn !== null ? (portfolio.existingReturn >= 0 ? '+' : '') + portfolio.existingReturn.toFixed(2) + '%' : 'N/D'}`
  : `- NO tiene ${ticker} en su portafolio aún`}`
    : 'PORTAFOLIO: Sin datos de portafolio aún.';

  return `Eres un asesor de inversiones senior. Analiza si es buen momento para COMPRAR este activo y responde EXCLUSIVAMENTE en JSON válido con esta estructura exacta:

{
  "verdict": "COMPRAR|ESPERAR|EVITAR",
  "score": número_entero_del_1_al_10,
  "razon_principal": "una oración directa con números reales del activo",
  "puntos_favor": ["punto positivo concreto con datos", "otro punto positivo"],
  "puntos_riesgo": ["riesgo específico con contexto", "otro riesgo"],
  "precio_entrada": "rango sugerido en USD o descripción breve",
  "horizonte": "corto plazo (1-3 meses)|mediano plazo (6-12 meses)|largo plazo (2+ años)"
}

REGLAS ESTRICTAS:
- Responde SOLO el JSON, sin texto adicional ni markdown
- SIEMPRE en español latinoamericano, prohibido usar inglés
- score 8-10 = comprar con confianza | 5-7 = esperar mejor entrada | 1-4 = evitar ahora
- Usa datos reales del activo, no inventes métricas
- Considera el perfil de riesgo del usuario para calibrar tu recomendación

ACTIVO A EVALUAR: ${ticker} (${marketData.name ?? ticker})
Precio actual: $${marketData.currentPrice?.toFixed(2) ?? 'N/D'} | Cambio hoy: ${chgStr}
PER actual: ${marketData.pe ? marketData.pe.toFixed(1) + 'x' : 'N/D'} | PER futuro: ${marketData.forwardPe ? marketData.forwardPe.toFixed(1) + 'x' : 'N/D'}
${rangeInfo}
Consenso analistas: ${marketData.analystRating ?? 'N/D'}

${portfolioSection}`;
}

// ── Portfolio analysis prompt ────────────────────────────
function buildPrompt(history: Session[], market: MarketItem[], positions: PositionItem[] = []): string {
  const last    = history.at(-1)!;
  const first   = history[0]!;
  const growth  = ((last.valor_total_usd - first.valor_total_usd) / first.valor_total_usd * 100).toFixed(1);
  const sessions = history.length;

  const recent = history.slice(-5).map(s =>
    `  ${s.fecha}: $${s.valor_total_usd.toFixed(2)} | ` +
    Object.entries(s.rendimientos)
      .filter(([,v]) => v !== null)
      .map(([k,v]) => `${k}: ${(v as number) >= 0 ? '+' : ''}${(v as number).toFixed(1)}%`)
      .join(', ')
  ).join('\n');

  const marketSummary = market
    .filter(m => !m.analystRating?.includes('error') && m.currentPrice)
    .map(m =>
      `  ${m.ticker} (${m.name?.split(' ')[0]}): $${m.currentPrice?.toFixed(2)} ` +
      `| Cambio: ${m.changePercent !== null ? (m.changePercent >= 0 ? '+' : '') + m.changePercent.toFixed(2) + '%' : 'N/D'} ` +
      `| PER: ${m.pe ? m.pe.toFixed(1) + 'x' : 'N/D'} ` +
      `| Analistas: ${m.analystRating || 'N/D'}`
    ).join('\n');

  const changes: { ticker: string; delta: number }[] = [];
  if (history.length >= 2) {
    const prev = history.at(-2)!;
    Object.keys(last.rendimientos).forEach(t => {
      const cur = last.rendimientos[t], p = prev.rendimientos[t];
      if (cur !== null && p !== null) changes.push({ ticker: t, delta: (cur as number) - (p as number) });
    });
  }
  const rising  = changes.filter(c => c.delta > 1).map(c => `${c.ticker} (+${c.delta.toFixed(1)}pp)`).join(', ');
  const falling = changes.filter(c => c.delta < -1).map(c => `${c.ticker} (${c.delta.toFixed(1)}pp)`).join(', ');

  return `Eres un asesor de inversiones senior experto en bolsa americana. Tu usuario es NUEVO en inversiones, puede asustarse con números en rojo y no entiende términos técnicos. Analiza el portafolio y responde EXCLUSIVAMENTE en JSON válido con esta estructura exacta:

{
  "insight": "string — 2-3 oraciones simples y tranquilizadoras sobre qué está pasando hoy",
  "recommendations": [
    {
      "type": "green|red|amber|blue|purple",
      "icon": "emoji",
      "title": "string corto y claro",
      "body": "string — explica en lenguaje simple qué está pasando y POR QUÉ, con números reales. Si hay rojo, normaliza: ¿es una caída temporal? ¿cuánto es normal en este activo?",
      "action": "string de máximo 10 palabras con el paso exacto a seguir ahora",
      "conf": número_entre_50_y_99
    }
  ],
  "pulse": [
    { "label": "string", "value": "string", "up": boolean, "desc": "string corta de contexto" }
  ]
}

REGLAS CRÍTICAS:
- Máximo 4 recommendations, mínimo 2. Máximo 4 pulse cards
- USA DATOS REALES: cada recommendation DEBE citar ticker exacto + porcentaje exacto del portafolio del usuario. Sin datos específicos = no incluir esa recomendación
- PROHIBIDO dar recomendaciones genéricas sobre "el mercado", "diversificación", o "el PER" sin relacionarlas con un activo concreto del usuario
- PROHIBIDO repetir que el usuario "investigue", "analice" o "aprenda" — TÚ eres el analista, da la respuesta directa
- "action" debe ser instrucción concreta de máximo 10 palabras: "No vendas, mantén al menos 30 días", "Espera — no hagas nada hoy", "Si baja de $X, considera comprar más"
- PROHIBIDO que "action" diga "Analiza el mercado", "Aprende más" o "Considera" — eso no ayuda al usuario
- Para type "red" o "amber": empieza tranquilizando con contexto real (ej: "Una caída de -9% en AMZN es normal — en 2022 cayó -55% y se recuperó")
- Si mencionas el PER, usa el número exacto del activo y explícalo con analogía simple
- Para features del app usa: "Abre '¿Está cara mi acción?'" o "Ve a Mis Activos"
- Lenguaje de amigo experto: sin jerga financiera sin explicar
- "conf" refleja certeza real según los datos disponibles
- Para "type": green=buena noticia, red=caída/alerta, amber=precaución, blue=tip con dato concreto, purple=insight del algoritmo
- NO incluyas texto fuera del JSON

DATOS DEL PORTAFOLIO:
- Sesiones registradas: ${sessions}
- Capital inicial: $${first.valor_total_usd.toFixed(2)} (${first.fecha})
- Capital actual: $${last.valor_total_usd.toFixed(2)} (${last.fecha})
- Crecimiento total: ${growth}%
${positions.length ? (() => {
  const total = positions.reduce((s, p) => s + p.costBasis, 0) || 1;
  const sorted = [...positions].sort((a, b) => b.costBasis - a.costBasis);
  return `\nDISTRIBUCIÓN REAL (costo base por activo):\n` + sorted.map(p =>
    `  ${p.ticker}: $${p.costBasis.toFixed(2)} (${(p.costBasis/total*100).toFixed(1)}% del portafolio) — ${p.shares.toFixed(4)} acc. @ avg $${p.avgPrice.toFixed(2)}`
  ).join('\n');
})() : ''}

ÚLTIMAS 5 SESIONES:
${recent}

${rising    ? `ACTIVOS SUBIENDO HOY: ${rising}` : ''}
${falling   ? `ACTIVOS BAJANDO HOY: ${falling}` : ''}

DATOS DE MERCADO EN TIEMPO REAL:
${marketSummary || '  (sin datos de mercado disponibles)'}`;
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

  const allowed = await checkRateLimit(user.id);
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Límite de análisis alcanzado (20/hora). Intenta más tarde.' }), {
      status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) {
    return new Response(JSON.stringify({ error: 'Servicio no configurado' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json() as Record<string, unknown>;

    // ── Suggest mode: recommend 2 tickers ─────────────────
    if (body.mode === 'suggest') {
      const portfolio = sanitizeSuggestPortfolio(body.portfolio);
      const prompt = buildSuggestPrompt(portfolio);
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'Eres un asesor de inversiones senior. Responde SOLO con el JSON solicitado, en español, sin texto adicional.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          max_tokens: 60,
          response_format: { type: 'json_object' },
        }),
      });
      if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}: ${await groqRes.text()}`);
      const groqJson = await groqRes.json();
      const content  = groqJson.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from Groq');
      return new Response(content, { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // ── Buy analysis mode ──────────────────────────────────
    if (body.mode === 'buy') {
      const rawTicker = String(body.ticker ?? '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 10);
      const marketData = body.marketData as MarketItem;

      if (!rawTicker || !marketData) {
        return new Response(JSON.stringify({ error: 'Missing ticker or marketData' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      const portfolio = sanitizeBuyPortfolio(body.portfolio);
      const prompt = buildBuyPrompt(rawTicker, marketData, portfolio);

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'Eres un asesor de inversiones senior. DEBES responder EXCLUSIVAMENTE en español latinoamericano. Está terminantemente prohibido usar inglés en cualquier parte de tu respuesta. Responde solo con el JSON solicitado, sin markdown ni texto adicional.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 600,
          response_format: { type: 'json_object' },
        }),
      });

      if (!groqRes.ok) {
        const err = await groqRes.text();
        throw new Error(`Groq ${groqRes.status}: ${err}`);
      }

      const groqJson = await groqRes.json();
      const content  = groqJson.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from Groq');

      const analysis = JSON.parse(content);
      return new Response(JSON.stringify(analysis), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── Advisor mode: free-form Q&A ────────────────────────
    if (body.mode === 'advisor') {
      const rawQ = body.question;
      if (typeof rawQ !== 'string' || !rawQ.trim()) {
        return new Response(JSON.stringify({ error: 'Pregunta no válida' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      const question = rawQ
        .slice(0, 400)
        .replace(/[<>{}\\]/g, '')
        .replace(/\b(ignore|forget|system:|pretend|jailbreak|bypass)\b/gi, '')
        .trim();

      const rawPositions = Array.isArray(body.positions)
        ? (body.positions as Record<string, unknown>[]).slice(0, 30).map(p => ({
            ticker:       String(p.ticker ?? '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 10),
            shares:       Math.max(0, Number(p.shares)    || 0),
            avgPrice:     Math.max(0, Number(p.avgPrice)  || 0),
            costBasis:    Math.max(0, Number(p.costBasis) || 0),
            currentPrice: typeof p.currentPrice === 'number' ? p.currentPrice : null,
            pnlUSD:       typeof p.pnlUSD === 'number' ? p.pnlUSD : null,
            pnlPct:       typeof p.pnlPct === 'number' ? p.pnlPct : null,
          }))
        : [];

      const rawPort = (body.portfolio ?? {}) as Record<string, unknown>;
      const portfolio = {
        totalInvested: Math.max(0, Number(rawPort.totalInvested) || 0),
        totalValue:    typeof rawPort.totalValue === 'number' ? rawPort.totalValue : null,
      };

      const rawHist = body.history as Record<string, unknown> | null;
      const histSummary = rawHist ? {
        sessions:   Math.max(0, Math.floor(Number(rawHist.sessions)   || 0)),
        firstValue: Math.max(0, Number(rawHist.firstValue) || 0),
        lastValue:  Math.max(0, Number(rawHist.lastValue)  || 0),
        growth:     String(rawHist.growth ?? '0').slice(0, 10).replace(/[^0-9.\-+]/g, ''),
      } : null;

      const pnl    = portfolio.totalValue != null ? portfolio.totalValue - portfolio.totalInvested : null;
      const pnlPct = pnl != null && portfolio.totalInvested > 0 ? (pnl / portfolio.totalInvested * 100).toFixed(1) : null;
      const posLines = rawPositions.length
        ? rawPositions.map(p => {
            const pnlStr = p.pnlUSD != null
              ? `P&L: ${p.pnlUSD >= 0 ? '+' : ''}$${p.pnlUSD.toFixed(2)} (${p.pnlPct != null ? (p.pnlPct >= 0 ? '+' : '') + p.pnlPct.toFixed(1) + '%' : 'N/D'})`
              : '(sin precio en vivo)';
            return `  ${p.ticker}: ${p.shares} acc. @ $${p.avgPrice} avg | ${p.currentPrice ? `$${p.currentPrice}` : 'N/D'} | ${pnlStr}`;
          }).join('\n')
        : '  (sin posiciones registradas)';
      const histStr = histSummary
        ? `${histSummary.sessions} sesiones. Desde $${histSummary.firstValue.toFixed(2)} → $${histSummary.lastValue.toFixed(2)} (${histSummary.growth}%)`
        : 'Sin historial.';

      const advisorPrompt = `Eres el asesor personal de inversiones de este usuario. Analiza su portafolio real y responde su pregunta directo, como amigo experto en finanzas.

POSICIONES:
${posLines}

TOTAL: invertido $${portfolio.totalInvested.toFixed(2)}${pnl != null ? ` | actual $${portfolio.totalValue?.toFixed(2)} | P&L ${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)} (${pnl >= 0 ? '+' : ''}${pnlPct}%)` : ''}
HISTORIAL: ${histStr}

PREGUNTA: ${question}

Responde SOLO en JSON: { "answer": "string" }
REGLAS: máx 200 palabras · español latinoamericano · usa datos reales · no digas "consulta un asesor" — tú eres el asesor · si faltan datos dilo brevemente`;

      const groqAdv = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'Eres un asesor de inversiones personal. Responde EXCLUSIVAMENTE en español latinoamericano. Responde SOLO con el JSON solicitado, sin markdown.' },
            { role: 'user', content: advisorPrompt },
          ],
          temperature: 0.5,
          max_tokens: 400,
          response_format: { type: 'json_object' },
        }),
      });
      if (!groqAdv.ok) throw new Error(`Groq ${groqAdv.status}: ${await groqAdv.text()}`);
      const advJson  = await groqAdv.json();
      const advContent = advJson.choices?.[0]?.message?.content;
      if (!advContent) throw new Error('Empty response from Groq');
      return new Response(advContent, { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // ── Portfolio analysis mode (original) ─────────────────
    const { history, market, positions } = body as { history: Session[]; market: MarketItem[]; positions: PositionItem[] };

    if (!history?.length) {
      return new Response(JSON.stringify({ error: 'No history provided' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const prompt = buildPrompt(history, market ?? [], positions ?? []);

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'Eres un asesor de inversiones senior. DEBES responder EXCLUSIVAMENTE en español latinoamericano. Está terminantemente prohibido usar inglés en cualquier parte de tu respuesta, incluyendo títulos, descripciones y valores. Responde solo con el JSON solicitado, en español.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      throw new Error(`Groq ${groqRes.status}: ${err}`);
    }

    const groqJson = await groqRes.json();
    const content  = groqJson.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Groq');

    const analysis = JSON.parse(content);

    return new Response(JSON.stringify(analysis), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

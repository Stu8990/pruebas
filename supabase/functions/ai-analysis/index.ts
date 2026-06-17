// Edge Function: ai-analysis
// Recibe historial del portafolio + datos de mercado
// Llama a Groq (llama-3.3-70b) y devuelve análisis estructurado en español

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

interface Session {
  fecha: string;
  valor_total_usd: number;
  rendimientos: Record<string, number | null>;
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

function buildPrompt(history: Session[], market: MarketItem[]): string {
  const last    = history.at(-1)!;
  const first   = history[0]!;
  const growth  = ((last.valor_total_usd - first.valor_total_usd) / first.valor_total_usd * 100).toFixed(1);
  const sessions = history.length;

  // Last 5 sessions summary
  const recent = history.slice(-5).map(s =>
    `  ${s.fecha}: $${s.valor_total_usd.toFixed(2)} | ` +
    Object.entries(s.rendimientos)
      .filter(([,v]) => v !== null)
      .map(([k,v]) => `${k}: ${(v as number) >= 0 ? '+' : ''}${(v as number).toFixed(1)}%`)
      .join(', ')
  ).join('\n');

  // Market snapshot
  const marketSummary = market
    .filter(m => !m.analystRating?.includes('error') && m.currentPrice)
    .map(m =>
      `  ${m.ticker} (${m.name?.split(' ')[0]}): $${m.currentPrice?.toFixed(2)} ` +
      `| Cambio: ${m.changePercent !== null ? (m.changePercent >= 0 ? '+' : '') + m.changePercent.toFixed(2) + '%' : 'N/D'} ` +
      `| PER: ${m.pe ? m.pe.toFixed(1) + 'x' : 'N/D'} ` +
      `| Analistas: ${m.analystRating || 'N/D'}`
    ).join('\n');

  // Detect trends
  const changes: { ticker: string; delta: number }[] = [];
  if (history.length >= 2) {
    const prev = history.at(-2)!;
    Object.keys(last.rendimientos).forEach(t => {
      const cur = last.rendimientos[t], p = prev.rendimientos[t];
      if (cur !== null && p !== null) changes.push({ ticker: t, delta: (cur as number) - (p as number) });
    });
  }
  const rising = changes.filter(c => c.delta > 1).map(c => `${c.ticker} (+${c.delta.toFixed(1)}pp)`).join(', ');
  const falling = changes.filter(c => c.delta < -1).map(c => `${c.ticker} (${c.delta.toFixed(1)}pp)`).join(', ');

  return `Eres un asesor de inversiones senior experto en bolsa americana. Analiza el portafolio del usuario y responde EXCLUSIVAMENTE en JSON válido con esta estructura exacta:

{
  "insight": "string — 2-3 oraciones claras sobre qué está pasando hoy en el portafolio",
  "recommendations": [
    {
      "type": "green|red|amber|blue|purple",
      "icon": "emoji",
      "title": "string corto",
      "body": "string — análisis concreto con números reales del portafolio",
      "conf": número_entre_50_y_99
    }
  ],
  "pulse": [
    { "label": "string", "value": "string", "up": boolean, "desc": "string" }
  ]
}

REGLAS:
- Máximo 4 recommendations, mínimo 2
- Máximo 4 pulse cards
- Usa los datos reales del portafolio, no inventes números
- Sé directo, práctico y en español
- "conf" refleja cuánta certeza tienes basado en datos disponibles
- Para "type": green=positivo, red=alerta, amber=neutral/precaución, blue=educativo, purple=insight profundo
- NO incluyas texto fuera del JSON

DATOS DEL PORTAFOLIO:
- Sesiones registradas: ${sessions}
- Capital inicial: $${first.valor_total_usd.toFixed(2)} (${first.fecha})
- Capital actual: $${last.valor_total_usd.toFixed(2)} (${last.fecha})
- Crecimiento total: ${growth}%

ÚLTIMAS 5 SESIONES:
${recent}

${rising    ? `ACTIVOS SUBIENDO HOY: ${rising}` : ''}
${falling   ? `ACTIVOS BAJANDO HOY: ${falling}` : ''}

DATOS DE MERCADO EN TIEMPO REAL:
${marketSummary || '  (sin datos de mercado disponibles)'}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!(await verifyAuth(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { history, market } = await req.json() as { history: Session[]; market: MarketItem[] };

    if (!history?.length) {
      return new Response(JSON.stringify({ error: 'No history provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = buildPrompt(history, market ?? []);

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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

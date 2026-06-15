// Edge Function: xtb-sync
// Conecta a la API WebSocket de XTB, lee posiciones y balance.
// Credenciales se leen de Supabase (nunca del cliente).
// Deploy: supabase functions deploy xtb-sync

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const XTB_WS = {
  real: 'wss://ws.xtb.com/real',
  demo: 'wss://ws.xtb.com/demo',
};

const TICKERS = ['VOO', 'AMZN', 'MSFT', 'MNST', 'NVDA', 'SCHD', 'VISA'];

interface XtbTrade {
  symbol: string;
  profit: number;
  open_price: number;
  volume: number;
  closed: boolean;
}

function cmd(command: string, args: Record<string, unknown> = {}) {
  return JSON.stringify({ command, arguments: args });
}

async function connectXtb(
  userId: string,
  password: string,
  demo: boolean
): Promise<{ balance: number; equity: number; trades: XtbTrade[] }> {
  const wsUrl = demo ? XTB_WS.demo : XTB_WS.real;
  const ws = new WebSocket(wsUrl);

  return new Promise((resolve, reject) => {
    let step = 'login';
    let balance = 0;
    let equity = 0;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('XTB timeout (15s). Verifica tus credenciales o conexión.'));
    }, 15_000);

    ws.onopen = () => ws.send(cmd('login', { userId, password }));

    ws.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string);

      if (step === 'login') {
        if (!msg.status) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error('Login XTB fallido. Verifica tu usuario y contraseña.'));
          return;
        }
        step = 'balance';
        ws.send(cmd('getBalance'));

      } else if (step === 'balance') {
        const d = msg.returnData ?? {};
        balance = d.balance ?? 0;
        equity  = d.equity  ?? d.balance ?? 0;
        step = 'trades';
        ws.send(cmd('getTrades', { openedOnly: true }));

      } else if (step === 'trades') {
        clearTimeout(timeout);
        ws.close();
        resolve({ balance, equity, trades: msg.returnData ?? [] });
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Error de conexión WebSocket con XTB.'));
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders });
    }

    // Verificar usuario via Supabase Auth
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: authError } =
      await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401, headers: corsHeaders });
    }

    // Leer credenciales XTB guardadas (nunca se exponen al cliente)
    const { data: creds, error: credsError } = await supabase
      .from('user_credentials')
      .select('xtb_user_id, xtb_password, xtb_demo')
      .eq('user_id', user.id)
      .single();

    if (credsError || !creds?.xtb_user_id) {
      return new Response(
        JSON.stringify({ error: 'No hay credenciales XTB configuradas. Agrégalas desde la app.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Conectar a XTB y obtener datos
    const { equity, trades } = await connectXtb(
      creds.xtb_user_id,
      creds.xtb_password,
      creds.xtb_demo ?? false
    );

    // Mapear trades de XTB a nuestro formato de rendimientos
    // XTB symbol: "NVDA.US_4" → base ticker: "NVDA"
    const rendimientos: Record<string, number | null> = {};
    TICKERS.forEach(t => { rendimientos[t] = null; });

    for (const trade of trades) {
      if (trade.closed) continue;
      const ticker = trade.symbol?.split('.')?.[0];
      if (!TICKERS.includes(ticker)) continue;
      if (!trade.open_price || !trade.volume) continue;

      // % de retorno = ganancia / capital invertido * 100
      const invested = Math.abs(trade.open_price * trade.volume);
      rendimientos[ticker] = invested > 0
        ? parseFloat(((trade.profit / invested) * 100).toFixed(2))
        : 0;
    }

    const today = new Date().toISOString().split('T')[0];

    return new Response(JSON.stringify({
      fecha:           today,
      valor_total_usd: parseFloat(equity.toFixed(2)),
      rendimientos,
      fuente:          'XTB_API',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

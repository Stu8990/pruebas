export const SUPA_URL  = 'https://fjufxwkhjgbkhqvpmryb.supabase.co';
export const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdWZ4d2toamdia2hxdnBtcnliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MjM3NTUsImV4cCI6MjA5NzA5OTc1NX0.ZM_mA6G9FWbhUv6bOwU4DwkMi4TVXAyPY2xYQ134_Gs';
export const EDGE_BASE = `${SUPA_URL}/functions/v1`;

export const ASSETS = ['VOO','AMZN','MSFT','MNST','NVDA','SCHD','VISA'];

export const ASSET_META = {
  VOO:  { full:'Vanguard S&P 500',  role:'Core mercado USA',     sector:'Core',    color:'#3b82f6' },
  AMZN: { full:'Amazon',            role:'Tecnología / cloud',   sector:'Tech',    color:'#6366f1' },
  MSFT: { full:'Microsoft',         role:'Tecnología calidad',   sector:'Tech',    color:'#8b5cf6' },
  MNST: { full:'Monster Beverage',  role:'Consumo defensivo',    sector:'Defense', color:'#10b981' },
  NVDA: { full:'NVIDIA',            role:'Semiconductores / IA', sector:'Tech',    color:'#f59e0b' },
  SCHD: { full:'Schwab Dividend',   role:'Dividendos / valor',   sector:'Defense', color:'#14b8a6' },
  VISA: { full:'Visa Inc.',         role:'Pagos globales',       sector:'Quality', color:'#ef4444', yfTicker:'V' },
};

export const SECTOR_COLORS = { Core:'#3b82f6', Tech:'#8b5cf6', Defense:'#10b981', Quality:'#ef4444' };
export const BK = 'investsmart-banner-v1';

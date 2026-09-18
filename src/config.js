export const SUPA_URL  = 'https://fjufxwkhjgbkhqvpmryb.supabase.co';
export const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdWZ4d2toamdia2hxdnBtcnliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MjM3NTUsImV4cCI6MjA5NzA5OTc1NX0.ZM_mA6G9FWbhUv6bOwU4DwkMi4TVXAyPY2xYQ134_Gs';
export const EDGE_BASE = `${SUPA_URL}/functions/v1`;

// Nombres legibles de activos habituales. Para el resto se usa el nombre que
// devuelve Yahoo. yfTicker: símbolo en Yahoo cuando difiere del que se guarda
// (Visa se guardaba como VISA, pero en Yahoo es V).
export const ASSET_META = {
  VOO:  { full: 'Vanguard S&P 500' },
  AMZN: { full: 'Amazon' },
  MSFT: { full: 'Microsoft' },
  MNST: { full: 'Monster Beverage' },
  NVDA: { full: 'NVIDIA' },
  SCHD: { full: 'Schwab Dividend' },
  VISA: { full: 'Visa', yfTicker: 'V' },
  V:    { full: 'Visa' },
  GOOGL:{ full: 'Alphabet (Google)' },
  AAPL: { full: 'Apple' },
  META: { full: 'Meta' },
  TSLA: { full: 'Tesla' },
  QQQ:  { full: 'Nasdaq 100 (QQQ)' },
  SPY:  { full: 'S&P 500 (SPY)' },
};

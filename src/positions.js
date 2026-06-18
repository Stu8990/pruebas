import { db } from './auth.js';

const POS_KEY = 'investsmart-positions';

// null = not yet loaded from Supabase; prevents stale localStorage leaking to wrong user
let _positions = null;

export function getPositions() {
  return _positions ?? {};
}

export function hasPositions() {
  // Returns false until loadPositions() completes — safe default for new/different users
  if (_positions === null) return false;
  return Object.keys(_positions).length > 0;
}

function _saveLocal(pos) {
  localStorage.setItem(POS_KEY, JSON.stringify(pos));
}

async function _syncToCloud(pos) {
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;
    await db.from('user_positions').upsert(
      { user_id: user.id, data: pos, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  } catch { /* silent — localStorage already saved */ }
}

export async function loadPositions() {
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) { _positions = {}; return; }
    const { data, error } = await db.from('user_positions').select('data').eq('user_id', user.id).single();
    if (!error && data?.data) {
      _positions = data.data;
      _saveLocal(data.data);
    } else if (error?.code === 'PGRST116') {
      // Supabase confirmed: no positions for this user — clear stale cache
      _positions = {};
      localStorage.removeItem(POS_KEY);
    } else {
      // Network error — fall back to localStorage cache
      try { _positions = JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch { _positions = {}; }
    }
  } catch {
    try { _positions = JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch { _positions = {}; }
  }
}

export async function addPurchase(ticker, date, shares, price) {
  if (_positions === null) _positions = {};
  if (!_positions[ticker]) _positions[ticker] = { purchases: [] };
  _positions[ticker].purchases.push({ date, shares: +shares, price: +price });
  _saveLocal(_positions);
  await _syncToCloud(_positions);
}

export async function removePurchase(ticker, idx) {
  if (!_positions?.[ticker]) return;
  _positions[ticker].purchases.splice(idx, 1);
  if (!_positions[ticker].purchases.length) delete _positions[ticker];
  _saveLocal(_positions);
  await _syncToCloud(_positions);
}

export function getAvgPrice(ticker) {
  const p = (_positions ?? {})[ticker];
  if (!p?.purchases?.length) return null;
  const totalShares = p.purchases.reduce((s, x) => s + x.shares, 0);
  const totalCost   = p.purchases.reduce((s, x) => s + x.shares * x.price, 0);
  return totalShares > 0 ? totalCost / totalShares : null;
}

export function getTotalShares(ticker) {
  const p = (_positions ?? {})[ticker];
  if (!p?.purchases?.length) return 0;
  return p.purchases.reduce((s, x) => s + x.shares, 0);
}

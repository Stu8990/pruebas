import { db } from './auth.js';

const POS_KEY = 'investsmart-positions';

export function getPositions() {
  try { return JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch { return {}; }
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
    if (!user) return;
    const { data, error } = await db.from('user_positions').select('data').eq('user_id', user.id).single();
    if (!error && data?.data) {
      _saveLocal(data.data);
    } else if (error?.code === 'PGRST116') {
      // Supabase confirmed no positions for this user — clear stale cache from a previous user
      localStorage.removeItem(POS_KEY);
    }
  } catch { /* fallback to localStorage — don't clear on network errors */ }
}

export async function addPurchase(ticker, date, shares, price) {
  const pos = getPositions();
  if (!pos[ticker]) pos[ticker] = { purchases: [] };
  pos[ticker].purchases.push({ date, shares: +shares, price: +price });
  _saveLocal(pos);
  await _syncToCloud(pos);
}

export async function removePurchase(ticker, idx) {
  const pos = getPositions();
  if (!pos[ticker]) return;
  pos[ticker].purchases.splice(idx, 1);
  if (!pos[ticker].purchases.length) delete pos[ticker];
  _saveLocal(pos);
  await _syncToCloud(pos);
}

export function getAvgPrice(ticker) {
  const p = getPositions()[ticker];
  if (!p?.purchases?.length) return null;
  const totalShares = p.purchases.reduce((s, x) => s + x.shares, 0);
  const totalCost   = p.purchases.reduce((s, x) => s + x.shares * x.price, 0);
  return totalShares > 0 ? totalCost / totalShares : null;
}

export function getTotalShares(ticker) {
  const p = getPositions()[ticker];
  if (!p?.purchases?.length) return 0;
  return p.purchases.reduce((s, x) => s + x.shares, 0);
}

export function hasPositions() {
  return Object.keys(getPositions()).length > 0;
}


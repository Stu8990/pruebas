import { ASSETS, ASSET_META } from './config.js';

const KEY = 'investsmart-custom-assets';
const PALETTE = ['#0ea5e9','#84cc16','#f43f5e','#06b6d4','#a855f7','#ec4899','#f97316','#78716c'];

export function getCustomAssets() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function saveCustomAssets(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function getAllAssets() {
  return [
    ...ASSETS.map(t => ({ ticker: t, full: ASSET_META[t].full, role: ASSET_META[t].role, color: ASSET_META[t].color, isCustom: false })),
    ...getCustomAssets().map(c => ({ ...c, isCustom: true })),
  ];
}

export function addCustomAsset(ticker, full) {
  const existing = getCustomAssets();
  if (existing.find(a => a.ticker === ticker) || ASSETS.includes(ticker)) return false;
  const color = PALETTE[existing.length % PALETTE.length];
  saveCustomAssets([...existing, { ticker, full, role: 'Personalizado', color, sector: 'Custom' }]);
  return true;
}

export function removeCustomAsset(ticker) {
  saveCustomAssets(getCustomAssets().filter(a => a.ticker !== ticker));
}

export function allTickers() {
  return getAllAssets().map(a => a.ticker);
}

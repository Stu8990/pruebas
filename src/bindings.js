// Central registry — conecta exports de módulos con handlers inline del HTML.
// Sin lógica de aplicación: solo asignaciones a window.

import {
  goTo, toggleSidebar, closeSidebar, toggleExplain,
  checkBanner, dismissBanner, refreshData, onRecordChange, checkMenuBtn,
  openAddAsset, confirmAddAsset, removeCustomAsset, refreshAi, refreshLiveValue, syncLiveNow,
  toggleAddPosition, savePosition, removePurchaseEntry, calcPosShares, clearPosMonto,
} from './app.js';

import {
  loginWithPassword, toggleAuthPwd, showForgot, backToLogin,
  showSignup, signUp, toggleSignupPwd, sendReset,
  showChangePwd, closePwdModal, changePassword, signOut,
} from './auth.js';

import { analyzeBuy, clearBuySlot, refreshBuyRecommendations } from './buy.js';
import { evaluateAllPer, analyzeTickerPer } from './per.js';
import { fetchMarketData } from './prices.js';
import { quickRecord, applyQuickRecord, clearSavedCash, autoDesc } from './record.js';

Object.assign(window, {
  // Navegación
  goTo, toggleSidebar, closeSidebar, toggleExplain,
  checkBanner, dismissBanner, refreshData, onRecordChange, checkMenuBtn, refreshLiveValue, syncLiveNow,
  // Registro rápido y cash
  quickRecord, applyQuickRecord, clearSavedCash, autoDesc,
  // Posiciones
  toggleAddPosition, savePosition, removePurchaseEntry, calcPosShares, clearPosMonto,
  // Activos personalizados
  openAddAsset, confirmAddAsset, removeCustomAsset,
  // IA y análisis
  refreshAi, analyzeBuy, clearBuySlot, refreshBuyRecommendations,
  // PER
  evaluateAllPer, analyzeTickerPer,
  // Precios de mercado
  fetchMarketData,
  // Auth
  loginWithPassword, toggleAuthPwd, showForgot, backToLogin,
  showSignup, signUp, toggleSignupPwd, sendReset,
  showChangePwd, closePwdModal, changePassword, signOut,
});

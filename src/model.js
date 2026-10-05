// Todo lo que las vistas necesitan, calculado una vez a partir del estado.

import { state, todayStr } from './data.js';
import { summarize, monthAttribution } from './core/portfolio.js';
import { enginePlan, planStatus, planVerdicts, vsIndex } from './core/plan.js';

export function model() {
  const summary = summarize({ positions: state.positions, market: state.market, cash: state.cash });
  const today = todayStr();
  const month = monthAttribution({ positions: state.positions, market: state.market, history: state.history, today });
  // Sin plan guardado no hay consejos de compra/venta: la app pide crearlo.
  const plan = enginePlan(state.plan, state.market);
  return {
    summary, month, today, plan,
    status: plan ? planStatus({ summary, plan, today }) : null,
    verdicts: plan ? planVerdicts({ summary, plan, today }) : {},
    vsIndex: plan ? vsIndex({ summary, plan }) : null,
    hasPositions: Object.keys(state.positions).length > 0,
    hasHistory: state.history.length > 0,
    pricesReady: state.status.market === 'ok' || Object.keys(state.market).length > 0,
  };
}

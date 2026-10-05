// Todo lo que las vistas necesitan, calculado una vez a partir del estado.

import { state, todayStr } from './data.js';
import { summarize, monthAttribution } from './core/portfolio.js';
import { DEFAULT_PLAN, planStatus, planVerdicts, vsIndex } from './core/plan.js';

export function model() {
  const summary = summarize({ positions: state.positions, market: state.market, cash: state.cash });
  const today = todayStr();
  const month = monthAttribution({ positions: state.positions, market: state.market, history: state.history, today });
  const plan = DEFAULT_PLAN;
  return {
    summary, month, today, plan,
    status: planStatus({ summary, plan, today }),
    verdicts: planVerdicts({ summary, plan, today }),
    vsIndex: vsIndex({ summary, plan }),
    hasPositions: Object.keys(state.positions).length > 0,
    hasHistory: state.history.length > 0,
    pricesReady: state.status.market === 'ok' || Object.keys(state.market).length > 0,
  };
}

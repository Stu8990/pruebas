// Todo lo que las vistas necesitan, calculado una vez a partir del estado.

import { state, todayStr } from './data.js';
import { summarize, monthAttribution } from './core/portfolio.js';
import { verdicts, todayActions } from './core/advice.js';

export function model() {
  const summary = summarize({ positions: state.positions, market: state.market, cash: state.cash });
  const today = todayStr();
  const month = monthAttribution({ positions: state.positions, market: state.market, history: state.history, today });
  const args = { summary, market: state.market, profile: state.profile };
  return {
    summary, month, today,
    verdicts: verdicts(args),
    actions: todayActions(args),
    hasPositions: Object.keys(state.positions).length > 0,
    hasHistory: state.history.length > 0,
    pricesReady: state.status.market === 'ok' || Object.keys(state.market).length > 0,
  };
}

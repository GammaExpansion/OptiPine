import { metricValue } from '@pine/optimizer';
import { syntheticBars } from '../src/charts-dev/synthetic.ts';
import { getBacktestStore, openScript } from '../src/state/backtest.ts';
import { getMarketDataStore } from '../src/state/marketData.ts';
import { getSelectionStore } from '../src/state/selection.ts';

/**
 * Test-only entry points for the Backtest page's flows: a script and a synthetic dataset are
 * installed through the same store actions the UI uses, so no test reaches the network.
 */
export const backtestHooks = {
  openScript,
  /** Deterministic hourly BTCUSDT-like bars ending 2025-05-04 23:00 UTC. */
  useSyntheticData(count = 2_000) {
    getMarketDataStore()
      .getState()
      .actions.useCsv(
        {
          bars: syntheticBars(count),
          timeframe: '60',
          syminfo: {
            ticker: 'BTCUSDT',
            type: 'crypto',
            mintick: 0.01,
            mincontract: 0.001,
            pointvalue: 1,
            currency: 'USD',
            timezone: 'Etc/UTC',
          },
        },
        'synthetic.csv',
      );
  },
  backtest: () => getBacktestStore().getState(),
  /** The current result's net profit, or null without one. */
  netProfit() {
    const result = getBacktestStore().getState().result;
    return result && metricValue(result.output.metrics, 'Net profit');
  },
  selection: () => getSelectionStore().getState(),
};

export type BacktestHooks = typeof backtestHooks;

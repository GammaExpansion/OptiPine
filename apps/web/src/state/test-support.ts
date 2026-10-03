import type { FeedDataset } from '@pine/market-data';
import {
  LocalAnalysisWorker,
  LocalEngineWorker,
  syntheticBars,
} from '../workflows/test-support.ts';
import { createServices, type ServiceOptions } from './services.ts';

export const testNow = Date.UTC(2026, 9, 3, 14, 37);
export const testInput = {
  bars: syntheticBars(120, Date.UTC(2026, 8, 1) / 1000),
  timeframe: '60',
  syminfo: { ticker: 'BTCUSDT', type: 'crypto', mintick: 0.01, timezone: 'Etc/UTC' },
};
export const testDataset: FeedDataset = {
  input: testInput,
  fetchedAt: testNow,
  profileEstimated: false,
};

export function fakeServices(options: ServiceOptions = {}) {
  return createServices({
    engineWorker: () => new LocalEngineWorker(),
    analysisWorker: () => new LocalAnalysisWorker(),
    fetcher: async () => Response.json(testDataset),
    cache: { get: async () => undefined, put: async () => {} },
    hardwareConcurrency: 4,
    now: () => testNow,
    ...options,
  });
}

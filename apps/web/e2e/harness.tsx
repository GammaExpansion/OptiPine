import { createRoot } from 'react-dom/client';
import { AnalysisWorkerClient, EngineWorkerClient, OptimizationWorkerPool } from '@pine/workers';
import type { RunInput } from '@pine/engine';
import { generateSearchSpace } from '@pine/optimizer';
import { I18nProvider } from '../src/i18n/I18nProvider.tsx';
import { Shell } from '../src/shell/Shell.tsx';
import { createAnalysisWorker, createEngineWorker } from '../src/workers/factories.ts';
import '../src/styles/base.css';
import { backtestHooks } from './backtest-hooks.ts';
import { optimizeHooks } from './optimize-hooks.ts';

createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <Shell canOptimize />
  </I18nProvider>,
);

const source = `//@version=6
strategy("Worker smoke", initial_capital=10000)
quantity = input.int(1, "Quantity", minval=1, maxval=2)
if bar_index % 2 == 0
    strategy.entry("L", strategy.long, qty=quantity)
else
    strategy.close("L")
plot(close)`;
const input: RunInput = {
  bars: Array.from({ length: 8 }, (_, index) => ({
    time: 1704067200 + index * 3600,
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 10,
  })),
  syminfo: { type: 'crypto', timezone: 'Etc/UTC', mintick: 0.01, pointvalue: 1 },
  timeframe: '60',
};

async function checkWorkers() {
  const client = new EngineWorkerClient(createEngineWorker);
  const analysis = new AnalysisWorkerClient(createAnalysisWorker);
  const pool = new OptimizationWorkerPool(createEngineWorker);
  try {
    const description = await client.describe(source);
    const result = await client.run(source, input);
    const space = generateSearchSpace(description.inputs, {
      ranges: { Quantity: { from: 1, to: 2, step: 1 } },
    });
    const parameters = await analysis.request('parameters', {
      space,
      method: 'grid',
      count: 2,
      seed: 42,
      limit: 10,
    });
    const optimization = await pool.optimize(
      source,
      input,
      parameters.map((inputs) => ({ inputs })),
      { workerCount: 1 },
    );
    return { description, result, parameters, optimization };
  } finally {
    client.dispose();
    analysis.dispose();
    pool.dispose();
  }
}

// Test-only entry: this promise never exists in the normal app or its production output.
Object.assign(window, { workerCheck: checkWorkers(), backtestHooks, optimizeHooks });

import {
  AnalysisWorkerClient,
  OptimizationWorkerPool,
  type AnalysisWorkerFactory,
  type EngineWorkerFactory,
} from '@pine/workers';
import { createAnalysisWorker, createEngineWorker } from '../workers/factories.ts';
import type { BacktestSession } from '../workflows/backtest.ts';
import { OptimizationSession } from '../workflows/optimize-session.ts';

/**
 * The optimization side of the services: the session over the Backtest page, the Worker pool and
 * the analysis client. `services.ts` imports this module on first need, so the Backtest page's
 * first screen loads none of it.
 */
export function createOptimizationServices(
  backtest: BacktestSession,
  options: {
    engineWorker?: EngineWorkerFactory;
    analysisWorker?: AnalysisWorkerFactory;
    threads: number;
    now: () => number;
  },
) {
  const pool = new OptimizationWorkerPool(options.engineWorker ?? createEngineWorker);
  const analysis = new AnalysisWorkerClient(options.analysisWorker ?? createAnalysisWorker);
  const session = new OptimizationSession(backtest, pool, analysis, {
    threads: options.threads,
    now: options.now,
  });
  return {
    session,
    pool,
    analysis,
    dispose() {
      session.dispose();
      pool.dispose();
      analysis.dispose();
    },
  };
}

export type OptimizationServices = ReturnType<typeof createOptimizationServices>;

import type { AnalysisWorkerFactory, EngineWorkerFactory } from '@pine/workers';

/** Shared by EngineWorkerClient and OptimizationWorkerPool; each call owns a fresh Worker. */
export const createEngineWorker: EngineWorkerFactory = () =>
  new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });

export const createAnalysisWorker: AnalysisWorkerFactory = () =>
  new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });

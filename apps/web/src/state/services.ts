import { FeedClient, type FeedCache } from '@pine/market-data';
import {
  AnalysisWorkerClient,
  EngineWorkerClient,
  OptimizationWorkerPool,
  availableWorkerCount,
  type AnalysisWorkerFactory,
  type EngineWorkerFactory,
} from '@pine/workers';
import { createAnalysisWorker, createEngineWorker } from '../workers/factories.ts';
import { BacktestSession, type EngineClient } from '../workflows/backtest.ts';
import { MarketDataController } from '../workflows/market-data.ts';
import { OptimizationSession } from '../workflows/optimize-session.ts';

export interface ServiceOptions {
  engineWorker?: EngineWorkerFactory;
  analysisWorker?: AnalysisWorkerFactory;
  fetcher?: typeof fetch;
  cache?: FeedCache;
  hardwareConcurrency?: number;
  now?: () => number;
}

/** One owner for Workers, requests and subscriptions; tests inject transports at this boundary. */
export function createServices(options: ServiceOptions = {}) {
  const now = options.now ?? Date.now;
  const threads = availableWorkerCount(
    options.hardwareConcurrency ?? globalThis.navigator?.hardwareConcurrency,
  );
  let engine: EngineWorkerClient | undefined;
  const getEngine = () =>
    (engine ??= new EngineWorkerClient(options.engineWorker ?? createEngineWorker));
  // EngineWorkerClient starts a Worker in its constructor. Reading the empty workspace must not.
  const lazyEngine: EngineClient = {
    get sourceRevision() {
      return engine?.sourceRevision ?? 0;
    },
    setSourceRevision: (revision) => getEngine().setSourceRevision(revision),
    describe: (source, revision) => getEngine().describe(source, revision),
    run: (source, input, revision) => getEngine().run(source, input, revision),
    cancel: () => engine?.cancel(),
  };
  const pool = new OptimizationWorkerPool(options.engineWorker ?? createEngineWorker);
  const analysis = new AnalysisWorkerClient(options.analysisWorker ?? createAnalysisWorker);
  const feed = new FeedClient(options.fetcher, options.cache);
  const backtest = new BacktestSession(lazyEngine, { now });
  const marketData = new MarketDataController(feed, { now });
  const optimization = new OptimizationSession(backtest, pool, analysis, { threads, now });
  const cleanups = new Set<() => void>();
  let disposed = false;
  return {
    get engine() {
      return getEngine();
    },
    pool,
    analysis,
    feed,
    threads,
    now,
    backtest,
    marketData,
    optimization,
    onDispose(cleanup: () => void) {
      cleanups.add(cleanup);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
      optimization.dispose();
      backtest.cancel();
      marketData.cancel();
      engine?.dispose();
      pool.dispose();
      analysis.dispose();
    },
  };
}

export type AppServices = ReturnType<typeof createServices>;
let factory: () => AppServices = createServices;
let current: AppServices | undefined;

/** Importing stores or mounting the lifecycle listener never starts a Worker or a fetch. */
export function getServices(): AppServices {
  return (current ??= factory());
}

export function disposeServices(): void {
  current?.dispose();
  current = undefined;
}

/** Replace before mounting subscribers; releasing the override also disposes the test services. */
export function replaceServices(next: () => AppServices): () => void {
  disposeServices();
  const previous = factory;
  factory = next;
  return () => {
    disposeServices();
    factory = previous;
  };
}

/** Preserve a page held in the back/forward cache; dispose when it actually leaves memory. */
export function installServiceLifecycle(target: Window = window): () => void {
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) disposeServices();
  };
  target.addEventListener('pagehide', onPageHide);
  return () => target.removeEventListener('pagehide', onPageHide);
}

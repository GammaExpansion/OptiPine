import { FeedClient, type FeedCache } from '@pine/market-data';
import {
  EngineRunClient,
  availableWorkerCount,
  type AnalysisWorkerFactory,
  type EngineWorkerFactory,
} from '@pine/workers';
import { createEngineWorker } from '../workers/factories.ts';
import { BacktestSession, type EngineClient } from '../workflows/backtest.ts';
import { MarketDataController } from '../workflows/market-data.ts';
import type { OptimizationServices } from './optimization-services.ts';
import { DemoFeedClient } from '../demo-feed-client.ts';

export interface ServiceOptions {
  engineWorker?: EngineWorkerFactory;
  analysisWorker?: AnalysisWorkerFactory;
  fetcher?: typeof fetch;
  cache?: FeedCache;
  hardwareConcurrency?: number;
  now?: () => number;
}

/**
 * One owner for Workers, requests and subscriptions; tests inject transports at this boundary.
 * The optimization side (its session, pool and analysis client, and the workflow modules behind
 * them) is created on first need by `loadOptimization`, so the first screen does not load it.
 */
export function createServices(options: ServiceOptions = {}) {
  const now = options.now ?? Date.now;
  const threads = availableWorkerCount(
    options.hardwareConcurrency ?? globalThis.navigator?.hardwareConcurrency,
  );
  let engine: EngineRunClient | undefined;
  const getEngine = () =>
    (engine ??= new EngineRunClient(options.engineWorker ?? createEngineWorker));
  // EngineRunClient starts a Worker in its constructor. Reading the empty workspace must not.
  const lazyEngine: EngineClient = {
    get sourceRevision() {
      return engine?.sourceRevision ?? 0;
    },
    setSourceRevision: (revision) => getEngine().setSourceRevision(revision),
    describe: (source, revision) => getEngine().describe(source, revision),
    run: (source, input, revision) => getEngine().run(source, input, revision),
    cancel: () => engine?.cancel(),
  };
  // The literal build-time condition removes this import from normal bundles entirely.
  const feed =
    import.meta.env.VITE_DEMO === '1'
      ? new DemoFeedClient(async (path, signal) => {
          const { demoResponse } = await import('../demo-market.ts');
          return demoResponse(path, signal, options.fetcher ?? fetch);
        }, options.cache)
      : new FeedClient(options.fetcher, options.cache);
  const backtest = new BacktestSession(lazyEngine, { now });
  const marketData = new MarketDataController(feed, { now });
  let optimization: OptimizationServices | null = null;
  let loading: Promise<OptimizationServices> | null = null;
  const loadListeners = new Set<(optimization: OptimizationServices) => void>();
  const cleanups = new Set<() => void>();
  let disposed = false;
  return {
    get engine() {
      return getEngine();
    },
    feed,
    threads,
    now,
    backtest,
    marketData,
    /** The optimization side once `loadOptimization` has created it; null before. */
    get optimization(): OptimizationServices | null {
      return optimization;
    },
    /** Load the optimization side's modules and create it, once; later calls share it. */
    loadOptimization(): Promise<OptimizationServices> {
      loading ??= import('./optimization-services.ts').then(({ createOptimizationServices }) => {
        const created = createOptimizationServices(backtest, {
          engineWorker: options.engineWorker,
          analysisWorker: options.analysisWorker,
          threads,
          now,
        });
        // Services disposed while the modules loaded hand out a side that is disposed too.
        if (disposed) created.dispose();
        else {
          optimization = created;
          for (const listener of loadListeners) listener(created);
          loadListeners.clear();
        }
        return created;
      });
      return loading;
    },
    /** Call `listener` once the optimization side exists, at once if it does already. */
    onOptimization(listener: (optimization: OptimizationServices) => void): () => void {
      if (optimization) listener(optimization);
      else loadListeners.add(listener);
      return () => loadListeners.delete(listener);
    },
    onDispose(cleanup: () => void) {
      cleanups.add(cleanup);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
      loadListeners.clear();
      optimization?.dispose();
      backtest.cancel();
      marketData.cancel();
      engine?.dispose();
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

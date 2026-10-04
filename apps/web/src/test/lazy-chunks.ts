import { beforeAll } from 'vitest';

/**
 * The app's lazily loaded chunks by area. React.lazy loads a chunk on its first render, and while
 * other suites share the CPU, transforming and evaluating it can take seconds inside a test's own
 * waits. Loaded beforehand, the chunk is in the module cache and lazy() resolves at once.
 */
const chunks = {
  dialogs: () => [
    import('../dialogs/script/ScriptDialog.tsx'),
    import('../dialogs/script/ReplaceScriptDialog.tsx'),
    import('../dialogs/script/FileErrorDialog.tsx'),
    import('../dialogs/script/ScriptMenuContent.tsx'),
    import('../dialogs/marketData/MarketDataDialog.tsx'),
    import('../dialogs/dateRange/DateRangeDialog.tsx'),
    import('../dialogs/properties/PropertiesDialog.tsx'),
  ],
  optimize: () => [
    import('../pages/optimize/OptimizePage.tsx'),
    import('../pages/optimize/leaderboard/FailedCombinationsDialog.tsx'),
    import('../state/optimization-services.ts'),
  ],
};

/**
 * Load the chunks of `areas` before the file's tests run. A file that mocks one of these modules
 * with a factory that waits must not preload its area.
 */
export function preloadChunks(...areas: (keyof typeof chunks)[]): void {
  beforeAll(async () => {
    await Promise.all(areas.flatMap((area): Promise<unknown>[] => chunks[area]()));
  }, 60_000);
}

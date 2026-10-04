import { expect, type Page, type TestInfo } from '@playwright/test';

export const workerWaitTimeout = 60_000;

/** The Top 20 curves' state and the session's diagnostics, or `loaded: false` before Optimize. */
function topEquityState(page: Page) {
  return page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const [{ getServices }, { getOptimizationStore }] = await Promise.all([
      load('/src/state/services.ts'),
      load('/src/state/optimization.ts'),
    ]);
    // The optimization side loads when Optimize first opens.
    const optimization = getServices().optimization;
    if (!optimization) return { loaded: false };
    const state = getOptimizationStore().getState();
    const diagnostics = optimization.session.getDiagnostics();
    return {
      loaded: true,
      ...diagnostics,
      topEquity: {
        ...diagnostics.topEquity,
        resultsId: state.topEquity.resultsId,
        curveCount: state.topEquity.curves.length,
      },
      viewsPending: state.views?.pending ?? null,
    };
  });
}

/** Wait for the Top 20 curves and retain enough session state to diagnose a slow request. */
export async function waitForTopEquity(page: Page, testInfo: TestInfo): Promise<void> {
  try {
    // GitHub runners are several times slower than a dev machine; a 2-thread pool reproduces 20 sets serially.
    await expect
      .poll(() => topEquityState(page), { timeout: workerWaitTimeout })
      .toMatchObject({ topEquity: { status: 'ready' } });
  } catch (error) {
    let dump: unknown;
    try {
      dump = await topEquityState(page);
    } catch (diagnosticError) {
      dump = { error: String(diagnosticError) };
    }
    await testInfo.attach('top-equity-state.json', {
      body: JSON.stringify(dump, null, 2),
      contentType: 'application/json',
    });
    throw error;
  }
}

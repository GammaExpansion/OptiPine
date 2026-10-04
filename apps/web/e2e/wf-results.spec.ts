import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { BacktestHooks } from './backtest-hooks.ts';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import type { installResultsFixture } from '../src/pages/optimize/walkforward/results/fixture-store.ts';
import type { ResultsScenario } from '../src/pages/optimize/walkforward/results/fixture.ts';

import { origins } from './ports.ts';

test.use({ baseURL: origins.dev });
type Hooks = Window & {
  backtestHooks: BacktestHooks;
  wfState: () => OptimizationStoreState;
  wfResults: ReturnType<typeof installResultsFixture>;
  wfScenario: (scenario: ResultsScenario) => void;
};
const source = readFileSync(new URL('../examples/trend-breakout.pine', import.meta.url), 'utf8');

async function open(page: Page, language: 'en' | 'zh') {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' || url.pathname.startsWith('/api/market')) {
      errors.push(`Unexpected network: ${url.pathname}`);
      await route.abort();
    } else await route.continue();
  });
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
  await page.addInitScript(
    (language) =>
      localStorage.setItem('optipine.ui', JSON.stringify({ state: { language }, version: 1 })),
    language,
  );
  await page.goto('/e2e/harness.html');
  await page.waitForFunction(() => 'backtestHooks' in window);
  await page.evaluate((source) => {
    const hooks = window as unknown as Hooks;
    hooks.backtestHooks.openScript({
      source,
      fileName: 'trend_breakout.pine',
      origin: { kind: 'file' },
    });
    hooks.backtestHooks.useSyntheticData(20496);
  }, source);
  await page.waitForFunction(
    () => (window as unknown as Hooks).backtestHooks.backtest().compile.status === 'compiled',
  );
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { getServices } = await load('/src/state/services.ts');
    await getServices().loadOptimization();
    const { getOptimizationStore } = await load('/src/state/optimization.ts');
    const { uiStore } = await load('/src/state/ui.ts');
    const { installResultsFixture } = await load(
      '/src/pages/optimize/walkforward/results/fixture-store.ts',
    );
    const { resultsFixture } = await load('/src/pages/optimize/walkforward/results/fixture.ts');
    const hooks = window as unknown as Hooks;
    hooks.wfResults = installResultsFixture();
    hooks.wfState = () => getOptimizationStore().getState();
    hooks.wfScenario = (scenario) => hooks.wfResults.publish(resultsFixture(scenario));
    const store = getOptimizationStore();
    // Mount the fixture in the real results slots without starting the Worker pool.
    store.setState({
      validation: { ...store.getState().validation, mode: 'walk-forward' },
      run: {
        status: 'running',
        startedAt: Date.now(),
        progress: {
          phase: 'analyzing',
          combinations: 684,
          completed: 4104,
          total: 4104,
          failed: 0,
          elapsedMs: 0,
          remainingMs: null,
          workers: 4,
        },
      },
    });
    uiStore.getState().setPage('optimize');
  });
  await expect(page.getByTestId('wf-equity')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

async function pixels(page: Page) {
  return page.getByTestId('wf-equity').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
    return hash >>> 0;
  });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page.locator('[data-results]').evaluate((root) =>
      [...root.querySelectorAll('button, td, th, p, dl, h2')]
        .filter((element) => {
          const html = element as HTMLElement;
          return (
            html.clientWidth > 0 &&
            (html.scrollWidth > html.clientWidth + 1 || html.scrollHeight > html.clientHeight + 1)
          );
        })
        .map((element) => element.textContent),
    ),
  ).toEqual([]);
}

for (const language of ['en', 'zh'] as const) {
  test(`W1/W2/W4/W5 fixture results, actions and layout (${language})`, async ({ page }, info) => {
    const errors = await open(page, language);
    const english = language === 'en';
    const summary = page.getByRole('region', {
      name: english ? 'Stitched OOS equity' : '拼接样本外权益',
      exact: true,
    });
    const table = page.getByRole('region', {
      name: english ? 'Walk-forward window results' : '滚动前推窗口结果',
      exact: true,
    });
    const selection = page.getByRole('region', {
      name: english ? 'Selected window' : '选定窗口',
      exact: true,
    });
    await expect(summary).toContainText('+7,600');
    await expect(table.locator('tr[data-selected]')).toContainText('W3');
    await expect(selection).toContainText('-860');
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`W1-${language}.png`) });
    await page.evaluate(() => {
      const hooks = window as unknown as Hooks;
      const view = hooks.wfState().walkForward!;
      const windows = view.windows.map((window) => ({ ...window, wfe: null }));
      hooks.wfResults.publish({
        ...view,
        windows,
        totals: { ...view.totals, wfe: null },
        selection: { ...view.selection!, window: windows[view.selection!.window.plan.index] },
      });
    });
    await expect(summary).toContainText('WFE —');
    await expect(selection).toContainText('WFE —');
    await expect(table.locator('tbody tr td:nth-child(6)')).toHaveText(Array(6).fill('—'));
    await expect(table.locator('tfoot tr td:nth-child(6)')).toHaveText('—');
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`W1-unavailable-wfe-${language}.png`) });
    const stitched = await pixels(page);
    await summary
      .getByRole('radio', { name: english ? 'Per window' : '分窗口', exact: true })
      .click();
    await expect.poll(() => pixels(page)).not.toBe(stitched);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`W2-${language}.png`) });
    const lane = summary.getByRole('button', { name: english ? 'Select W5' : '选择 W5' });
    await lane.focus();
    await page.keyboard.press('Enter');
    await expect(table.locator('tr[data-selected]')).toContainText('W5');
    await expect(selection).toContainText('+1,640');
    await selection.getByRole('button', { name: english ? 'View backtest' : '查看回测' }).click();
    await page.getByRole('button', { name: english ? 'Optimize' : '优化', exact: true }).click();
    await page
      .getByRole('button', { name: english ? 'Apply to inputs' : '应用到输入', exact: true })
      .click();
    await page.getByRole('button', { name: english ? 'Optimize' : '优化', exact: true }).click();
    const calls = await page.evaluate(() => (window as unknown as Hooks).wfResults.calls);
    expect(calls.slice(0, 3)).toEqual([
      { action: 'selectWindow', value: 4 },
      { action: 'selectWindow', value: 4 },
      { action: 'previewWindow', value: 4 },
    ]);
    expect(calls.at(-1)?.action).toBe('applyFixedParameters');
    await summary.getByRole('radio', { name: english ? 'Stitched' : '拼接', exact: true }).click();
    await page.evaluate(() => (window as unknown as Hooks).wfScenario('live'));
    await expect(summary).toContainText(english ? '2 / 6 windows done' : '2 / 6 个窗口已完成');
    await expect(table.locator('tr[data-status="waiting"]')).toHaveCount(3);
    await expect(table.locator('tfoot')).not.toContainText('+3,430');
    await expect(
      page.getByRole('button', { name: english ? 'Apply to inputs' : '应用到输入', exact: true }),
    ).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`W4-${language}.png`) });
    await page.evaluate(() => (window as unknown as Hooks).wfScenario('flat'));
    await expect(table.locator('tfoot')).toContainText(
      english ? '4 / 5 profitable, 1 flat' : '4 / 5 盈利，1 空仓',
    );
    await expect(table.locator('tr[data-window="5"]')).toContainText(english ? 'Part' : '部分');
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`W5-${language}.png`) });
    await table.getByRole('button', { name: english ? 'Adjust' : '调整' }).click();
    await expect(
      page
        .getByRole('region', { name: english ? 'Per window' : '分窗口', exact: true })
        .getByRole('combobox'),
    ).toBeFocused();
    await expect(
      selection.getByRole('button', { name: english ? 'View backtest' : '查看回测' }),
    ).toBeDisabled();
    await table.getByRole('button', { name: english ? 'Select W1' : '选择 W1' }).click();
    await expect(selection).toContainText('+2,310');
    expect(errors).toEqual([]);
  });
}

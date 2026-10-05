import { expect, test, type Page } from '@playwright/test';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import type { BacktestHooks } from './backtest-hooks.ts';
import { waitForTopEquity, workerWaitTimeout } from './optimize-waits.ts';
import { origins } from './ports.ts';

test.use({ baseURL: origins.dev });
test.describe.configure({ timeout: 120_000 });

type Hooks = Window & {
  backtestHooks: BacktestHooks;
  leaderboardState: () => OptimizationStoreState;
};

const source = `//@version=6
strategy("Height grid", initial_capital=100000)
length = input.int(3, "Length", minval=2, maxval=20)
mult = input.float(1.5, "Multiplier", minval=1, maxval=2, step=0.25)
if bar_index % (length * 2) == 0
    strategy.entry("L", strategy.long, qty=mult * 0.1)
if bar_index % (length * 2) == length
    strategy.close("L")
`;

async function capacity(page: Page) {
  return page.getByTestId('leaderboard-body').evaluate((body) => {
    const state = (window as unknown as Hooks).leaderboardState();
    const cards = [...body.querySelectorAll('li')];
    const rows = cards.length ? cards : [...body.querySelectorAll('tbody tr')];
    const height = Math.max(...rows.map((row) => row.getBoundingClientRect().height));
    const table = body.querySelector('table');
    const scroller = table?.parentElement;
    const header = table?.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const scrollbar = scroller ? scroller.offsetHeight - scroller.clientHeight : 0;
    const expected = Math.max(
      5,
      Math.min(
        100,
        Math.floor((body.clientHeight - header - scrollbar - (cards.length ? 0 : 1)) / height),
      ),
    );
    return {
      size: state.viewSettings.pageSize,
      expected,
      count: rows.length,
      passing: state.views!.leaderboard.passing,
      page: state.views!.leaderboard.page,
      pages: state.views!.leaderboard.pageCount,
      first: state.views!.leaderboard.rows[0].rank,
      last: state.views!.leaderboard.rows.at(-1)!.rank,
      selected: state.views!.selection?.row.rank,
      pending: state.views!.pending,
      fits:
        body.scrollHeight <= body.clientHeight &&
        rows.every(
          (row) => row.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 1,
        ),
    };
  });
}

async function fitted(page: Page) {
  await expect
    .poll(async () => {
      const value = await capacity(page);
      return value.size === value.expected && value.fits && !value.pending;
    })
    .toBe(true);
  const value = await capacity(page);
  expect(value.count).toBe(Math.min(value.size, value.passing - value.page * value.size));
  expect(value.pages).toBe(Math.ceil(value.passing / value.size));
  await expect(page.getByTestId('leaderboard-body').locator('..').locator('footer')).toContainText(
    `${value.first}–${value.last} of ${value.passing}`,
  );
  return value;
}

test('R1 and G4 pages fit their bodies and preserve the anchor through viewport and pane resizing', async ({
  page,
}, info) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api/market')
      ? route.continue()
      : route.abort();
  });
  await page.addInitScript(() =>
    localStorage.setItem('optipine.ui', JSON.stringify({ state: { language: 'en' }, version: 1 })),
  );
  await page.goto('/e2e/harness.html');
  await page.waitForFunction(() => 'backtestHooks' in window);
  await page.evaluate(async (source) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { getServices } = await load('/src/state/services.ts');
    await getServices().loadOptimization();
    const { getOptimizationStore } = await load('/src/state/optimization.ts');
    const hooks = window as unknown as Hooks;
    hooks.leaderboardState = () => getOptimizationStore().getState();
    hooks.backtestHooks.openScript({
      source,
      fileName: 'height-grid.pine',
      origin: { kind: 'file' },
    });
    hooks.backtestHooks.useSyntheticData(360);
  }, source);
  await page.waitForFunction(
    () => (window as unknown as Hooks).leaderboardState().readiness.ok,
    undefined,
    { timeout: workerWaitTimeout },
  );
  await page.evaluate(() => {
    const { actions } = (window as unknown as Hooks).leaderboardState();
    actions.setValidation({ mode: 'in-out' });
    actions.setRange('Length', { from: 2, to: 20, step: 1 });
    actions.setRange('Multiplier', { from: 1, to: 2, step: 0.25 });
    actions.removeFilter(1);
    actions.removeFilter(0);
  });
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await waitForTopEquity(page, info);
  await page.evaluate(() => document.fonts.ready);
  const first = await fitted(page);
  expect(first.first).toBe(1);
  expect(first.passing).toBe(95);
  await page.screenshot({ path: info.outputPath('leaderboard-1440x900.png') });
  await page.getByRole('button', { name: 'Next page' }).click();
  const leading = (await fitted(page)).first;
  await page.setViewportSize({ width: 1440, height: 1200 });
  await expect.poll(async () => (await capacity(page)).size).toBeGreaterThan(first.size);
  const tall = await fitted(page);
  expect(tall.first).toBeLessThanOrEqual(leading);
  expect(tall.last).toBeGreaterThanOrEqual(leading);
  // Pick a late row, then resize down; its new page must be opened automatically.
  await page.getByRole('button', { name: `Select set #${tall.last}`, exact: true }).click();
  await fitted(page);
  await page.screenshot({ path: info.outputPath('leaderboard-1440x1200.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => (await capacity(page)).size).toBe(first.size);
  const resized = await fitted(page);
  expect(resized.selected).toBe(tall.last);
  await expect(page.locator('tr[data-selected="true"]')).toHaveCount(1);

  const handle = page.getByRole('separator', { name: 'Resize summary' });
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y - 70, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await capacity(page)).size).toBeGreaterThan(first.size);
  await fitted(page);
  await expect(page.locator('tr[data-selected="true"]')).toHaveCount(1);

  // At the minimum lower-pane height, reserve enough room for five complete rows.
  const moved = (await handle.boundingBox())!;
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width / 2, 890, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await capacity(page)).size).toBe(5);
  await fitted(page);
  await expect(page.locator('tr[data-selected="true"]')).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Leaderboard', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Leaderboard', exact: true })).toBeVisible();
  const phone = await fitted(page);
  await expect(page.getByRole('button', { pressed: true, name: /Select set/ })).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('leaderboard-390x844.png') });
  await info.attach('leaderboard-capacities.json', {
    body: JSON.stringify({ desktop: first, tall, phone }, null, 2),
    contentType: 'application/json',
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await fitted(page);
  await expect(page.getByRole('button', { pressed: true, name: /Select set/ })).toHaveCount(1);
});

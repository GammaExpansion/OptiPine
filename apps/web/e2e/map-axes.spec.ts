import { expect, test } from '@playwright/test';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import { fixedClock, installMarketFixtures } from './market-fixtures.ts';
import { origins } from './ports.ts';
import { waitForTopEquity, workerWaitTimeout } from './optimize-waits.ts';

test.use({ baseURL: origins.dev, viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

type Hooks = Window & {
  optimization: () => OptimizationStoreState;
  liveAxes: { x?: string; y?: string }[];
};

test('value-count axes stay fixed through a recorded run despite a smaller high-impact input', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installMarketFixtures(page);
  await page.clock.install({ time: fixedClock });
  await page.addInitScript(() => {
    localStorage.setItem('optipine.ui', JSON.stringify({ state: { language: 'en' }, version: 1 }));
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 3 });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Load example/ }).click();
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  const right = page.getByTestId('optimize-right');
  await expect(right).toBeVisible();
  for (const [title, from, to, step] of [
    ['Length', 160, 200, 10],
    ['Multiplier', 1, 3, 2],
  ] as const) {
    await right.getByRole('spinbutton', { name: `${title} from`, exact: true }).fill(String(from));
    await right.getByRole('spinbutton', { name: `${title} to`, exact: true }).fill(String(to));
    await right.getByRole('spinbutton', { name: `${title} step`, exact: true }).fill(String(step));
  }
  await right.getByRole('checkbox', { name: 'Search Source', exact: true }).setChecked(true);
  for (const title of ['Use trailing stop', 'Trail %'])
    await right.getByRole('checkbox', { name: `Search ${title}`, exact: true }).setChecked(false);
  await page.evaluate(async () => {
    const path = '/src/state/optimization.ts';
    const { getOptimizationStore } = await import(/* @vite-ignore */ path);
    const hooks = window as unknown as Hooks;
    const store = getOptimizationStore();
    hooks.optimization = () => store.getState();
    hooks.liveAxes = [];
    store.subscribe((state: OptimizationStoreState) => {
      if (state.run.status === 'running' && state.views?.map)
        hooks.liveAxes.push({ x: state.views.map.x, y: state.views.map.y ?? undefined });
    });
  });
  await right.getByRole('button', { name: 'Start', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Hooks).optimization().run.status), {
      timeout: workerWaitTimeout,
    })
    .toBe('done');
  await waitForTopEquity(page, info);
  const x = page.getByRole('combobox', { name: 'X axis', exact: true });
  const y = page.getByRole('combobox', { name: 'Y axis', exact: true });
  await expect(x).toHaveText('Length');
  await expect(y).toHaveText('Source');
  const liveAxes = await page.evaluate(() => (window as unknown as Hooks).liveAxes);
  expect(liveAxes.length).toBeGreaterThan(0);
  expect(liveAxes.every((axes) => axes.x === 'Length' && axes.y === 'Source')).toBe(true);

  // With only two Multiplier values, smoothing averages both and hides its raw impact.
  // Changing the surface must not change the axes picked from the search space.
  await page.getByRole('switch', { name: 'Smooth: mean of ±1 step neighbours' }).uncheck();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Hooks).optimization().views?.pending), {
      timeout: workerWaitTimeout,
    })
    .toBe(false);
  const result = await page.evaluate(() => {
    const state = (window as unknown as Hooks).optimization();
    return {
      axes: state.views?.summary.axes,
      defaultAxes: state.views?.summary.defaultAxes,
      sensitivity: state.views?.sensitivity.rows.map((row) => ({
        parameter: row.parameter,
        impact: row.etaSquared,
      })),
      activeAxes: state.results?.space.activeAxes.map((axis) => [axis.title, axis.values.length]),
      combinations: state.results?.combinations,
    };
  });
  await info.attach('map-axes.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  expect(result.axes).toEqual({ x: 'Length', y: 'Source', z: undefined });
  expect(result.defaultAxes).toEqual(['Length', 'Source']);
  expect(result.sensitivity?.[0].parameter).toBe('Multiplier');
  expect(result.activeAxes).toEqual([
    ['Length', 5],
    ['Multiplier', 2],
    ['Source', 3],
  ]);
  expect(result.combinations).toBe(30);
  await expect(x).toHaveText('Length');
  await expect(y).toHaveText('Source');
  await page.mouse.move(10, 50);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath('map-axes-default.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Parameter map', exact: true }).click();
  await expect(x).toHaveText('Length');
  await expect(y).toHaveText('Source');
  expect(errors).toEqual([]);
});

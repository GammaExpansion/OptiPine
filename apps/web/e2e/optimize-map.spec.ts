import { expect, test, type Page } from '@playwright/test';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import { origins } from './ports.ts';

// The setup sidebar is an independent slot. Initialize its stores through Vite; every trial and
// analysis still runs through the production Worker factories and real optimization pool.
test.use({ baseURL: origins.dev });
type Hooks = Window & { mapState: () => OptimizationStoreState };
const source = (dense: boolean) => `//@version=6
strategy("Map test", initial_capital=1000000)
length = input.int(2, "Length", minval=2, maxval=50)
src = input.source(close, "Source")
${dense ? 'mult = input.float(1.0, "Multiplier", minval=1, maxval=3, step=0.25)\ntrailing = input.bool(false, "Use trailing stop")' : ''}
if bar_index % ${dense ? '(length + int(mult))' : 'length'} == 0
    strategy.entry("L", strategy.long, qty=${dense ? '(trailing ? 2 : 1)' : '1'})
else if src > open
    strategy.close("L")
plot(ta.sma(src, length))
`;

async function open(page: Page, dense = false, language: 'en' | 'zh' = 'en') {
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
  await page.addInitScript((language) => {
    localStorage.setItem('optipine.ui', JSON.stringify({ state: { language }, version: 1 }));
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
  }, language);
  await page.goto('/');
  await page.evaluate(
    async ({ source, dense }) => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const { openScript } = await load('/src/state/backtest.ts');
      const { getMarketDataStore } = await load('/src/state/marketData.ts');
      const { getOptimizationStore } = await load('/src/state/optimization.ts');
      const { syntheticBars } = await load('/src/charts-dev/synthetic.ts');
      const { uiStore } = await load('/src/state/ui.ts');
      openScript({ source, fileName: 'map-test.pine', origin: { kind: 'file' } });
      getMarketDataStore()
        .getState()
        .actions.useCsv(
          {
            bars: syntheticBars(240),
            timeframe: '60',
            syminfo: {
              ticker: 'SYNTHETIC',
              type: 'crypto',
              mintick: 0.01,
              pointvalue: 1,
              timezone: 'Etc/UTC',
            },
          },
          'synthetic.csv',
        );
      (window as unknown as Hooks).mapState = () => getOptimizationStore().getState();
      uiStore.getState().setPage('optimize');
      if (dense) uiStore.getState().setPaneSizes('optimize', { map: 360 });
    },
    { source: source(dense), dense },
  );
  await page.waitForFunction(() => (window as unknown as Hooks).mapState().readiness.ok);
  await page.evaluate(async (dense) => {
    const state = (window as unknown as Hooks).mapState;
    while (state().viewSettings.filters.length) state().actions.removeFilter(0);
    state().actions.setRange('Length', { from: 2, to: dense ? 50 : 4, step: 1 });
    if (dense) {
      state().actions.setAxis('x', 'Length');
      state().actions.setAxis('y', 'Multiplier');
    }
    await state().actions.start();
  }, dense);
  await page.waitForFunction(() => {
    const state = (window as unknown as Hooks).mapState();
    return state.run.status === 'done' && !state.views?.pending;
  });
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

const settled = (page: Page) =>
  page.waitForFunction(() => !(window as unknown as Hooks).mapState().views?.pending);
const identity = (page: Page) =>
  page.evaluate(() => {
    const state = (window as unknown as Hooks).mapState();
    return {
      id: state.results!.id,
      finished: state.results!.finishedAt,
      combinations: state.results!.combinations,
    };
  });

async function pixels(page: Page, testId = 'parameter-map') {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (let index = 0; index < data.length; index++)
        hash = Math.imul(hash ^ data[index], 16777619);
      return hash >>> 0;
    });
}

async function firstCell(page: Page) {
  const canvas = page.getByTestId('parameter-map').first();
  const point = await canvas.evaluate(async (element) => {
    const modulePath = '/src/charts/optimize/geometry.ts';
    const { mapGeometry, cellRect } = await import(/* @vite-ignore */ modulePath);
    const state = (window as unknown as Hooks).mapState();
    const geometry = mapGeometry(state.views!.map!.panel);
    const rect = cellRect(geometry.layers[0], 0, Math.max(element.clientWidth, geometry.width));
    return { x: rect.x + 8, y: rect.y + 8 };
  });
  await canvas.hover({ position: point });
  return { canvas, point };
}

test('R1: real nine-combo map, axes, IS/OOS, Smooth, hover and selection never re-run', async ({
  page,
}, info) => {
  const errors = await open(page);
  const initial = await identity(page);
  expect(initial.combinations).toBe(9);
  const map = page.getByRole('region', { name: 'Parameter map', exact: true });
  await expect(page.getByTestId('parameter-map')).toBeVisible();
  const before = await pixels(page);
  await map.getByRole('radio', { name: 'OOS', exact: true }).click();
  await expect.poll(() => pixels(page)).not.toBe(before);
  const rawSurface = await page.evaluate(() =>
    (window as unknown as Hooks).mapState().views!.map!.panel.cells.map((cell) => cell.value),
  );
  await map.getByRole('switch').click();
  await settled(page);
  expect(
    await page.evaluate(() =>
      (window as unknown as Hooks).mapState().views!.map!.panel.cells.map((cell) => cell.value),
    ),
  ).not.toEqual(rawSurface);
  expect(
    await page.evaluate(() => (window as unknown as Hooks).mapState().viewSettings.smooth),
  ).toBe(true);
  await map.getByRole('combobox', { name: 'X axis' }).click();
  await page.getByRole('option', { name: 'Source', exact: true }).click();
  await settled(page);
  expect(await page.evaluate(() => (window as unknown as Hooks).mapState().views!.map!.x)).toBe(
    'Source',
  );
  const { canvas, point } = await firstCell(page);
  await expect(page.getByRole('tooltip')).toContainText('Mean');
  await expect(page.getByRole('tooltip').getByRole('row')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('R1-R6-en.png') });
  await canvas.click({ position: point });
  await settled(page);
  expect(
    await page.evaluate(() => (window as unknown as Hooks).mapState().views!.selection!.explicit),
  ).toBe(true);
  expect(await identity(page)).toEqual(initial);
  await page.evaluate(async () => {
    const modulePath = '/src/state/ui.ts';
    (await import(/* @vite-ignore */ modulePath)).uiStore.getState().setLanguage('zh');
  });
  await page.screenshot({ path: info.outputPath('R1-zh.png') });
  expect(errors).toEqual([]);
});

for (const language of ['en', 'zh'] as const) {
  test(`R4/R6/R7/R12: dense grid, slices, layers, bin detail, drag and keyboard (${language})`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const errors = await open(page, true, language);
    const initial = await identity(page);
    const region = page.getByRole('region', {
      name: language === 'en' ? 'Parameter map' : '参数图',
      exact: true,
    });
    await firstCell(page);
    await expect(page.getByRole('tooltip')).toContainText(
      language === 'en' ? 'Click to view bin detail' : '点击查看格内明细',
    );
    await page.screenshot({ path: info.outputPath(`R6-${language}.png`) });
    const { canvas, point } = await firstCell(page);
    await canvas.click({ position: point });
    const detail = page.getByRole('region', {
      name: language === 'en' ? 'Bin detail' : '格内明细',
    });
    await expect(detail).toBeVisible();
    await detail.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`R7-${language}.png`) });
    await detail.getByRole('button').click();
    await region
      .getByRole('combobox', { name: language === 'en' ? 'Source slice' : 'Source 切片' })
      .click();
    await page
      .getByRole('option', { name: language === 'en' ? 'Mean' : '均值', exact: true })
      .click();
    await settled(page);
    await region
      .getByRole('combobox', {
        name: language === 'en' ? 'Use trailing stop slice' : 'Use trailing stop 切片',
      })
      .click();
    await page
      .getByRole('option', { name: language === 'en' ? 'Max' : '取最大', exact: true })
      .click();
    await settled(page);
    await region.getByRole('combobox', { name: language === 'en' ? 'Z axis' : 'Z 轴' }).click();
    await page.getByRole('option', { name: 'Use trailing stop', exact: true }).click();
    await settled(page);
    expect(
      await page.evaluate(
        () => (window as unknown as Hooks).mapState().views!.map!.panel.layers!.length,
      ),
    ).toBe(2);
    await page.screenshot({ path: info.outputPath(`R4-${language}.png`) });
    const marker = page.locator('[data-axis-marker="x"]');
    const sourceRow = page.locator('[data-sensitivity-row]').filter({ hasText: 'Source' });
    const from = await marker.boundingBox();
    const to = await sourceRow.boundingBox();
    await page.mouse.move(from!.x + 10, from!.y + 8);
    await page.mouse.down();
    await page.mouse.move(to!.x + 50, to!.y + to!.height / 2, { steps: 8 });
    await expect(sourceRow).toHaveAttribute('data-target', 'true');
    await page.screenshot({ path: info.outputPath(`R12-${language}.png`) });
    await page.mouse.up();
    await settled(page);
    expect(await page.evaluate(() => (window as unknown as Hooks).mapState().views!.map!.x)).toBe(
      'Source',
    );
    await marker.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (window as unknown as Hooks).mapState().views!.map!.x)).toBe(
      'Source',
    );
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await settled(page);
    expect(
      await page.evaluate(() => (window as unknown as Hooks).mapState().views!.map!.x),
    ).not.toBe('Source');
    await expect(marker).toBeFocused();
    expect(await identity(page)).toEqual(initial);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('R8: a one-input curve marks the near-peak range and selects a set by keyboard', async ({
  page,
}, info) => {
  const errors = await open(page);
  await page.evaluate(async () => {
    const state = (window as unknown as Hooks).mapState;
    state().actions.setSearched('Source', false);
    state().actions.setRange('Length', { from: 2, to: 30, step: 1 });
    await state().actions.start();
  });
  const canvas = page.getByTestId('objective-curve');
  await expect(canvas).toBeVisible();
  await canvas.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await settled(page);
  expect(
    await page.evaluate(
      () => (window as unknown as Hooks).mapState().views!.selection!.row.parameters.Length,
    ),
  ).toBe(30);
  await expect(page.getByText('IS range within 90% of peak')).toBeVisible();
  for (const language of ['en', 'zh']) {
    await page.evaluate(async (language) => {
      const modulePath = '/src/state/ui.ts';
      (await import(/* @vite-ignore */ modulePath)).uiStore.getState().setLanguage(language);
    }, language);
    await page.screenshot({ path: info.outputPath(`R8-${language}.png`) });
  }
  expect(errors).toEqual([]);
});

import { expect, test, type Page } from '@playwright/test';
import type { FeedDataset } from '@pine/market-data';
import { syntheticBars } from '../src/charts-dev/synthetic.ts';
import '../src/i18n/catalogs.ts';
import { translateId } from '../src/i18n/translate.ts';
import type { BacktestStoreState } from '../src/state/backtest.ts';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import { origins } from './ports.ts';

test.use({ baseURL: origins.dev });
type Hooks = Window & {
  optimization: () => OptimizationStoreState;
  backtest: () => BacktestStoreState;
};

const settled = (page: Page) =>
  page.waitForFunction(() => !(window as unknown as Hooks).optimization().views?.pending);
const identity = (page: Page) =>
  page.evaluate(() => {
    const state = (window as unknown as Hooks).optimization();
    return { id: state.results!.id, finishedAt: state.results!.finishedAt };
  });

/** Inspect the actual canvas frame, so shared selection must reach the map renderer too. */
async function selectedFrame(page: Page) {
  return page.getByTestId('parameter-map').evaluate(async (element) => {
    const path = '/src/charts/optimize/geometry.ts';
    const { mapGeometry, cellRect, containsSelection } = await import(/* @vite-ignore */ path);
    const views = (window as unknown as Hooks).optimization().views!;
    const map = views.map!.panel;
    const geometry = mapGeometry(map);
    const canvas = element as HTMLCanvasElement;
    const host = canvas.parentElement!.parentElement!;
    for (const layer of geometry.layers) {
      for (const [index, cell] of layer.cells) {
        if (!containsSelection(map, cell, views.selection!.row.parameters)) continue;
        const rect = cellRect(layer, index, Math.max(canvas.clientWidth, geometry.width));
        const pixel = canvas
          .getContext('2d')!
          .getImageData(
            Math.floor((rect.x - 1 - host.scrollLeft) * devicePixelRatio),
            Math.floor((rect.y + 5 - host.scrollTop) * devicePixelRatio),
            1,
            1,
          ).data;
        // The selected frame uses --primary, an orange distinct from the heat ramp.
        return pixel[0] > 200 && pixel[1] > 80 && pixel[1] < 200 && pixel[2] < 80;
      }
    }
    return false;
  });
}

for (const language of ['en', 'zh'] as const) {
  test(`Trend Breakout integrates live views, selection, filters and apply (${language})`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    const t: (
      id: Parameters<typeof translateId>[0],
      values?: Parameters<typeof translateId>[2],
    ) => string = (id, values) => translateId(id, language, values);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const dataset: FeedDataset = {
      input: {
        bars: syntheticBars(2400),
        timeframe: '60',
        syminfo: {
          ticker: 'BTCUSDT',
          type: 'crypto',
          mintick: 0.01,
          mincontract: 0.001,
          pointvalue: 1,
          currency: 'USD',
          timezone: 'Etc/UTC',
        },
      },
      fetchedAt: Date.UTC(2025, 4, 5),
      profileEstimated: false,
    };
    await page.clock.setFixedTime(new Date('2025-05-05T00:00:00Z'));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') {
        errors.push(`Unexpected network: ${url.hostname}`);
        await route.abort();
      } else if (url.pathname === '/api/market/bars') await route.fulfill({ json: dataset });
      else if (url.pathname.startsWith('/api/market')) {
        errors.push(`Unexpected market request: ${url.pathname}`);
        await route.abort();
      } else await route.continue();
    });
    await page.addInitScript((language) => {
      localStorage.setItem('optipine.ui', JSON.stringify({ state: { language }, version: 1 }));
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 3 });
    }, language);
    await page.goto('/');
    await page.evaluate(async () => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const { loadExample, getBacktestStore } = await load('/src/state/backtest.ts');
      const { getOptimizationStore } = await load('/src/state/optimization.ts');
      const hooks = window as unknown as Hooks;
      hooks.optimization = () => getOptimizationStore().getState();
      hooks.backtest = () => getBacktestStore().getState();
      await loadExample('trend-breakout');
    });
    await page.getByRole('button', { name: t('shell.optimize'), exact: true }).click();
    const right = page.getByTestId('optimize-right');
    for (const [title, from, to] of [
      ['Length', 18, 27],
      ['Multiplier', 1, 1.75],
    ] as const) {
      await right
        .getByRole('spinbutton', { name: t('optimize.setup.fromLabel', { title }) })
        .fill(String(from));
      await right
        .getByRole('spinbutton', { name: t('optimize.setup.toLabel', { title }) })
        .fill(String(to));
    }
    await right
      .getByRole('checkbox', { name: t('optimize.setup.searchInput', { title: 'Trail %' }) })
      .click();
    const filterGroup = right.getByRole('group', { name: t('optimize.setup.filters') });
    for (let index = 0; index < 2; index++)
      await filterGroup.locator('button[aria-label]').first().click();
    // Large default ranges select Random automatically. Explicitly choose the now-small grid.
    await right.getByRole('radio', { name: t('optimize.grid'), exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as Hooks).optimization().search.sampling?.combinations,
        ),
      )
      .toBe(240);
    await right.getByRole('button', { name: t('optimize.start'), exact: true }).click();
    await page.waitForFunction(() => {
      const state = (window as unknown as Hooks).optimization();
      return (
        state.run.status === 'running' &&
        state.views &&
        state.views.completed >= 24 &&
        state.views.leaderboard.rows.length > 0 &&
        state.views.sensitivity.rows.length > 0 &&
        state.views.map?.panel.cells.some((cell) => cell.value !== null)
      );
    });
    await expect(
      page.getByRole('img', { name: t('optimize.summary.distribution'), exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: t('optimize.selection.backtest'), exact: true }),
    ).toBeDisabled();
    await expect(page.locator('[data-sensitivity-row]')).toHaveCount(4);
    await page.screenshot({ path: info.outputPath(`O8-${language}.png`) });
    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as Hooks).optimization().topEquity.status),
        { timeout: 60_000 },
      )
      .toBe('ready');
    await settled(page);
    const originalRun = await identity(page);
    const board = page.getByTestId('optimize-leaderboard');
    await expect(board).toContainText(t('optimize.leaderboard.pass', { passing: 240, total: 240 }));
    await expect(board.getByRole('row')).toHaveCount(14);
    await expect(board.getByRole('cell', { name: '1.50', exact: true }).first()).toBeVisible();
    const parameters = page.getByRole('region', { name: t('optimize.selection.label') });
    await expect(parameters).toContainText(/Length18Multiplier1\.50Source/);
    await expect(parameters).not.toContainText('Trail %');
    await expect(
      page
        .getByRole('img', { name: t('optimize.sensitivity.spark', { title: 'Multiplier' }) })
        .locator('title'),
    ).toContainText('1.50');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`R1-${language}.png`) });

    const mapCanvas = page.getByTestId('parameter-map');
    await mapCanvas.focus();
    await mapCanvas.press('Home');
    await mapCanvas.press('ArrowDown');
    await expect(page.getByRole('tooltip')).toContainText('1.50');
    await page.screenshot({ path: info.outputPath(`R6-${language}.png`) });
    await mapCanvas.press('Escape');

    await board
      .getByRole('button', { name: t('optimize.leaderboard.select', { rank: 2 }), exact: true })
      .click();
    await settled(page);
    await expect.poll(() => selectedFrame(page)).toBe(true);
    await expect(board.locator('tr[data-selected]')).toContainText('2');
    const selection = page.getByRole('region', { name: t('optimize.selection.label') });
    await expect(selection).toContainText('#2');

    // Pick a map cell whose row lives beyond the first page, using its rendered geometry.
    const mapPoint = await page.getByTestId('parameter-map').evaluate(async (element) => {
      const path = '/src/charts/optimize/geometry.ts';
      const { mapGeometry, cellRect } = await import(/* @vite-ignore */ path);
      const state = (window as unknown as Hooks).optimization();
      const geometry = mapGeometry(state.views!.map!.panel);
      const visible = new Set(state.views!.leaderboard.rows.map((row) => row.trialId));
      for (const layer of geometry.layers)
        for (const [index, cell] of layer.cells) {
          if (!cell.trialId || cell.value === null) continue;
          const rect = cellRect(layer, index, Math.max(element.clientWidth, geometry.width));
          if (!visible.has(cell.trialId) && rect.y + 16 < element.clientHeight)
            return { x: rect.x + 8, y: rect.y + 8, trialId: cell.trialId };
        }
      throw new Error('No visible off-page cell');
    });
    await page.getByTestId('parameter-map').click({ position: mapPoint });
    await settled(page);
    const mapSelection = await page.evaluate(
      () => (window as unknown as Hooks).optimization().views!.selection!.row,
    );
    expect(mapSelection.trialId).toBe(mapPoint.trialId);
    expect(mapSelection.rank).toBeGreaterThan(13);
    await expect(selection).toContainText(`#${mapSelection.rank}`);
    await expect(board.locator('tr[data-selected]')).toHaveCount(1);

    await page.getByRole('radio', { name: t('optimize.summary.scatter'), exact: true }).click();
    const scatter = page.getByRole('img', { name: t('optimize.summary.scatter'), exact: true });
    const dot = await scatter.evaluate(async (element) => {
      const path = '/src/pages/optimize/summary/plot-geometry.ts';
      const { extent, scale, nearestPoint, roundAxis } = await import(/* @vite-ignore */ path);
      const scatter = (window as unknown as Hooks).optimization().views!.scatter!;
      const x = scale(
        roundAxis(extent([scatter.inSample], true)).bounds,
        66,
        element.clientWidth - 64,
      );
      const y = scale(
        roundAxis(extent([scatter.outOfSample], true), 3).bounds,
        element.clientHeight - 28,
        20,
      );
      const index = scatter.rank.findIndex((rank) => rank === 1);
      const point = { x: x(scatter.inSample[index]), y: y(scatter.outOfSample[index]) };
      const points = Array.from(scatter.inSample, (value, at) => ({
        x: x(value),
        y: y(scatter.outOfSample[at]),
      }));
      return { ...point, rank: scatter.rank[nearestPoint(points, point.x, point.y)!] };
    });
    await scatter.click({ position: dot });
    await settled(page);
    await expect(selection).toContainText(`#${dot.rank}`);
    await expect(board.locator('tr[data-selected]')).toHaveCount(1);
    await expect.poll(() => selectedFrame(page)).toBe(true);
    await page.screenshot({ path: info.outputPath(`R2-${language}.png`) });
    await page
      .getByRole('radio', { name: t('optimize.summary.distribution'), exact: true })
      .click();
    await page.screenshot({ path: info.outputPath(`R2b-${language}.png`) });

    const beforeMap = await page.evaluate(() =>
      (window as unknown as Hooks).optimization().views!.map!.panel.cells.map((cell) => cell.value),
    );
    await right
      .getByRole('button', { name: new RegExp(t('optimize.setup.objective.isNetProfit')) })
      .click();
    await page
      .getByRole('radio', { name: t('optimize.setup.objective.maxDrawdown'), exact: true })
      .click();
    await settled(page);
    expect(
      await page.evaluate(() =>
        (window as unknown as Hooks)
          .optimization()
          .views!.map!.panel.cells.map((cell) => cell.value),
      ),
    ).not.toEqual(beforeMap);
    const scores = await page.evaluate(() =>
      (window as unknown as Hooks).optimization().views!.leaderboard.rows.map((row) => row.score!),
    );
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    await page.getByRole('radio', { name: t('optimize.summary.equity'), exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Hooks).optimization().topEquity.status))
      .toBe('ready');
    expect(
      await page.evaluate(() => {
        const state = (window as unknown as Hooks).optimization();
        return state.topEquity.curves[0].trialId === state.views!.leaderboard.rows[0].trialId;
      }),
    ).toBe(true);

    await board.getByRole('button', { name: t('optimize.addCondition'), exact: true }).click();
    const popover = page.getByRole('dialog', { name: t('optimize.setup.addCondition') });
    await popover
      .getByRole('spinbutton', { name: t('optimize.leaderboard.value'), exact: true })
      .fill('999999');
    await expect(popover).toContainText(t('optimize.leaderboard.preview', { count: 240 }));
    await page.screenshot({ path: info.outputPath(`R10-${language}.png`) });
    await popover.getByRole('button', { name: t('optimize.leaderboard.add'), exact: true }).click();
    await settled(page);
    await expect(
      page.getByRole('heading', { name: t('optimize.leaderboard.empty') }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => {
        const views = (window as unknown as Hooks).optimization().views!;
        return {
          rows: views.leaderboard.passing,
          map: views.map!.panel.cells.filter((cell) => cell.value !== null).length,
          selected: views.selection,
        };
      }),
    ).toEqual({ rows: 0, map: 0, selected: null });
    await page.screenshot({ path: info.outputPath(`R9-${language}.png`) });
    await board
      .getByRole('button', { name: t('optimize.leaderboard.remove'), exact: true })
      .click();
    await settled(page);
    await expect(board).toContainText(t('optimize.leaderboard.pass', { passing: 240, total: 240 }));
    expect(await identity(page)).toEqual(originalRun);

    // R5 has exactly one dimmed ancestor for every panel.
    await right
      .getByRole('spinbutton', { name: t('optimize.setup.toLabel', { title: 'Length' }) })
      .fill('28');
    await expect(page.locator('[data-results]')).toHaveAttribute('data-outdated');
    const dimCounts = await page
      .locator('[data-results] section[aria-label]')
      .evaluateAll((sections) =>
        sections.map((section) => {
          let count = 0;
          for (let node: Element | null = section; node; node = node.parentElement)
            if (Number(getComputedStyle(node).opacity) < 1) count++;
          return count;
        }),
      );
    expect(dimCounts.length).toBeGreaterThanOrEqual(4);
    expect(dimCounts.every((count) => count === 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`R5-${language}.png`) });
    await right
      .getByRole('spinbutton', { name: t('optimize.setup.toLabel', { title: 'Length' }) })
      .fill('27');
    await expect(page.locator('[data-results]')).not.toHaveAttribute('data-outdated');

    const inputs = await page.evaluate(() =>
      (window as unknown as Hooks).backtest().inputs.map((input) => input.value),
    );
    await page.getByRole('button', { name: t('optimize.selection.backtest'), exact: true }).click();
    await expect(page.getByText(t('preview.unchanged'))).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Hooks).backtest().preview?.run.status))
      .toBe('done');
    await expect(page.getByTestId('price-chart')).toBeVisible();
    await expect(page.getByRole('table', { name: t('report.returns'), exact: true })).toBeVisible();
    const banner = page.getByRole('status').filter({ hasText: t('preview.unchanged') });
    await expect(banner).toContainText(/Length \d+, Multiplier \d+\.\d{2}, (close|hl2|ohlc4), /);
    await expect(banner).not.toContainText('Trail %');
    await page.screenshot({ path: info.outputPath(`B16-${language}.png`) });
    expect(
      await page.evaluate(() =>
        (window as unknown as Hooks).backtest().inputs.map((input) => input.value),
      ),
    ).toEqual(inputs);
    await page.getByRole('button', { name: t('preview.back'), exact: true }).click();
    await page.getByRole('button', { name: t('optimize.selection.apply'), exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Hooks).backtest().run.status))
      .toBe('done');
    await expect(page.getByRole('button', { name: t('preview.undo'), exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`B17-${language}.png`) });
    expect(
      await page.evaluate(() =>
        (window as unknown as Hooks).backtest().inputs.map((input) => input.value),
      ),
    ).not.toEqual(inputs);
    await page.getByRole('button', { name: t('preview.undo'), exact: true }).click();
    expect(
      await page.evaluate(() =>
        (window as unknown as Hooks).backtest().inputs.map((input) => input.value),
      ),
    ).toEqual(inputs);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
    expect(errors).toEqual([]);
  });
}

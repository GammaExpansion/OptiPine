import { expect, test } from '@playwright/test';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import { installMarketFixtures } from './market-fixtures.ts';
import { workerWaitTimeout } from './optimize-waits.ts';
import { origins } from './ports.ts';

test.use({ baseURL: origins.dev });

type Hooks = Window & { optimization: () => OptimizationStoreState };

for (const layout of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const) {
  test(`recorded BTC walk-forward opens Per window and switches both ways (${layout.name})`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(layout);
    await installMarketFixtures(page);
    await page.addInitScript(() => {
      localStorage.setItem(
        'optipine.ui',
        JSON.stringify({ state: { language: 'en' }, version: 1 }),
      );
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 3 });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Load example/ }).click();
    await page.getByRole('button', { name: 'Optimize', exact: true }).click();
    await page.evaluate(async () => {
      const servicesPath = '/src/state/services.ts';
      const { getServices } = await import(/* @vite-ignore */ servicesPath);
      await getServices().loadOptimization();
      const path = '/src/state/optimization.ts';
      const { getOptimizationStore } = await import(/* @vite-ignore */ path);
      (window as unknown as Hooks).optimization = () => getOptimizationStore().getState();
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Hooks).optimization().readiness.ok), {
        timeout: workerWaitTimeout,
      })
      .toBe(true);
    // Fix the small search explicitly so unrelated Optimize defaults do not affect this test.
    await page.evaluate(() => {
      const state = () => (window as unknown as Hooks).optimization();
      const { actions, search } = state();
      for (const row of search.rows)
        actions.setSearched(row.descriptor.title, row.descriptor.title === 'Length');
      actions.setRange('Length', { from: 180, to: 200, step: 20 });
      actions.setSampling({ method: 'grid' });
      while (state().viewSettings.filters.length) actions.removeFilter(0);
      actions.setValidation({
        mode: 'walk-forward',
        walkForward: { inSampleMonths: 12, outOfSampleMonths: 3, stepMonths: 3, anchored: false },
      });
    });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const state = (window as unknown as Hooks).optimization();
            return state.plan.status === 'planned' && state.readiness.ok;
          }),
        { timeout: workerWaitTimeout },
      )
      .toBe(true);
    if (layout.name === 'phone')
      await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await page
      .getByRole('region', { name: 'Optimization run', exact: true })
      .getByRole('button', { name: 'Start', exact: true })
      .click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const state = (window as unknown as Hooks).optimization();
            const view = state.walkForward;
            return state.run.status === 'done' && view && !view.pending && !view.mapPending;
          }),
        { timeout: workerWaitTimeout },
      )
      .toBe(true);
    const count = await page.evaluate(
      () => (window as unknown as Hooks).optimization().walkForward!.totals.completed,
    );
    expect(count).toBeGreaterThan(1);
    const perWindow = page.getByRole('radio', { name: 'Per window', exact: true });
    const stitched = page.getByRole('radio', { name: 'Stitched', exact: true });
    const chart = page.getByTestId('wf-equity');
    const summary = page.getByRole('region', {
      name: /^(Windows and equity|Stitched OOS equity)$/,
    });
    await expect(perWindow).toHaveAttribute('aria-checked', 'true');
    await expect(summary.getByRole('heading')).toHaveText('Windows and equity');
    await expect(summary).not.toContainText('WFE');
    await expect(summary).not.toContainText('Profitable windows');
    await expect(chart).toHaveAttribute('aria-label', `${count} windows with IS and OOS equity`);
    if (layout.name === 'phone') {
      await page.getByRole('tab', { name: 'Windows', exact: true }).click();
      await expect(perWindow).toHaveAttribute('aria-checked', 'true');
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`per-window-${layout.name}.png`) });
    await stitched.click();
    await expect(stitched).toHaveAttribute('aria-checked', 'true');
    await expect(summary.getByRole('heading')).toHaveText('Stitched OOS equity');
    await expect(summary).toContainText('WFE');
    await expect(summary).toContainText('Profitable windows');
    await expect(chart).toHaveAttribute('aria-label', `${count} windows and stitched OOS equity`);
    await page.screenshot({ path: info.outputPath(`stitched-${layout.name}.png`) });
    await perWindow.click();
    await expect(perWindow).toHaveAttribute('aria-checked', 'true');
    await expect(summary.getByRole('heading')).toHaveText('Windows and equity');
    await expect(summary).not.toContainText('WFE');
    await expect(chart).toHaveAttribute('aria-label', `${count} windows with IS and OOS equity`);
    expect(errors).toEqual([]);
  });
}

import { expect, test, type Locator, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import type { BacktestHooks } from './backtest-hooks.ts';
import { waitForTopEquity, workerWaitTimeout } from './optimize-waits.ts';
import { origins } from './ports.ts';

test.use({ baseURL: origins.dev, viewport: { width: 390, height: 844 } });
// Like the other real-Worker Optimize specs: a loaded machine or CI runner reproduces Top 20 slowly.
test.describe.configure({ timeout: 120_000 });

type PhoneWindow = Window & {
  backtestHooks: BacktestHooks;
  phoneOptimization: () => OptimizationStoreState;
};

const source = `//@version=6
strategy("Phone grid", initial_capital=100000)
length = input.int(3, "Length", minval=2, maxval=4)
mult = input.float(1.5, "Multiplier", minval=1.5, maxval=2, step=0.25)
price = input.string("close", "Source", options=["close", "hl2"])
stop = input.bool(false, "Stop")
if bar_index % (length * 2) == 0
    strategy.entry("L", strategy.long, qty=mult * 0.1)
if bar_index % (length * 2) == length
    strategy.close("L")
plot(ta.sma(close, length), "Basis")
`;

/** Visible text must fit both the phone and any ancestor that clips horizontal overflow. */
async function clippedLabels(scope: Locator) {
  return scope.evaluate((root) => {
    const problems: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const element = node.parentElement!;
      if (element.closest('script, style, [aria-hidden="true"], option')) continue;
      const box = element.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1 || box.bottom <= 0 || box.top >= innerHeight) continue;
      let left = 0;
      let right = innerWidth;
      for (let parent: Element | null = element; parent; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== 'visible') {
          const bounds = parent.getBoundingClientRect();
          left = Math.max(left, bounds.left);
          right = Math.min(right, bounds.right);
        }
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      if (
        [...range.getClientRects()].some((rect) => rect.left < left - 1 || rect.right > right + 1)
      )
        problems.push(node.textContent.trim());
    }
    return problems;
  });
}

async function noPageScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
}

async function touchTarget(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
}

for (const language of ['en', 'zh'] as const) {
  test(`G4 cards, charts, tabs and B16 preview with 18 real Worker sets (${language})`, async ({
    page,
  }, info) => {
    const en = language === 'en';
    const errors: string[] = [];
    const workers: string[] = [];
    page.on('worker', (worker) => workers.push(worker.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api/market')
        ? route.continue()
        : route.abort();
    });
    await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
    await page.addInitScript(
      (language) =>
        localStorage.setItem('optipine.ui', JSON.stringify({ state: { language }, version: 1 })),
      language,
    );
    await page.goto('/e2e/harness.html');
    await page.waitForFunction(() => 'backtestHooks' in window);
    await page.evaluate(async (source) => {
      const path = '/src/state/optimization.ts';
      const servicesPath = '/src/state/services.ts';
      const services = (await import(servicesPath)) as typeof import('../src/state/services.ts');
      // The optimization side loads on first need; the hooks below read it at once.
      await services.getServices().loadOptimization();
      const module = (await import(path)) as typeof import('../src/state/optimization.ts');
      const target = window as unknown as PhoneWindow;
      target.phoneOptimization = () => module.getOptimizationStore().getState();
      target.backtestHooks.openScript({ source, fileName: 'phone.pine', origin: { kind: 'file' } });
      target.backtestHooks.useSyntheticData(360);
    }, source);
    await expect
      .poll(
        () =>
          page.evaluate(() => (window as unknown as PhoneWindow).phoneOptimization().readiness.ok),
        // The script compiles in a Worker, which a loaded machine or CI runner delays.
        { timeout: workerWaitTimeout },
      )
      .toBe(true);
    await page.evaluate(() => {
      const { actions } = (window as unknown as PhoneWindow).phoneOptimization();
      actions.setRange('Length', { from: 2, to: 4, step: 1 });
      actions.setRange('Multiplier', { from: 1.5, to: 2, step: 0.25 });
      actions.setSearched('Stop', false);
      actions.removeFilter(1);
      actions.removeFilter(0);
      actions.addFilter({ metric: 'trades', operator: '>=', value: 0 });
    });
    await page.getByRole('button', { name: en ? 'Optimize' : '优化', exact: true }).click();
    await page.getByRole('tab', { name: en ? 'Settings' : '设置', exact: true }).click();
    await page.getByRole('button', { name: en ? 'Start' : '开始优化', exact: true }).click();
    await waitForTopEquity(page, info);
    expect(workers.filter((url) => url.includes('engine.worker')).length).toBeGreaterThanOrEqual(2);
    expect(workers.some((url) => url.includes('analysis.worker'))).toBe(true);
    expect(
      await page.evaluate(
        () => (window as unknown as PhoneWindow).phoneOptimization().results?.combinations,
      ),
    ).toBe(18);
    expect(
      await page.evaluate(() =>
        (window as unknown as PhoneWindow)
          .phoneOptimization()
          .views?.leaderboard.rows.some((row) => row.inSample.netProfit !== 0),
      ),
    ).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('tab', { name: en ? 'Leaderboard' : '排行', exact: true }).click();
    const summary = page.getByRole('region', { name: en ? 'Summary' : '汇总', exact: true });
    const tabs = page.getByRole('tablist', { name: en ? 'Page sections' : '页面分区' });
    await expect(tabs.getByRole('tab')).toHaveCount(4);
    expect(
      (await summary.boundingBox())!.y + (await summary.boundingBox())!.height,
    ).toBeLessThanOrEqual((await tabs.boundingBox())!.y + 1);
    const cards = page.getByRole('list', { name: en ? 'Leaderboard' : '排行', exact: true });
    await expect(cards.getByRole('button')).toHaveCount(13);
    await expect(page.getByText(en ? '18 / 18 pass' : '18 / 18 符合')).toBeVisible();
    const card = cards.getByRole('button').nth(1);
    await expect(card).toContainText(/Length \dMultiplier \d\.\d{2}Source (close|hl2)/);
    await expect(card).not.toContainText('Stop');
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    const view = page.getByRole('button', {
      name: en ? 'View backtest' : '查看这组参数的回测',
      exact: true,
    });
    const apply = page.getByRole('button', {
      name: en ? 'Apply to inputs' : '应用到参数',
      exact: true,
    });
    await touchTarget(view);
    await touchTarget(apply);
    await noPageScroll(page);
    expect(await clippedLabels(page.locator('body'))).toEqual([]);
    await page.screenshot({ path: info.outputPath(`G4-${language}.png`) });
    await page.getByRole('button', { name: en ? 'Next page' : '下一页' }).click();
    await expect(cards.getByRole('button')).toHaveCount(5);
    await cards.getByRole('button').first().click();
    await expect(cards.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: en ? 'Previous page' : '上一页' }).click();
    await card.click();
    for (const name of [
      en ? 'IS vs OOS' : '样本内 vs 样本外',
      en ? 'Distribution' : '分布',
      en ? 'Top 20 equity' : '前 20 组权益',
    ]) {
      await summary.getByRole('radio', { name, exact: true }).click();
      await expect(summary.getByRole('img', { name, exact: true })).toBeVisible();
      await noPageScroll(page);
      expect(await clippedLabels(summary)).toEqual([]);
      if (name !== (en ? 'Top 20 equity' : '前 20 组权益'))
        await page.screenshot({
          path: info.outputPath(
            `G4-${language}-${name === (en ? 'Distribution' : '分布') ? 'distribution' : 'scatter'}.png`,
          ),
        });
    }
    const otherPanels: Record<string, string[]> = {};
    for (const name of [
      en ? 'Parameter map' : '参数图',
      en ? 'Sensitivity' : '影响度',
      en ? 'Settings' : '设置',
    ]) {
      await tabs.getByRole('tab', { name, exact: true }).click();
      await expect(tabs.getByRole('tab', { name, exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(summary).toBeVisible();
      await noPageScroll(page);
      otherPanels[name] = await clippedLabels(page.getByRole('tabpanel'));
      await page.screenshot({
        path: info.outputPath(`G4-${language}-tab-${Object.keys(otherPanels).length}.png`),
      });
    }
    const otherPanelReport = info.outputPath('other-phone-panels.json');
    await writeFile(otherPanelReport, JSON.stringify(otherPanels, null, 2));
    await info.attach('other-phone-panels.json', {
      path: otherPanelReport,
      contentType: 'application/json',
    });
    // Settings' data range wraps its dates on a phone, so no tab clips its text any more.
    for (const [name, clipped] of Object.entries(otherPanels)) expect(clipped, name).toEqual([]);
    await tabs.getByRole('tab', { name: en ? 'Leaderboard' : '排行', exact: true }).click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    const original = await page.evaluate(() =>
      (window as unknown as PhoneWindow).backtestHooks
        .backtest()
        .inputs.map((input) => input.value),
    );
    await view.click();
    await expect(
      page.getByText(en ? 'Current inputs are unchanged.' : '原参数未被修改。'),
    ).toBeVisible();
    await expect(page.getByTestId('price-chart')).toBeVisible();
    const back = page.getByRole('button', {
      name: en ? 'Back to optimization' : '返回优化',
      exact: true,
    });
    const setCurrent = page.getByRole('button', {
      name: en ? 'Set as current inputs' : '设为当前参数',
      exact: true,
    });
    await touchTarget(back);
    await touchTarget(setCurrent);
    await noPageScroll(page);
    expect(await clippedLabels(back.locator('xpath=../..'))).toEqual([]);
    const backtestTabs = page.getByRole('tablist', { name: en ? 'Backtest results' : '回测结果' });
    expect(
      (await page.getByTestId('price-chart').boundingBox())!.y +
        (await page.getByTestId('price-chart').boundingBox())!.height,
    ).toBeLessThanOrEqual((await backtestTabs.boundingBox())!.y);
    expect(
      await page.evaluate(() =>
        (window as unknown as PhoneWindow).backtestHooks
          .backtest()
          .inputs.map((input) => input.value),
      ),
    ).toEqual(original);
    await page.screenshot({ path: info.outputPath(`B16-phone-${language}.png`) });
    await back.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(summary).toBeVisible();
    expect(errors).toEqual([]);
  });
}

import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { parseCsv } from '@pine/market-data';
import { strategySource, syntheticBars } from '../src/workflows/test-support.ts';
import type { Language } from '../src/i18n/translate.ts';

// Use the dev server so tests can install synthetic input through the public stores without
// adding production globals or another shared Vite entry. The actual run uses the real Worker.
const app = 'http://127.0.0.1:5176';
const rapid = `//@version=6
strategy("Ten thousand trades", initial_capital=1000000, default_qty_value=1, margin_long=0, margin_short=0)
if bar_index % 2 == 0
    strategy.entry("L", strategy.long)
else
    strategy.entry("S", strategy.short)`;

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' || url.pathname.startsWith('/api/market')) await route.abort();
    else await route.continue();
  });
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
});

async function install(
  page: Page,
  language: Language = 'en',
  count = 2000,
  source = strategySource.replace(
    'strategy.percent_of_equity, default_qty_value=50',
    'strategy.fixed, default_qty_value=1',
  ),
) {
  await page.goto(app);
  await page.evaluate(
    async ({ language, source, bars }) => {
      const backtestPath = '/src/state/backtest.ts';
      const marketPath = '/src/state/marketData.ts';
      const uiPath = '/src/state/ui.ts';
      const { openScript } = (await import(
        backtestPath
      )) as typeof import('../src/state/backtest.ts');
      const { getMarketDataStore } = (await import(
        marketPath
      )) as typeof import('../src/state/marketData.ts');
      const { uiStore } = (await import(uiPath)) as typeof import('../src/state/ui.ts');
      uiStore.getState().setLanguage(language);
      uiStore.getState().setDockTab('report');
      openScript({ source, fileName: 'synthetic.pine', origin: { kind: 'file' } });
      getMarketDataStore()
        .getState()
        .actions.useCsv(
          {
            bars,
            timeframe: '60',
            syminfo: {
              ticker: 'SYNTH',
              type: 'crypto',
              mintick: 0.01,
              mincontract: 0.001,
              pointvalue: 1,
              timezone: 'Etc/UTC',
            },
          },
          'synthetic.csv',
        );
    },
    { language, source, bars: syntheticBars(count) },
  );
  return runReady(page);
}

async function runReady(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/state/backtest.ts';
        const { getBacktestStore } = (await import(
          path
        )) as typeof import('../src/state/backtest.ts');
        return getBacktestStore().getState().readiness.ok;
      }),
    )
    .toBe(true);
  return page.evaluate(async () => {
    const path = '/src/state/backtest.ts';
    const { getBacktestStore } = (await import(path)) as typeof import('../src/state/backtest.ts');
    await getBacktestStore().getState().actions.run();
    const state = getBacktestStore().getState();
    if (state.run.status !== 'done') throw new Error(JSON.stringify(state.run));
    return {
      trades: state.result!.output.trades.length,
      metrics: state.result!.output.metrics,
      firstEntry: state.result!.output.trades[0]?.entryTime,
    };
  });
}

async function selection(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/state/selection.ts';
    const { getSelectionStore } = (await import(
      path
    )) as typeof import('../src/state/selection.ts');
    const state = getSelectionStore().getState();
    return { hover: state.hoveredTrade, focus: state.focusedTrade?.trade };
  });
}

async function checkTextFits(page: Page) {
  const clipped = await page
    .locator('[data-outdated] th, [data-outdated] td, [role="columnheader"], [role="gridcell"]')
    .evaluateAll((cells) =>
      cells
        .filter((cell) => cell.scrollWidth > cell.clientWidth + 1)
        .map((cell) => cell.textContent),
    );
  expect(clipped).toEqual([]);
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(1440);
}

async function checkDockAction(page: Page, action: Locator) {
  await expect(action).toHaveCount(1);
  const button = (await action.boundingBox())!;
  const tabs = (await page.getByRole('tablist').boundingBox())!;
  expect(button.y).toBeGreaterThanOrEqual(tabs.y);
  expect(button.y + button.height).toBeLessThanOrEqual(tabs.y + tabs.height);
  await expect(page.getByRole('tabpanel').getByRole('button', { name: /CSV/ })).toHaveCount(0);
}

test('S1 keeps results, dialogs, the script menu, Optimize and Chinese out of the first load', async ({
  page,
}, info) => {
  const requested: Promise<{ file: string; bytes: number }>[] = [];
  page.on('response', (response) => {
    const file = new URL(response.url()).pathname;
    if (file.endsWith('.js'))
      requested.push(response.body().then((body) => ({ file, bytes: body.length })));
  });
  await page.goto('/');
  // S1 starts on Pine code. Its existing editor chunk is included in the browser total.
  await expect(page.getByRole('textbox', { name: 'Pine code editor' })).toBeVisible();
  for (const name of ['Equity', 'Trades', 'Report']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByText('Run a backtest to see results here.')).toBeVisible();
  }
  await page.waitForLoadState('networkidle');
  const scripts = await Promise.all(requested);
  const lazy =
    /(?:ReportTab|TradesTab|EquityTab|ResultChart|ResultFrame|Charts\.|trades-|Dialog-|ScriptMenuContent|OptimizePage|PreviewContent|\/sheet-|\/zh-)/;
  expect(scripts.map(({ file }) => file).filter((file) => lazy.test(file))).toEqual([]);
  // Measured with the Optimize setup merged and one catalog per language: 859,707 bytes in all,
  // 43,619 of them the English catalog, which loads before the first render, and 512,394 in the
  // entry. The budgets leave about 6 KB, less than the script menu (14 KB), the market data
  // dialog (19 KB) or the Chinese catalog (43 KB) would add if any loaded with the page again.
  const bytes = scripts.reduce((total, script) => total + script.bytes, 0);
  expect(bytes).toBeGreaterThan(0);
  expect(bytes).toBeLessThan(866000);
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const entryFiles = new Set(
    [...html.matchAll(/(?:src|href)="([^"\s]+\.js)"/g)].map((match) => match[1]),
  );
  const entryBytes = scripts
    .filter(({ file }) => entryFiles.has(file))
    .reduce((total, script) => total + script.bytes, 0);
  expect(entryBytes).toBeLessThan(518500);
  await writeFile(
    info.outputPath('s1-bundle.json'),
    JSON.stringify({ scripts, entryBytes, bytes }, null, 2),
  );
});

for (const language of ['en', 'zh'] as const) {
  test(`B1 B2 B5 B6: real result, filters, export and focus (${language})`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const result = await install(page, language);
    const label = (en: string, zh: string) => (language === 'en' ? en : zh);
    await expect(page.getByRole('tabpanel').getByRole('table')).toHaveCount(3);
    await expect(page.getByText('Net profit', { exact: true })).toHaveCount(2);
    const reportAction = page.getByRole('button', {
      name: label('Export report CSV', '导出报告 CSV'),
    });
    await checkDockAction(page, reportAction);
    const reportDownload = page.waitForEvent('download');
    await reportAction.click();
    const reportFile = await reportDownload;
    expect(reportFile.suggestedFilename()).toBe('report.csv');
    const reportCsv = await readFile((await reportFile.path())!, 'utf8');
    expect(reportCsv).toContain(
      label('Key figures,,,\r\nMetric,All,Long,Short', '关键指标,,,\r\n指标,全部,多头,空头'),
    );
    expect(reportCsv).toContain('Net profit,');
    expect(reportCsv).toContain('Average profit / average loss,');
    await page.screenshot({ path: info.outputPath(`B1-${language}.png`) });
    await checkTextFits(page);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1440);

    await page.getByRole('tab', { name: label('Equity', '权益'), exact: true }).click();
    await expect(page.getByTestId('equity-charts')).toBeVisible();
    await expect(page.getByText(label('Winning / losing days', '盈利日 / 亏损日'))).toBeVisible();
    await page.getByRole('button', { name: label('Percent', '百分比'), exact: true }).click();
    await expect(
      page.getByRole('button', { name: label('Percent', '百分比'), exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: label('Amount', '金额'), exact: true }).click();
    await page.screenshot({ path: info.outputPath(`B5-${language}.png`) });
    await page.getByRole('button', { name: label('Maximize panel', '最大化面板') }).click();
    await expect(
      page.getByRole('button', { name: label('Restore panel', '还原面板') }),
    ).toBeVisible();
    await page.getByRole('button', { name: label('Restore panel', '还原面板') }).click();

    await page
      .getByRole('tab', { name: language === 'en' ? /^Trades \d+$/ : /^成交 \d+$/ })
      .click();
    const tradeAction = page.getByRole('button', {
      name: label('Export trades CSV', '导出成交 CSV'),
    });
    await checkDockAction(page, tradeAction);
    await expect(reportAction).toHaveCount(0);
    await page.getByRole('button', { name: label('Collapse panel', '收起面板') }).click();
    await expect(tradeAction).toHaveCount(0);
    await page.getByRole('button', { name: label('Expand panel', '展开面板') }).click();
    await checkDockAction(page, tradeAction);
    const grid = page.getByRole('grid');
    await expect(grid).toHaveAttribute('aria-rowcount', String(result.trades + 1));
    await expect(page.locator('[data-trade]').first()).toHaveAttribute(
      'data-trade',
      String(result.trades),
    );
    await page.screenshot({ path: info.outputPath(`B2-${language}.png`) });
    await checkTextFits(page);
    const row = page.locator('[data-trade]').nth(2);
    const number = Number(await row.getAttribute('data-trade'));
    const chart = page.getByTestId('price-chart');
    const canvas = chart.locator('canvas').first();
    const amberPixels = () =>
      canvas.evaluate((canvas: HTMLCanvasElement) => {
        const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        let count = 0;
        for (let i = 0; i < data.length; i += 4)
          if (data[i] > 220 && data[i + 1] > 130 && data[i + 1] < 190 && data[i + 2] < 90) count++;
        return count;
      });
    const beforeHover = await amberPixels();
    await row.hover();
    await expect.poll(() => selection(page)).toEqual({ hover: number });
    await expect(page.getByTestId('trade-detail')).toContainText(`#${number}`);
    await expect.poll(amberPixels).toBeGreaterThan(beforeHover + 10);
    await page.getByRole('tab', { name: label('Report', '报告'), exact: true }).hover();
    await expect(page.getByTestId('trade-detail')).toHaveCount(0);
    await expect.poll(amberPixels).toBe(beforeHover);
    await row.click();
    await expect.poll(async () => (await selection(page)).focus).toBe(number);
    await expect(chart).toHaveAttribute('data-focused-trade', String(number));
    await expect(row).toHaveAttribute('data-focused', 'true');
    await page.screenshot({ path: info.outputPath(`B6-${language}.png`) });
    await grid.press('ArrowDown');
    await grid.press('Enter');
    await expect.poll(async () => (await selection(page)).focus).toBe(number - 1);
    await expect(chart).toHaveAttribute('data-focused-trade', String(number - 1));

    // Trade #1 lies outside the initial recent window. Clicking it must move the real candles,
    // not just publish a selection or show a tooltip for an offscreen trade.
    await grid.press('End');
    const first = page.locator('[data-trade="1"]');
    await first.hover();
    await expect(page.getByTestId('trade-detail').locator('strong')).toContainText('#1 ');
    await expect.poll(amberPixels).toBe(0);
    const beforeFocus = await canvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await first.click();
    await expect(chart).toHaveAttribute('data-focused-trade', '1');
    await expect
      .poll(() => canvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()))
      .not.toBe(beforeFocus);
    await expect.poll(amberPixels).toBeGreaterThan(10);
    const entryDate = new Date(result.firstEntry! * 1000)
      .toISOString()
      .slice(0, 10)
      .split('-')
      .reverse()
      .join('/');
    await expect(chart.locator('div').first()).toContainText(entryDate);
    await page.screenshot({ path: info.outputPath(`B6-first-trade-${language}.png`) });

    await page.getByRole('radio', { name: label('Short', '空'), exact: true }).click();
    await page.getByRole('combobox', { name: label('P&L filter', '盈亏筛选') }).click();
    await page.getByRole('option', { name: label('Profitable', '盈利'), exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: label('Export trades CSV', '导出成交 CSV') }).click();
    const download = await downloadPromise;
    const csv = await readFile((await download.path())!, 'utf8');
    expect(csv).toContain(label('#,Side,Entry UTC', '#,方向,入场 UTC'));
    const lines = csv.trim().split('\r\n').slice(1);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const fields = line.split(',');
      expect(fields[1]).toBe(label('Short', '空'));
      expect(Number(fields[7])).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
  });
}

async function loadRecordedExample(page: Page, language: Language) {
  const now = new Date('2026-09-01T00:00:00Z');
  await page.clock.setFixedTime(now);
  // Official TradingView BTCUSDT hourly OHLCV; plot columns are ignored by parseCsv.
  const recorded = parseCsv(
    await readFile(
      new URL(
        '../../../packages/golden/fixtures/indicator/v6/M_time__btcusdt_60/data.csv',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  let requests = 0;
  await page.route('**/api/market/bars?*', async (route) => {
    requests++;
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('symbol')).toBe('BTCUSDT');
    expect(query.get('timeframe')).toBe('60');
    const from = Number(query.get('from'));
    const to = Number(query.get('to'));
    await route.fulfill({
      json: {
        input: {
          bars: recorded.bars.filter((bar) => bar.time >= from && bar.time < to),
          timeframe: '60',
          syminfo: {
            tickerid: 'BINANCE:BTCUSDT',
            ticker: 'BTCUSDT',
            prefix: 'BINANCE',
            type: 'crypto',
            currency: 'USDT',
            basecurrency: 'BTC',
            timezone: 'Etc/UTC',
            mintick: 0.01,
            mincontract: 0.00001,
            pointvalue: 1,
            session: 'regular',
            session_hours: '0000-0000:1234567',
          },
        },
        fetchedAt: now.getTime(),
        profileEstimated: false,
      },
    });
  });
  await page.goto(app);
  await page.evaluate(async (language) => {
    const backtestPath = '/src/state/backtest.ts';
    const uiPath = '/src/state/ui.ts';
    const { loadExample } = (await import(
      backtestPath
    )) as typeof import('../src/state/backtest.ts');
    const { uiStore } = (await import(uiPath)) as typeof import('../src/state/ui.ts');
    uiStore.getState().setLanguage(language);
    uiStore.getState().setDockTab('report');
    await loadExample('trend-breakout');
  }, language);
  expect(requests).toBe(1);
  return runReady(page);
}

for (const language of ['en', 'zh'] as const) {
  test(`B5 recorded example: full range, hidden mount, resize and retained zoom (${language})`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const result = await loadRecordedExample(page, language);
    expect(result.trades).toBeGreaterThan(300);
    const label = (en: string, zh: string) => (language === 'en' ? en : zh);
    const hidden = await page.addStyleTag({
      content: `[data-testid="equity-charts"] { ${language === 'en' ? 'display:none' : 'width:0'} !important; }`,
    });
    await page.getByRole('tab', { name: label('Equity', '权益'), exact: true }).click();
    const charts = page.getByTestId('equity-charts');
    await expect(charts).toHaveCount(1);
    await expect(charts.locator('canvas').first()).toBeAttached();
    await hidden.evaluate((element) => element.parentNode!.removeChild(element));
    const calendar = page.getByTestId('pnl-calendar');
    const monthlyReturns = charts.getByRole('img', {
      name: /^(Monthly and yearly returns|每月及年度收益)$/,
    });
    const months = monthlyReturns.locator('svg > text[y="13"][visibility="visible"]');
    const projection = () =>
      calendar.evaluate((svg) => {
        const cells = svg.querySelectorAll('rect');
        const width = Number(svg.querySelector('svg')!.getAttribute('width'));
        const x = (index: number) => Number(cells[index].getAttribute('x')) / width;
        return { first: x(0), week: x(7) - x(0) };
      });
    await expect(months).toHaveCount(24);
    await expect(calendar.locator('rect')).toHaveCount(730);
    await expect
      .poll(async () => Number(await calendar.locator('rect').first().getAttribute('width')))
      .toBeLessThan(10);
    const full = await projection();
    expect(full.week).toBeGreaterThan(0.009);
    expect(full.week).toBeLessThan(0.01);
    const toolbar = await charts
      .getByRole('button', { name: label('Amount', '金额'), exact: true })
      .boundingBox();
    const facts = await charts.getByText(label('Ending equity', '期末权益')).boundingBox();
    const equityPane = charts.getByRole('group', { name: /^(Equity chart|权益图)/ });
    const drawdownPane = charts.getByRole('group', { name: /^(Drawdown chart|回撤图)/ });
    const pane = await equityPane.boundingBox();
    expect(toolbar!.y + toolbar!.height).toBeLessThan(facts!.y);
    expect(facts!.y + facts!.height).toBeLessThan(pane!.y);
    const overflow = await charts.evaluate((element: HTMLElement) => {
      const overflows = [];
      for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement)
        if (parent.scrollHeight > parent.clientHeight + 1) overflows.push(parent.className);
      return overflows;
    });
    expect(overflow).toEqual([]);
    expect(
      await monthlyReturns.evaluate((svg) => svg.getBoundingClientRect().bottom),
    ).toBeLessThanOrEqual(900);
    await checkTextFits(page);
    await page.screenshot({ path: info.outputPath(`equity-example-${language}.png`) });
    const recording = JSON.stringify({
      from: '2024-09-01',
      to: '2026-09-01',
      bars: 17520,
      trades: result.trades,
    });
    await writeFile(info.outputPath('recorded-example.json'), recording);
    await info.attach('recorded-example', {
      body: recording,
      contentType: 'application/json',
    });

    await page.setViewportSize({ width: 1600, height: 960 });
    await expect.poll(async () => (await projection()).week).toBeCloseTo(full.week, 4);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(months).toHaveCount(24);
    const drawdownBefore = await drawdownPane
      .locator('canvas')
      .first()
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await equityPane.press('+');
    await expect.poll(async () => (await projection()).week).toBeGreaterThan(full.week * 1.2);
    const zoom = await projection();
    await expect
      .poll(() =>
        drawdownPane
          .locator('canvas')
          .first()
          .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
      )
      .not.toBe(drawdownBefore);
    await charts.getByRole('button', { name: label('Percent', '百分比'), exact: true }).click();
    await expect.poll(async () => (await projection()).week).toBeCloseTo(zoom.week, 4);
    await page.setViewportSize({ width: 1600, height: 960 });
    await expect.poll(async () => (await projection()).week).toBeCloseTo(zoom.week, 4);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(async () => {
      const path = '/src/state/ui.ts';
      const { uiStore } = (await import(path)) as typeof import('../src/state/ui.ts');
      uiStore.getState().setLanguage(uiStore.getState().language === 'en' ? 'zh' : 'en');
    });
    await expect.poll(async () => (await projection()).week).toBeCloseTo(zoom.week, 4);
    await page.getByRole('tab', { name: /^(Report|报告)$/ }).click();
    await page.getByRole('tab', { name: /^(Equity|权益)$/ }).click();
    await expect.poll(async () => (await projection()).week).toBeCloseTo(zoom.week, 4);
    await expect.poll(async () => (await projection()).first).toBeCloseTo(zoom.first, 3);
    await runReady(page);
    await expect.poll(async () => (await projection()).week).toBeCloseTo(full.week, 4);
    await expect(months).toHaveCount(24);
    await equityPane.press('+');
    await expect.poll(async () => (await projection()).week).toBeGreaterThan(full.week * 1.2);
    await charts.getByRole('button', { name: /^(Reset zoom|重置缩放)$/ }).click();
    await expect.poll(async () => (await projection()).week).toBeCloseTo(full.week, 4);
    // Pointer input on the lower pane drives the same time axis as keyboard input above.
    await drawdownPane.hover();
    await page.mouse.wheel(0, -150);
    await expect.poll(async () => (await projection()).week).toBeGreaterThan(full.week);
    const wheeled = await projection();
    await charts.getByRole('button', { name: /^(Amount|金额)$/, exact: true }).click();
    await expect.poll(async () => (await projection()).week).toBeCloseTo(wheeled.week, 4);
    expect(errors).toEqual([]);
  });
}

test('B9 outdated results remain visible, and B12 shows zero trades', async ({ page }, info) => {
  await install(page);
  const figure = await page.getByRole('table', { name: 'Returns' }).innerText();
  const length = page.getByRole('spinbutton', { name: 'Length', exact: true });
  await length.fill('10');
  const notice = page.getByRole('status').filter({ hasText: 'Current results use Length 5.' });
  await expect(notice).toHaveCount(1);
  await expect(notice).toBeVisible();
  await expect(page.getByRole('tabpanel').getByRole('status')).toHaveCount(1);
  await expect(page.getByText('Current results use Length 5.', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Results outdated', { exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Last run')).toHaveText('Results outdated');
  await expect(page.locator('[data-outdated="true"] [data-dimmed="true"]')).toHaveCSS(
    'opacity',
    '0.4',
  );
  const changedDot = page
    .locator('label')
    .filter({ hasText: /^Length$/ })
    .locator('span');
  await expect(changedDot).toBeVisible();
  await expect(changedDot).toHaveCSS('width', '6px');
  await expect(changedDot).toHaveCSS('background-color', 'rgb(242, 163, 58)');
  await expect(page.getByText('Default 5', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('B9-integrated-en.png') });
  expect(await page.getByRole('table', { name: 'Returns' }).innerText()).toBe(figure);
  await page.getByRole('button', { name: 'Restore result inputs' }).click();
  await expect(notice).toHaveCount(0);
  await expect(changedDot).toHaveCount(0);
  await expect(page.getByLabel('Last run')).toContainText('2,000 bars');
  await expect(page.locator('[data-dimmed="true"]')).toHaveCount(0);
  await install(
    page,
    'en',
    120,
    '//@version=6\nstrategy("No trades", initial_capital=10000)\nplot(close)',
  );
  await expect(
    page
      .getByRole('table', { name: 'Trades' })
      .getByRole('row')
      .filter({ hasText: 'Total trades' }),
  ).toHaveText('Total trades000');
  await page.getByRole('tab', { name: /^Trades 0$/ }).click();
  await expect(page.getByText('No trades in the selected range')).toBeVisible();
});

test('10,000 engine trades scroll with bounded DOM and short tasks', async ({ page }, info) => {
  test.setTimeout(90000);
  const result = await install(page, 'en', 10001, rapid);
  expect(result.trades).toBe(10000);
  await page.getByRole('tab', { name: /^Trades \d+$/ }).click();
  const grid = page.getByRole('grid');
  await expect(grid).toHaveAttribute('aria-rowcount', '10001');
  await expect(page.locator('[data-trade="10000"]')).toBeVisible();
  const performance = await grid.evaluate(async (element) => {
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await nextFrame();
    await nextFrame();
    const tasks: number[] = [];
    const observer = new PerformanceObserver((entries) =>
      tasks.push(...entries.getEntries().map((entry) => entry.duration)),
    );
    observer.observe({ type: 'longtask' });
    let maximumRows = 0;
    for (let step = 1; step <= 30; step++) {
      element.scrollTop = (step / 30) * element.scrollHeight;
      await nextFrame();
      await nextFrame();
      maximumRows = Math.max(maximumRows, element.querySelectorAll('[data-trade]').length);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    tasks.push(...observer.takeRecords().map((entry) => entry.duration));
    observer.disconnect();
    return { tasks, maximumRows };
  });
  await info.attach('scroll-performance', {
    body: JSON.stringify(performance),
    contentType: 'application/json',
  });
  await writeFile(info.outputPath('scroll-performance.json'), JSON.stringify(performance));
  expect(performance.maximumRows).toBeLessThan(40);
  // A long task is any main-thread task over 50 ms. Scrolling the 30 steps through the dev
  // server's React stays free of them on a desktop, but slower runners see some: up to 114 ms
  // under 6× CPU throttling. Rendering all 10,000 rows instead costs about 550 ms per step
  // unthrottled (3.3 s at 4×), so no task may reach 250 ms.
  expect(Math.max(0, ...performance.tasks)).toBeLessThan(250);
  await expect(page.locator('[data-trade="1"]')).toBeVisible();
  await grid.press('Home');
  await grid.press('Enter');
  await expect.poll(async () => (await selection(page)).focus).toBe(10000);
  await grid.press('End');
  await grid.press('Enter');
  await expect.poll(async () => (await selection(page)).focus).toBe(1);
  const last = await page.locator('[data-trade="1"]').boundingBox();
  const viewport = await grid.boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1);
});

test('capture B1 B2 B5 B6 references in both languages with local fonts', async ({
  page,
}, info) => {
  for (const language of ['en', 'zh'] as const) {
    for (const board of ['Main', 'B2', 'B5', 'B6']) {
      const source = (
        await readFile(
          new URL(
            `../../../docs/web-mock-terminal/artboards/${board}${language === 'en' ? '-en' : ''}.dc.html`,
            import.meta.url,
          ),
          'utf8',
        )
      )
        .replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/g, '')
        .replace(/<script[^>]+support\.js[^>]*><\/script>/g, '');
      await page.goto(app);
      await page.setContent(source);
      await page.addStyleTag({ url: '/src/styles/fonts.css?direct' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: info.outputPath(`${board}-reference-${language}.png`) });
    }
  }
});

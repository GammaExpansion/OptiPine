import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { origins } from './ports.ts';

test.use({ baseURL: origins.preview });

test('charts render, synchronize, focus trades, switch panes and handle 100,000 bars', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  expect(existsSync(new URL('../dist/charts.html', import.meta.url))).toBe(false);
  expect(existsSync(new URL('../.e2e-dist/charts.html', import.meta.url))).toBe(true);
  await page.addInitScript(() => {
    const labels = new WeakMap<HTMLCanvasElement, string[]>();
    (window as unknown as { chartLabels: typeof labels }).chartLabels = labels;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      const recent = labels.get(this.canvas) ?? [];
      recent.push(args[0]);
      if (recent.length > 500) recent.shift();
      labels.set(this.canvas, recent);
      original.apply(this, args);
    };
    const triangles = new WeakMap<HTMLCanvasElement, Set<string>>();
    (window as unknown as { chartTriangles: typeof triangles }).chartTriangles = triangles;
    const paths = new WeakMap<CanvasRenderingContext2D, number>();
    const begin = CanvasRenderingContext2D.prototype.beginPath;
    const move = CanvasRenderingContext2D.prototype.moveTo;
    const line = CanvasRenderingContext2D.prototype.lineTo;
    const fill = CanvasRenderingContext2D.prototype.fill;
    CanvasRenderingContext2D.prototype.beginPath = function () {
      paths.set(this, 0);
      begin.call(this);
    };
    CanvasRenderingContext2D.prototype.moveTo = function (...args) {
      paths.set(this, (paths.get(this) ?? 0) + 1);
      move.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.lineTo = function (...args) {
      paths.set(this, (paths.get(this) ?? 0) + 1);
      line.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.fill = function (
      pathOrRule?: Path2D | CanvasFillRule,
      rule?: CanvasFillRule,
    ) {
      if (paths.get(this) === 3) {
        const colors = triangles.get(this.canvas) ?? new Set<string>();
        colors.add(String(this.fillStyle));
        triangles.set(this.canvas, colors);
      }
      Reflect.apply(
        fill,
        this,
        pathOrRule === undefined
          ? []
          : typeof pathOrRule === 'string'
            ? [pathOrRule]
            : [pathOrRule, rule],
      );
    };
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/charts.html');
  await expect(page.getByTestId('price-chart')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId('price-chart').locator('canvas').first()).toBeVisible();
  const priceChart = page.getByTestId('price-chart');
  await expect(priceChart.locator('a[href*="tradingview.com"]')).toBeVisible();
  await expect(page.locator('a[href*="tradingview.com"]')).toHaveCount(1);
  await expect(page.getByTestId('equity-charts').locator('a[href*="tradingview.com"]')).toHaveCount(
    0,
  );
  await expect(priceChart).toContainText('O 97,048.25');
  await expect(priceChart).toContainText('C 96,976.73');
  await expect(priceChart.locator('span').filter({ hasText: /^Basis / })).toHaveCSS(
    'color',
    'rgb(8, 153, 129)',
  );
  await expect(priceChart.locator('span').filter({ hasText: /^Upper / })).toHaveCSS(
    'color',
    'rgb(120, 123, 134)',
  );
  await expect(priceChart.locator('span').filter({ hasText: /^Lower / })).toHaveCSS(
    'color',
    'rgb(120, 123, 134)',
  );
  const renderedText = () =>
    priceChart.evaluate((root) => {
      const { chartLabels } = window as unknown as {
        chartLabels: WeakMap<HTMLCanvasElement, string[]>;
      };
      return [...root.querySelectorAll('canvas')].flatMap(
        (canvas) => chartLabels.get(canvas) ?? [],
      );
    });
  await expect.poll(renderedText).toContain('96,976.73');
  await expect
    .poll(async () => (await renderedText()).some((value) => /^9[0-9],\d{3}$/.test(value)))
    .toBe(true);
  await expect
    .poll(() =>
      page.getByRole('group', { name: /^Drawdown chart/ }).evaluate((root) => {
        const { chartLabels } = window as unknown as {
          chartLabels: WeakMap<HTMLCanvasElement, string[]>;
        };
        return [...root.querySelectorAll('canvas')]
          .flatMap((canvas) => chartLabels.get(canvas) ?? [])
          .some((label) => /^−[\d,.]+k$/.test(label));
      }),
    )
    .toBe(true);
  expect(
    await page
      .getByTestId('price-chart')
      .locator('canvas')
      .first()
      .evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = new Set<number>();
        for (let i = 0; i < pixels.length; i += 4)
          colors.add(pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2]);
        return colors.size;
      }),
  ).toBeGreaterThan(10);
  await expect(page.getByTestId('pnl-calendar').locator('rect')).toHaveCount(854);
  const daily = page.getByTestId('pnl-calendar').locator('rect').first();
  expect(Number(await daily.getAttribute('width'))).toBeLessThan(10);
  expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBe(1440);
  await page.screenshot({ path: info.outputPath('B1-B5-charts-en.png') });
  await page.getByTestId('equity-charts').screenshot({ path: info.outputPath('B5-equity-en.png') });
  await page.getByRole('spinbutton', { name: 'Trade number' }).fill('5');
  await page.getByRole('button', { name: 'Focus trade', exact: true }).click();
  await expect(page.getByTestId('price-chart')).toHaveAttribute('data-focused-trade', '5');
  await expect(page.getByTestId('trade-detail')).toContainText('#5');
  await expect(page.getByTestId('trade-detail')).toContainText('Entry');
  await page.screenshot({ path: info.outputPath('B6-charts-en.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('trade-detail')).toHaveCount(0);
  await page.getByRole('group', { name: /^BTCUSDT price chart/ }).press('ArrowLeft');
  const ddCanvas = page
    .getByRole('group', { name: /^Drawdown chart/ })
    .locator('canvas')
    .nth(1);
  const eqCanvas = page
    .getByRole('group', { name: /^Equity chart/ })
    .locator('canvas')
    .nth(1);
  const pixels = (canvas: HTMLCanvasElement) => canvas.toDataURL();
  const ddBefore = await ddCanvas.evaluate(pixels);
  const eqBounds = (await eqCanvas.boundingBox())!;
  await page.mouse.move(eqBounds.x + 200, eqBounds.y + 60);
  await expect.poll(() => ddCanvas.evaluate(pixels)).not.toBe(ddBefore);
  const eqBefore = await eqCanvas.evaluate(pixels);
  const ddBounds = (await ddCanvas.boundingBox())!;
  await page.mouse.move(ddBounds.x + 400, ddBounds.y + 25);
  await expect.poll(() => eqCanvas.evaluate(pixels)).not.toBe(eqBefore);
  const ddBase = page
    .getByRole('group', { name: /^Drawdown chart/ })
    .locator('canvas')
    .first();
  const beforeZoom = await ddBase.evaluate(pixels);
  await page.getByRole('group', { name: /^Equity chart/ }).press('+');
  await expect.poll(() => ddBase.evaluate(pixels)).not.toBe(beforeZoom);
  await page.getByRole('group', { name: /^Drawdown chart/ }).press('ArrowRight');
  await page.getByRole('button', { name: 'Reset zoom' }).click();
  await page.getByRole('button', { name: 'Percent', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Percent', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const calendar = page.getByTestId('pnl-calendar');
  await calendar.focus();
  await calendar.press('ArrowRight');
  await expect(calendar).toHaveAttribute('aria-label', /2023-01-09/);
  await page.getByRole('combobox', { name: 'Example strategy' }).selectOption('rsi-reversal');
  await expect(page.getByTestId('price-chart')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('price-chart')).toContainText('RSI');
  await expect(priceChart).toContainText('Exit level');
  await expect(priceChart).not.toContainText(/True|False|Buy|Sell/);
  await expect
    .poll(async () => {
      const indicatorTicks = (await renderedText())
        .filter((label) => /^[-−]?\d{1,3}$/.test(label))
        .map((label) => Number(label.replace('−', '-')));
      return (
        indicatorTicks.length >= 2 && indicatorTicks.every((tick) => tick >= -10 && tick <= 110)
      );
    })
    .toBe(true);
  await expect(page.locator('a[href*="tradingview.com"]')).toHaveCount(1);
  // Both force_overlay marker colours must occur in the price canvas, above the RSI pane.
  await expect
    .poll(() =>
      priceChart
        .locator('canvas')
        .first()
        .evaluate((canvas: HTMLCanvasElement) => {
          const pixels = canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          let buy = false;
          let sell = false;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] === 0 && pixels[i + 1] === 230 && pixels[i + 2] === 118) buy = true;
            if (pixels[i] === 242 && pixels[i + 1] === 54 && pixels[i + 2] === 69) sell = true;
          }
          return buy && sell;
        }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      priceChart
        .locator('canvas')
        .first()
        .evaluate((canvas: HTMLCanvasElement) => {
          const { chartTriangles } = window as unknown as {
            chartTriangles: WeakMap<HTMLCanvasElement, Set<string>>;
          };
          const colors = chartTriangles.get(canvas);
          return colors?.has('#00e676') && colors.has('#f23645');
        }),
    )
    .toBe(true);
  await expect(page.locator('[class*="drawdownShade"]')).toBeVisible();
  expect(await page.getByTestId('price-chart').locator('canvas').count()).toBeGreaterThan(6);
  await page.screenshot({ path: info.outputPath('B7-charts-en.png') });
  await page.getByRole('group', { name: /^BTCUSDT price chart/ }).press('+');
  await page.getByRole('group', { name: /^BTCUSDT price chart/ }).press('+');
  await page.screenshot({ path: info.outputPath('B7-signals-detail-en.png') });
  await page.getByRole('combobox', { name: 'Language' }).selectOption('zh');
  await expect(page.getByTestId('price-chart')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: info.outputPath('B7-charts-zh.png') });
  await page.getByRole('combobox', { name: '语言' }).selectOption('en');
  await page.getByRole('combobox', { name: 'Synthetic hourly bars' }).selectOption('100000');
  await expect(page.getByTestId('price-chart')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.charts-dev-status')).toContainText('100,000 bars');
  const before = performance.now();
  await page.getByRole('button', { name: 'Focus trade', exact: true }).click();
  await expect(page.getByTestId('trade-detail')).toBeVisible();
  expect(performance.now() - before).toBeLessThan(2000);
  expect(errors).toEqual([]);
  expect(workers.length).toBeGreaterThan(0);
  expect(workers.every((url) => /\/assets\/.*\.js$/.test(url))).toBe(true);
});

test('equity supplies the single attribution when the price chart is absent', async ({ page }) => {
  await page.goto('/charts.html?view=equity');
  await expect(page.getByTestId('equity-charts')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('price-chart')).toHaveCount(0);
  await expect(page.locator('a[href*="tradingview.com"]')).toHaveCount(1);
  await expect(
    page.getByRole('group', { name: /^Equity chart/ }).locator('a[href*="tradingview.com"]'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Percent', exact: true }).click();
  await expect(page.locator('a[href*="tradingview.com"]')).toHaveCount(1);
  await expect(
    page.getByRole('group', { name: /^Drawdown chart/ }).locator('a[href*="tradingview.com"]'),
  ).toHaveCount(0);
});

test('capture the four English reference boards at the review viewport', async ({ page }, info) => {
  for (const board of ['Main', 'B5', 'B6', 'B7']) {
    const path = fileURLToPath(
      new URL(`../../../docs/web-mock-terminal/artboards/${board}-en.dc.html`, import.meta.url),
    );
    // Keep the local reference self-contained; its remote fonts are replaced by the app's local fonts.
    const source = readFileSync(path, 'utf8').replace(
      /<link[^>]+fonts\.googleapis\.com[^>]*>/g,
      '',
    );
    await page.goto(`${origins.dev}/`);
    await page.setContent(source);
    await page.addStyleTag({ url: '/src/styles/fonts.css?direct' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`${board}-reference-en.png`) });
  }
});

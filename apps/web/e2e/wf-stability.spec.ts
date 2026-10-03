import { expect, test, type Page } from '@playwright/test';
import type { OptimizationStoreState } from '../src/state/optimization.ts';
import type { installStabilityFixture } from '../src/pages/optimize/walkforward/stability/fixture-store.ts';

import { origins } from './ports.ts';

test.use({ baseURL: origins.dev });
type Hooks = Window & {
  wfState: () => OptimizationStoreState;
  wfFixture: ReturnType<typeof installStabilityFixture>;
};

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
  await page.goto('/');
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { getServices } = await load('/src/state/services.ts');
    await getServices().loadOptimization();
    const { getOptimizationStore } = await load('/src/state/optimization.ts');
    const { uiStore } = await load('/src/state/ui.ts');
    const { installStabilityFixture } = await load(
      '/src/pages/optimize/walkforward/stability/fixture-store.ts',
    );
    const hooks = window as unknown as Hooks;
    hooks.wfFixture = installStabilityFixture();
    hooks.wfState = () => getOptimizationStore().getState();
    // Mount the fixture in the real results slots without starting the Worker pool.
    getOptimizationStore().setState({
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
  await expect(
    page.getByRole('region', {
      name: language === 'en' ? 'Walk-forward stability' : '滚动前推稳定性',
    }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

async function pixels(page: Page) {
  return page.getByTestId('parameter-map').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (const value of data) hash = Math.imul(hash ^ value, 16777619);
    return hash >>> 0;
  });
}

for (const language of ['en', 'zh'] as const) {
  test(`W1/W3 fixture: tolerance, surfaces, window picks and layout (${language})`, async ({
    page,
  }, info) => {
    const errors = await open(page, language);
    const panel = page.getByRole('region', {
      name: language === 'en' ? 'Walk-forward stability' : '滚动前推稳定性',
    });
    await expect(panel.locator('svg circle')).toHaveCount(24);
    await expect(panel.getByText('W3', { exact: true })).toHaveAttribute('data-selected', 'true');
    await expect(
      panel.getByText(language === 'en' ? 'Common 26–28' : '共同区间 26–28'),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath(`W1-${language}.png`) });
    const tolerance = panel.getByRole('combobox', {
      name: language === 'en' ? 'Tolerance' : '容差',
    });
    await tolerance.click();
    await page.getByRole('option', { name: '5%', exact: true }).click();
    await expect(
      panel.getByText(language === 'en' ? 'No common range' : '无共同区间'),
    ).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as Hooks).wfFixture.calls)).toEqual([
      { action: 'tolerance', value: 0.05 },
    ]);
    await panel
      .getByRole('radio', { name: language === 'en' ? 'Window map' : '窗口参数图', exact: true })
      .click();
    await expect(page.getByTestId('parameter-map')).toBeVisible();
    const first = await pixels(page);
    await panel.getByRole('radio', { name: language === 'en' ? '6-win mean' : '6 窗平均' }).click();
    await expect.poll(() => pixels(page)).not.toBe(first);
    await page.screenshot({ path: info.outputPath(`W3-${language}.png`) });
    await panel
      .getByRole('combobox', { name: language === 'en' ? 'Window' : '窗口', exact: true })
      .click();
    await page.getByRole('option', { name: 'W6', exact: true }).click();
    expect(
      await page.evaluate(
        () => (window as unknown as Hooks).wfState().walkForward!.selection!.window.plan.index,
      ),
    ).toBe(5);
    await panel.getByRole('radio', { name: language === 'en' ? 'W6 IS' : 'W6 样本内' }).click();
    await page.getByTestId('parameter-map').focus();
    await page.keyboard.press('Home');
    await expect(panel.locator('p[role="status"]')).toContainText(
      language === 'en' ? 'IS' : '样本内',
    );
    // Hit a known pick using the renderer's own geometry, including its reversed Y axis.
    const point = await page.getByTestId('parameter-map').evaluate(async (element) => {
      const path = '/src/charts/optimize/geometry.ts';
      const { mapGeometry, cellRect, containsSelection } = await import(/* @vite-ignore */ path);
      const map = (window as unknown as Hooks).wfState().walkForward!.map!;
      const geometry = mapGeometry(map.panel);
      const layer = geometry.layers[0];
      const [index] = [...layer.cells].find(([, cell]) =>
        containsSelection(map.panel, cell, map.chosen[0].parameters),
      )!;
      const rect = cellRect(layer, index, Math.max(geometry.width, element.clientWidth));
      return { x: rect.x + 8, y: rect.y + 8 };
    });
    await page.getByTestId('parameter-map').click({ position: point });
    expect(
      await page.evaluate(
        () => (window as unknown as Hooks).wfState().walkForward!.selection!.window.plan.index,
      ),
    ).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const clipped = await panel.evaluate((root) =>
      [...root.querySelectorAll('button, p, span')]
        .filter((element) => {
          const html = element as HTMLElement;
          return html.clientWidth > 0 && html.scrollWidth > html.clientWidth + 1;
        })
        .map((element) => element.textContent),
    );
    expect(clipped).toEqual([]);
    expect(errors).toEqual([]);
  });
}

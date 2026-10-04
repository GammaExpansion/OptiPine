import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { en } from '../src/i18n/en.ts';
import { zh } from '../src/i18n/zh.ts';
import type { BacktestHooks } from './backtest-hooks.ts';
import type { OptimizeHooks } from './optimize-hooks.ts';
import { origins } from './ports.ts';

test.use({ baseURL: origins.preview });

const trend = readFileSync(new URL('../examples/trend-breakout.pine', import.meta.url), 'utf8');
type HookWindow = Window & { backtestHooks: BacktestHooks; optimizeHooks: OptimizeHooks };

/** WEB.md 8: the desktop reference, a tablet and a phone (G1–G4). */
const sizes = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'phone', width: 390, height: 844 },
] as const;
const states = ['S1', 'B1', 'O1', 'R1', 'W1'] as const;
type State = (typeof states)[number];

/** Collect the page's errors and open it in `language` at the app's first screen (S1) or the harness. */
async function open(page: Page, language: 'en' | 'zh', state: State) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript((language) => {
    localStorage.setItem('optipine.ui', JSON.stringify({ state: { language }, version: 1 }));
  }, language);
  if (state === 'S1') {
    await page.goto('/');
    await expect(page.getByRole('textbox')).toHaveCount(1);
    return errors;
  }
  await page.goto('/e2e/harness.html');
  await page.waitForFunction(() => 'backtestHooks' in window);
  await page.evaluate((source) => {
    const { backtestHooks } = window as unknown as HookWindow;
    backtestHooks.openScript({ source, fileName: 'trend_breakout.pine', origin: { kind: 'file' } });
    backtestHooks.useSyntheticData(4_000);
  }, trend);
  await page.waitForFunction(
    () => (window as unknown as HookWindow).backtestHooks.backtest().readiness.ok,
  );
  if (state === 'B1') {
    await page.evaluate(() =>
      (window as unknown as HookWindow).backtestHooks.backtest().actions.run(),
    );
    await page.waitForFunction(
      () => (window as unknown as HookWindow).backtestHooks.backtest().result !== null,
    );
    // The first result opens the Report (#6); its tab loads before anything is measured or clicked.
    await expect(page.getByText('Net profit', { exact: true }).first()).toBeVisible();
    return errors;
  }
  await page
    .getByRole('button', { name: language === 'en' ? 'Optimize' : '优化', exact: true })
    .click();
  // The page loads the optimization side as it opens; its hooks read it once O1 shows.
  await expect(
    page.getByRole('heading', {
      name: language === 'en' ? 'No optimization has run yet' : '尚未运行优化',
    }),
  ).toBeVisible();
  if (state === 'R1')
    await page.evaluate(() =>
      (window as unknown as HookWindow).optimizeHooks.runOne('Length', 18, 22),
    );
  if (state === 'W1')
    await page.evaluate(() =>
      (window as unknown as HookWindow).optimizeHooks.runWalkForward('Length', 18, 22),
    );
  return errors;
}

/**
 * Labels cut by the window or by a container that hides its overflow, and the page's own
 * horizontal scroll. Content inside a region that scrolls, such as code or a wide table, is not
 * clipped: it scrolls.
 */
/** Price legend entries the chart's own tools (trade markers, reset zoom) cover. */
function legendUnderTools() {
  const chart = document.querySelector('[data-testid="price-chart"]');
  if (!chart) return [];
  const tools = [...chart.parentElement!.querySelectorAll('button')]
    .filter((button) => !chart.contains(button))
    .map((button) => button.getBoundingClientRect());
  const entries = [...chart.firstElementChild!.querySelectorAll('span')].filter(
    (span) => !span.querySelector('span') && span.textContent?.trim(),
  );
  return entries
    .filter((entry) => {
      const box = entry.getBoundingClientRect();
      return tools.some(
        (tool) =>
          box.left < tool.right &&
          box.right > tool.left &&
          box.top < tool.bottom &&
          box.bottom > tool.top,
      );
    })
    .map((entry) => entry.textContent!.trim());
}

/** What the right panel's collapse chevron covers in the panel (bug bash #32). */
function collapseCovers() {
  const toggle = document.querySelector('aside > button[aria-expanded]');
  if (!toggle) return [];
  const box = toggle.getBoundingClientRect();
  const targets = toggle.parentElement!.querySelectorAll(
    'button, a, input, select, [role="radio"], [role="combobox"], h2, h3, label',
  );
  return [...targets]
    .filter((target) => {
      if (target === toggle || !target.textContent?.trim()) return false;
      const rect = target.getBoundingClientRect();
      return (
        rect.left < box.right &&
        rect.right > box.left &&
        rect.top < box.bottom &&
        rect.bottom > box.top
      );
    })
    .map((target) => target.textContent!.trim().slice(0, 40));
}

function layoutProblems() {
  const problems: string[] = [];
  const page = document.scrollingElement!;
  if (page.scrollWidth > window.innerWidth)
    problems.push(`page scrolls by ${page.scrollWidth - window.innerWidth} px`);
  const scrolls = (element: Element) => {
    const { overflowX } = getComputedStyle(element);
    return overflowX === 'auto' || overflowX === 'scroll';
  };
  const labels = document.querySelectorAll(
    'button, a, label, h1, h2, h3, th, [role="tab"], [role="radio"], select, input',
  );
  for (const label of labels) {
    const rect = label.getBoundingClientRect();
    // Hidden, visually hidden for assistive technology only, or code, which scrolls.
    if (rect.width <= 1 || rect.height <= 1) continue;
    if (label.closest('[aria-hidden="true"], .cm-editor')) continue;
    const name = `${label.tagName.toLowerCase()} "${(label.textContent || label.getAttribute('aria-label') || '').trim().slice(0, 40)}"`;
    let clipper: Element | null = null;
    for (let parent = label.parentElement; parent && !clipper; parent = parent.parentElement) {
      if (scrolls(parent)) break;
      if (getComputedStyle(parent).overflowX === 'hidden') clipper = parent;
    }
    const bounds = clipper?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth };
    const scrolled = (() => {
      for (let parent = label.parentElement; parent; parent = parent.parentElement)
        if (scrolls(parent)) return true;
      return false;
    })();
    if (!scrolled && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1))
      problems.push(`${name} is cut at ${Math.round(rect.left)}–${Math.round(rect.right)} px`);
    if (
      getComputedStyle(label).overflowX !== 'visible' &&
      label.tagName !== 'INPUT' &&
      label.scrollWidth > label.clientWidth + 1
    )
      problems.push(`${name} overflows its own box`);
  }
  return problems;
}

for (const language of ['en', 'zh'] as const)
  for (const size of sizes)
    test(`${size.name} ${size.width} × ${size.height} in ${language}: no cut labels or page scroll`, async ({
      page,
    }, info) => {
      test.slow();
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const state of states) {
        await page.goto('about:blank');
        const errors = await open(page, language, state);
        await page.evaluate(() => document.fonts.ready);
        if (state === 'R1' || state === 'W1')
          await page.waitForFunction(
            (walkForward) => {
              const run = (window as unknown as HookWindow).optimizeHooks.state();
              return run.run === 'done' && (!walkForward || run.walkForwardSettled);
            },
            state === 'W1',
            { timeout: 60_000 },
          );
        await page.waitForTimeout(300);
        await page.screenshot({ path: info.outputPath(`${state}-${size.name}-${language}.png`) });
        expect(await page.evaluate(layoutProblems), state).toEqual([]);
        // On a phone the legend wraps before the chart's tools rather than under them (#30).
        if (state === 'B1') expect(await page.evaluate(legendUnderTools)).toEqual([]);
        // The right panel's collapse chevron covers none of its rows (#32).
        expect(await page.evaluate(collapseCovers), state).toEqual([]);
        // A phone shows W1's Windows and Stability one per tab under the stitched equity (G4).
        if (state === 'W1' && size.name === 'phone')
          for (const tab of ['windows', 'stability'] as const) {
            const copy = language === 'en' ? en : zh;
            await page.getByRole('tab', { name: copy[`layout.${tab}`], exact: true }).click();
            await page.waitForTimeout(300);
            await page.screenshot({ path: info.outputPath(`W1-${tab}-phone-${language}.png`) });
            expect(await page.evaluate(layoutProblems), `W1 ${tab}`).toEqual([]);
            // The stitched equity's view switch and the window's View backtest are touch targets.
            for (const target of [
              page.getByRole('radio', { name: copy['optimize.wfResults.stitched'], exact: true }),
              page.getByRole('button', {
                name: copy['optimize.wfResults.viewBacktest'],
                exact: true,
              }),
            ])
              expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          }
        expect(errors, state).toEqual([]);
      }
    });

test('a tablet opens the right panel as a drawer, and Escape or a press outside closes it (G2)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const errors = await open(page, 'en', 'B1');
  await expect(page.getByRole('complementary', { name: 'Right panel' })).toHaveCount(0);
  const toggle = page.getByRole('button', { name: 'Right panel' });
  await toggle.click();
  const drawer = page.getByRole('dialog', { name: 'Right panel' });
  await expect(drawer.getByRole('spinbutton', { name: 'Length' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('G2-drawer-en.png') });
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  await page.keyboard.press('Tab');
  await expect(drawer.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await expect(drawer).toBeVisible();
  // Radix listens for a press outside from a task queued as the drawer opens; a busy page can
  // take the click first, so the click waits for a task queued after it.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await page.mouse.click(200, 300);
  await expect(drawer).toHaveCount(0);
  // The Optimize page's setup is the same panel.
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  await toggle.click();
  await expect(
    page.getByRole('dialog', { name: 'Right panel' }).getByText('Search ranges'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('a phone switches the Backtest and Optimize tabs (G3, G4)', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page, 'en', 'B1');
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByText('Net profit').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('G3-en.png') });
  await page.getByRole('tab', { name: 'Inputs' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Length' })).toBeVisible();
  const run = page.getByRole('button', { name: 'Run', exact: true });
  expect((await run.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByRole('region', { name: 'Optimization run' })).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as HookWindow).optimizeHooks.runOne('Length', 18, 22),
  );
  await page.getByRole('tab', { name: 'Leaderboard' }).click();
  await page.screenshot({ path: info.outputPath('G4-en.png') });
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  expect(errors).toEqual([]);
});

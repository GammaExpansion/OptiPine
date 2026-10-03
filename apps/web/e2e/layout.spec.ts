import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
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
const states = ['S1', 'B1', 'O1', 'R1'] as const;
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
    return errors;
  }
  await page
    .getByRole('button', { name: language === 'en' ? 'Optimize' : '优化', exact: true })
    .click();
  if (state === 'R1')
    await page.evaluate(() =>
      (window as unknown as HookWindow).optimizeHooks.runOne('Length', 18, 22),
    );
  return errors;
}

/**
 * Labels cut by the window or by a container that hides its overflow, and the page's own
 * horizontal scroll. Content inside a region that scrolls, such as code or a wide table, is not
 * clipped: it scrolls.
 */
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
        if (state === 'R1')
          await page.waitForFunction(
            () => (window as unknown as HookWindow).optimizeHooks.state().run === 'done',
            null,
            { timeout: 60_000 },
          );
        await page.waitForTimeout(300);
        await page.screenshot({ path: info.outputPath(`${state}-${size.name}-${language}.png`) });
        expect(await page.evaluate(layoutProblems), state).toEqual([]);
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

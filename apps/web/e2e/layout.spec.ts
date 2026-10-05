import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { catalogs } from '../src/i18n/catalogs.ts';
import type { BacktestHooks } from './backtest-hooks.ts';
import type { OptimizeHooks } from './optimize-hooks.ts';
import { origins } from './ports.ts';
import { installMarketFixtures } from './market-fixtures.ts';

const { en, zh } = catalogs;

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
  for (const list of document.querySelectorAll('[role="tablist"]')) {
    const rect = list.getBoundingClientRect();
    if (!rect.width || !rect.height || list.closest('[aria-hidden="true"]')) continue;
    const name = `tablist "${list.getAttribute('aria-label')}"`;
    const { overflowX, overflowY } = getComputedStyle(list);
    // Overlay scrollbars must not hide the regression: neither axis may scroll or clip tabs.
    if (overflowX !== 'visible' || overflowY !== 'visible')
      problems.push(`${name} has overflow ${overflowX}/${overflowY}`);
    if (list.scrollWidth > list.clientWidth || list.scrollHeight > list.clientHeight)
      problems.push(
        `${name} overflows ${list.clientWidth} × ${list.clientHeight} with ${list.scrollWidth} × ${list.scrollHeight}`,
      );
    for (const tab of list.querySelectorAll('[role="tab"]')) {
      const box = tab.getBoundingClientRect();
      if (
        box.left < rect.left - 1 ||
        box.right > rect.right + 1 ||
        box.top < rect.top - 1 ||
        box.bottom > rect.bottom + 1
      )
        problems.push(`${name} has a tab outside its bounds`);
      if (tab.getAttribute('aria-selected') === 'true') {
        const underline = getComputedStyle(tab, '::after');
        if (
          underline.content === 'none' ||
          parseFloat(underline.height) <= 0 ||
          parseFloat(underline.top) < 0 ||
          parseFloat(underline.top) + parseFloat(underline.height) > tab.clientHeight
        )
          problems.push(`${name} has an underline outside its tab`);
      }
      if (tab.matches(':focus-visible')) {
        const focus = getComputedStyle(tab);
        if (
          focus.outlineStyle === 'none' ||
          parseFloat(focus.outlineWidth) <= 0 ||
          parseFloat(focus.outlineOffset) + parseFloat(focus.outlineWidth) > 0
        )
          problems.push(`${name} needs a visible inset focus ring`);
      }
    }
  }
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

/** Arrow navigation must keep every tab, its active underline and its focus ring in the strip. */
async function exerciseTabs(page: Page, list: Locator) {
  const tabs = list.getByRole('tab');
  const count = await tabs.count();
  expect(count).toBeGreaterThan(0);
  await tabs.first().focus();
  for (let index = 0; index <= count; index++) {
    const tab = tabs.nth(index % count);
    await expect(tab).toBeFocused();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(layoutProblems), await tab.innerText()).toEqual([]);
    if (index < count) await tab.press('ArrowRight');
  }
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
        const copy = catalogs[language];
        const header = page.getByRole('banner');
        const about = header.getByRole('button', { name: copy['shell.licenses'], exact: true });
        await expect(about).toBeVisible();
        const button = (await about.boundingBox())!;
        const languages = (await header
          .getByRole('radiogroup', { name: copy['shell.language'] })
          .boundingBox())!;
        // About stays centred in its row, with room for the language switch (G3, G4).
        const rowControl =
          size.name === 'phone' ? (await header.getByRole('navigation').boundingBox())! : languages;
        if (size.name === 'phone') {
          expect(button.y + button.height).toBeLessThanOrEqual(languages.y);
          expect(button.width).toBe(44);
        } else expect(button.x).toBeGreaterThanOrEqual(languages.x + languages.width + 4);
        expect(button.x + button.width).toBeLessThanOrEqual(size.width);
        expect(
          Math.abs(button.y + button.height / 2 - rowControl.y - rowControl.height / 2),
        ).toBeLessThan(1);
        expect((await header.boundingBox())!.height).toBe(size.name === 'phone' ? 101 : 48);
        expect(button.height).toBe(size.name === 'phone' ? 44 : 28);
        if (state === 'B1' || state === 'R1')
          await header.screenshot({
            path: info.outputPath(`header-${state}-${size.name}-${language}.png`),
          });
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
        if (size.name === 'phone' && ['B1', 'R1', 'W1'].includes(state))
          await exerciseTabs(page, page.getByRole('tablist'));
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
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a phone switches the Backtest and Optimize tabs (G3, G4)', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page, 'en', 'B1');
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByText('Net profit').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('G3-en.png') });
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  await page.getByRole('tab', { name: 'Inputs' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Length' })).toBeVisible();
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  const run = page.getByRole('button', { name: 'Run', exact: true });
  expect((await run.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByRole('region', { name: 'Optimization run' })).toBeVisible();
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  await page.evaluate(() =>
    (window as unknown as HookWindow).optimizeHooks.runOne('Length', 18, 22),
  );
  await page.getByRole('tab', { name: 'Leaderboard' }).click();
  await page.screenshot({ path: info.outputPath('G4-en.png') });
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const language of ['en', 'zh'] as const) {
  for (const size of sizes)
    test(`provider tabs fit ${size.name} in ${language} without scrolling`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await installMarketFixtures(page);
      const errors = await open(page, language, 'S1');
      const copy = catalogs[language];
      await page
        .getByRole('button', { name: copy['data.marketTitle'], exact: true })
        .first()
        .click();
      const dialog = page.getByRole('dialog', { name: copy['data.marketTitle'] });
      await expect(dialog).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await exerciseTabs(page, dialog.getByRole('tablist'));
      await page.screenshot({ path: info.outputPath(`providers-${size.name}-${language}.png`) });
      expect(errors).toEqual([]);
    });

  test(`dock tabs fit the minimum dock and right-panel widths in ${language}`, async ({
    page,
  }, info) => {
    const errors = await open(page, language, 'B1');
    const copy = catalogs[language];
    await page.evaluate(() => document.fonts.ready);
    const separator = page.getByRole('separator', { name: copy['layout.resizeRight'] });
    const bounds = (await separator.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(1160, bounds.y + bounds.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() =>
        page.getByRole('complementary').evaluate((panel) => panel.getBoundingClientRect().width),
      )
      .toBe(280);
    const list = page.getByRole('tablist', { name: copy['dock.tabs'] });
    // The 45% sidebar maximum leaves more than 600 px at supported desktop widths. Exercise
    // the dock's minimum contract directly, including its actions and the compile status.
    await list.locator('..').evaluate((bar) => (bar.style.width = '600px'));
    await exerciseTabs(page, list);
    await page.getByRole('tab', { name: copy['dock.code'], exact: true }).click();
    await expect(page.getByRole('textbox')).toBeVisible();
    expect(await page.evaluate(layoutProblems)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`dock-minimum-${language}.png`) });
    await page.getByRole('button', { name: copy['dock.collapse'], exact: true }).click();
    expect(await page.evaluate(layoutProblems)).toEqual([]);
    await page.getByRole('tab', { name: copy['dock.report'], exact: true }).press('Enter');
    await page.getByRole('button', { name: copy['shell.optimize'], exact: true }).click();
    // The Optimize right panel has the same minimum; its view switches must also fit.
    const optimizeSeparator = page.getByRole('separator', { name: copy['layout.resizeRight'] });
    const optimizeBounds = (await optimizeSeparator.boundingBox())!;
    await page.mouse.move(
      optimizeBounds.x + optimizeBounds.width / 2,
      optimizeBounds.y + optimizeBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(1160, optimizeBounds.y + optimizeBounds.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() =>
        page.getByRole('complementary').evaluate((panel) => panel.getBoundingClientRect().width),
      )
      .toBe(280);
    expect(await page.evaluate(layoutProblems)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { installMarketFixtures } from './market-fixtures.ts';
import { origins } from './ports.ts';
import { expectHeaderFits, headerLayout } from './header-layout.ts';
import type { installHeaderFixture } from './header-fixture.ts';

test.use({ baseURL: origins.dev });
type Hooks = Window & { headerFixture: Awaited<ReturnType<typeof installHeaderFixture>> };
const measureOnly = process.env.HEADER_MEASURE === 'before';
const sweep = measureOnly || process.env.HEADER_SWEEP === '1';
const widths = process.env.HEADER_WIDTHS
  ? process.env.HEADER_WIDTHS.split(',').map(Number)
  : sweep
    ? [...Array.from({ length: 33 }, (_, i) => 1280 + i * 10), 1024, 1180, 1366, 390]
    : [1024, 1030, 1040, 1060, 1080, 1100, 1180, 1280, 1366, 1440, 1600, 390];

for (const language of ['en', 'zh'] as const) {
  test(`header fits every status (${language})`, async ({ page }, info) => {
    test.setTimeout(sweep ? 300_000 : 120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installMarketFixtures(page);
    await page.addInitScript((language) => {
      localStorage.setItem('optipine.ui', JSON.stringify({ state: { language }, version: 1 }));
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 3 });
    }, language);
    await page.goto('/');
    const cases = await page.evaluate(async () => {
      const path = '/e2e/header-fixture.ts';
      const { installHeaderFixture, headerCases } = await import(/* @vite-ignore */ path);
      (window as unknown as Hooks).headerFixture = await installHeaderFixture();
      return headerCases as (typeof import('./header-fixture.ts'))['headerCases'];
    });
    await page.evaluate(() => document.fonts.ready);
    const rows = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      for (const [tab, state] of cases) {
        await page.evaluate(
          ([tab, state]) => {
            (window as unknown as Hooks).headerFixture(tab, state);
          },
          [tab, state] as const,
        );
        // Let React, ResizeObserver and canvas sizes settle after each state or width change.
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
              ),
            ),
        );
        const metrics = await page.getByRole('banner').evaluate((header) => {
          const clipped: string[] = [];
          const overlaps: string[] = [];
          const controls = [...header.querySelectorAll('button, a, select')];
          const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const element = node.parentElement!;
            if (!node.textContent?.trim() || element.closest('svg')) continue;
            const rect = element.getBoundingClientRect();
            if (!rect.width || !rect.height || getComputedStyle(element).position === 'absolute')
              continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            let hidden = false;
            for (
              let parent: Element | null = element;
              parent && header.contains(parent);
              parent = parent.parentElement
            ) {
              if (
                getComputedStyle(parent).position === 'absolute' &&
                getComputedStyle(parent).clipPath !== 'none'
              ) {
                hidden = true;
                break;
              }
              const box = parent.getBoundingClientRect();
              if (
                getComputedStyle(parent).overflowX !== 'visible' &&
                [...range.getClientRects()].some(
                  (text) =>
                    text.right > box.right + 1 ||
                    text.left < box.left - 1 ||
                    text.bottom > box.bottom + 1 ||
                    text.top < box.top - 1,
                )
              ) {
                // Script labels intentionally ellipsize; no status or control label may do so.
                if (!element.closest('[data-loaded]')) clipped.push(node.textContent.trim());
                break;
              }
            }
            if (!hidden && !element.closest('[data-loaded]'))
              for (const control of controls) {
                if (control.contains(element)) continue;
                const box = control.getBoundingClientRect();
                if (
                  box.width &&
                  box.height &&
                  [...range.getClientRects()].some(
                    (text) =>
                      text.right > box.left + 1 &&
                      text.left < box.right - 1 &&
                      text.bottom > box.top + 1 &&
                      text.top < box.bottom - 1,
                  )
                )
                  overlaps.push(node.textContent.trim());
              }
          }
          return {
            overflow: Math.max(0, header.scrollWidth - header.clientWidth),
            pageOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            clipped,
            overlaps,
            compact: header.getAttribute('data-compact'),
            narrow: header.getAttribute('data-narrow'),
            status: header.querySelector('[role="group"]')?.textContent,
            visibleStatus: (
              header.querySelector('[role="group"]') as HTMLElement
            )?.checkVisibility(),
          };
        });
        const spacing =
          width < 1024
            ? null
            : measureOnly
              ? await page.getByRole('banner').evaluate(headerLayout)
              : await expectHeaderFits(page);
        rows.push({ language, width, tab, state, ...metrics, spacing });
        // Linux was up to 6.61 px tighter; 16 px flags all five supplied CI near-misses locally.
        if (spacing && spacing.slack < 16) {
          const warning = `${language} ${width} ${tab}/${state}: ${spacing.slack.toFixed(2)} px slack (< 16 px)`;
          info.annotations.push({ type: 'header-slack', description: warning });
          console.warn(warning);
        }
        if (!measureOnly) {
          if (width === 1024)
            expect
              .soft(spacing!.slack, `${tab} ${state}: narrow header reserve`)
              .toBeGreaterThanOrEqual(24);
          if (metrics.narrow === '2' || metrics.compact === '7') {
            const script = page.getByRole('banner').locator('span[data-loaded="true"]');
            await expect(script.locator('..')).toHaveAttribute(
              'title',
              (await script.textContent())!,
            );
          }
          if (width === 1600)
            expect
              .soft(Number(metrics.compact), `${tab} ${state}: ordinary wide header`)
              .toBeLessThan(6);
          expect.soft(metrics.overflow, `${width} ${tab} ${state}: header overflow`).toBe(0);
          expect.soft(metrics.pageOverflow, `${width} ${tab} ${state}: page overflow`).toBe(0);
          expect.soft(metrics.clipped, `${width} ${tab} ${state}: clipped labels`).toEqual([]);
          expect.soft(metrics.overlaps, `${width} ${tab} ${state}: overlapping labels`).toEqual([]);
          if (
            (width >= 768 || tab === 'optimize') &&
            ['running', 'walk-forward', 'compile-error', 'error'].includes(state)
          )
            expect
              .soft(metrics.visibleStatus, `${width} ${tab} ${state}: visible status`)
              .toBe(true);
          if (width === 390 && tab === 'optimize' && ['running', 'walk-forward'].includes(state)) {
            const banner = page.getByRole('banner');
            const status = (await banner.getByRole('group').boundingBox())!;
            const cancel = (await banner
              .getByRole('button', { name: /Cancel|取消/, exact: true })
              .boundingBox())!;
            const language = (await banner.getByRole('radiogroup').boundingBox())!;
            expect(status.y).toBeGreaterThanOrEqual(cancel.y + cancel.height);
            expect(status.y + status.height).toBeLessThanOrEqual(language.y);
          }
          if (width >= 1280 && tab === 'backtest' && state === 'done') {
            const banner = page.getByRole('banner');
            const date = banner.getByRole('button', { name: /20\d\d-\d\d-\d\d.*20\d\d-\d\d-\d\d/ });
            await expect(date).toHaveAttribute('title', (await date.getAttribute('aria-label'))!);
            await expect(banner.getByRole('button', { name: /BTCUSDT Binance/ })).toBeVisible();
            await expect(
              banner.getByRole('button', { name: /Run backtest|运行回测/ }),
            ).toHaveAccessibleDescription(/17,520/);
          }
        }
        if (
          ((width === 1280 || width === 1366) && state === 'done') ||
          (width === 390 && (state === 'running' || state === 'done'))
        )
          await page.screenshot({
            path: info.outputPath(`${tab}-${state}-${width}-${language}.png`),
          });
      }
    }
    if (!measureOnly && language === 'en') {
      // Reproduce CI's measured room using the real header, without relying on Windows fonts.
      // The last case additionally exercises script truncation when Optimize has no Run label.
      const constrained = [
        { width: 1280, tab: 'backtest', state: 'compile-error', compact: 5, slack: 1, next: 6 },
        { width: 1280, tab: 'optimize', state: 'cancelled', compact: 5, slack: 6, next: 5 },
        { width: 1366, tab: 'backtest', state: 'outdated', compact: 3, slack: 7, next: 3 },
        { width: 1440, tab: 'backtest', state: 'done', compact: 1, slack: 5, next: 1 },
        { width: 1440, tab: 'backtest', state: 'preview', compact: 1, slack: 5, next: 1 },
        { width: 1280, tab: 'optimize', state: 'cancelled', compact: 5, slack: 1, next: 7 },
      ] as const;
      const replay = [];
      const banner = page.getByRole('banner');
      for (const scenario of constrained) {
        await banner.evaluate((header) => {
          header.style.width = '';
        });
        await page.setViewportSize({ width: scenario.width, height: 900 });
        await page.evaluate(({ tab, state }) => {
          (window as unknown as Hooks).headerFixture(tab, state);
        }, scenario);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
              ),
            ),
        );
        await banner.evaluate((header, compact) => {
          header.dataset.compact = String(compact);
        }, scenario.compact);
        const original = await banner.evaluate(headerLayout);
        const lostSpace = Math.ceil(original.slack - scenario.slack);
        await banner.evaluate((header, width) => {
          // Integer widths avoid clientWidth/computed-style rounding artifacts in this replay.
          header.style.width = `${width}px`;
          document.fonts.dispatchEvent(new Event('loadingdone'));
        }, original.width - lostSpace);
        await expect(banner).toHaveAttribute('data-compact', String(scenario.next));
        const after = await expectHeaderFits(page);
        if (scenario.next === 6) {
          const run = banner.getByRole('button', { name: /^Run backtest/ });
          await expect(run.getByText('Run', { exact: true })).toBeVisible();
          await expect(run).toHaveAttribute('title', 'Run backtest');
        }
        if (scenario.next === 7) {
          const script = banner.locator('span[data-loaded="true"]');
          expect((await script.boundingBox())!.width).toBeLessThanOrEqual(80);
          await expect(script.locator('..')).toHaveAttribute(
            'title',
            (await script.textContent())!,
          );
        }
        replay.push({
          ...scenario,
          originalSlack: original.slack,
          replayedSlack: original.slack - lostSpace,
          after,
        });
      }
      await writeFile(info.outputPath('constrained-slack.json'), JSON.stringify(replay, null, 2));
    }
    await writeFile(info.outputPath('measurements.json'), JSON.stringify(rows, null, 2));
    expect(errors).toEqual([]);
  });
}

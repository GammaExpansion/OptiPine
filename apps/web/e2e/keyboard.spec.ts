import { writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { en } from '../src/i18n/en.ts';
import { zh } from '../src/i18n/zh.ts';
import { installMarketFixtures } from './market-fixtures.ts';

/** Every interaction in this pass is a key press; DOM reads only identify the current stop. */
async function tabTo(page: Page, target: Locator, stops: string[], backwards = false) {
  await expect(target).toBeVisible();
  for (let index = 0; index < 80; index++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
    stops.push(
      await page.evaluate(() => {
        const element = document.activeElement!;
        const style = getComputedStyle(element);
        return `${element.tagName} ${element.getAttribute('role') ?? ''} ${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 80)} | ${style.outline} | ${style.borderColor}`;
      }),
    );
  }
  throw new Error(`Keyboard could not reach ${target}: ${stops.slice(-8).join('\n')}`);
}

for (const language of ['en', 'zh'] as const)
  for (const phone of [false, true])
    test(`keyboard journey ${phone ? 'phone' : 'desktop'} ${language}`, async ({ page }, info) => {
      const stops: string[] = [];
      const copy = language === 'en' ? en : zh;
      await page.setViewportSize(
        phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      );
      await installMarketFixtures(page);
      await page.addInitScript((language) => {
        localStorage.setItem('optipine.ui', JSON.stringify({ state: { language }, version: 1 }));
      }, language);
      try {
        await page.goto('/');
        const example = page.getByRole('button', { name: copy['backtest.loadExample'] });
        await tabTo(page, example, stops);
        await page.keyboard.press('Enter');
        const run = page.getByRole('banner').getByRole('button', {
          name: new RegExp(`^${copy[phone ? 'shell.run' : 'shell.runBacktest']}`),
        });
        await expect(run).toBeEnabled();
        await tabTo(page, run, stops);
        await expect(run).toHaveCSS('outline-style', 'solid');
        expect(
          await run.evaluate((element) => {
            const style = getComputedStyle(element);
            return style.outlineColor === style.backgroundColor;
          }),
        ).toBe(false);
        await page.screenshot({ path: info.outputPath('run-focus.png') });
        await page.keyboard.press('Enter');

        const code = page.getByRole('tab', {
          name: copy[phone ? 'dock.codeShort' : 'dock.code'],
          exact: true,
        });
        await tabTo(page, code, stops);
        await page.keyboard.press('Home');
        await expect(
          page.getByRole('tab', { name: copy['dock.report'], exact: true }),
        ).toBeFocused();
        await expect(
          page.getByText(copy['report.netProfit'], { exact: true }).first(),
        ).toBeVisible();
        await page.keyboard.press('ArrowRight');
        // Radix schedules roving focus; each next key belongs to the newly focused tab.
        await expect(
          page.getByRole('tab', { name: copy['dock.equity'], exact: true }),
        ).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(
          page.getByRole('tab', { name: new RegExp(`^${copy['dock.trades']}`) }),
        ).toBeFocused();
        await tabTo(page, page.getByRole('grid'), stops);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await tabTo(
          page,
          page.getByRole('tab', { name: new RegExp(`^${copy['dock.trades']}`) }),
          stops,
          true,
        );
        await page.keyboard.press('ArrowRight');
        if (phone) {
          await expect(
            page.getByRole('tab', { name: copy['dock.inputs'], exact: true }),
          ).toBeFocused();
          await page.keyboard.press('ArrowRight');
        }
        await expect(code).toBeFocused();
        const editor = page.getByRole('textbox', { name: copy['code.editor'] });
        await tabTo(page, editor, stops);
        const source = await editor.textContent();
        await expect(page.locator('.cm-editor')).toHaveCSS('outline-style', 'solid');
        await page.screenshot({ path: info.outputPath('code-focus.png') });
        await page.keyboard.press('Tab');
        await expect(editor).not.toBeFocused();
        expect(await editor.textContent()).toBe(source);

        if (phone) {
          await tabTo(page, code, stops, true);
          await page.keyboard.press('ArrowLeft');
        }
        const settings = page.getByRole('button', {
          name: copy['properties.allSettings'],
          exact: true,
        });
        await tabTo(page, settings, stops);
        await page.keyboard.press('Enter');
        const properties = page.getByRole('dialog', {
          name: copy['backtest.properties'],
          exact: true,
        });
        await expect(properties).toBeVisible();
        await expect(properties.locator(':focus')).toHaveCount(1);
        await tabTo(
          page,
          properties.getByRole('spinbutton', {
            name: copy['backtest.property.initialCapital'],
            exact: true,
          }),
          stops,
        );
        await tabTo(
          page,
          properties.getByRole('combobox', {
            name: copy['backtest.property.orderDelay'],
            exact: true,
          }),
          stops,
        );
        await page.keyboard.press('Tab');
        await expect(
          properties.getByRole('button', { name: copy['properties.back'], exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(properties).toHaveCount(0);
        await expect(settings).toBeFocused();

        const marketTrigger = page.getByRole('banner').getByRole('button', { name: /BTCUSDT/ });
        await tabTo(page, marketTrigger, stops);
        await page.keyboard.press('Enter');
        const market = page.getByRole('dialog', { name: copy['data.marketTitle'], exact: true });
        const close = market.getByRole('button', { name: copy['data.close'], exact: true });
        await expect(close).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(
          market.getByRole('button', { name: copy['data.fetch'], exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(close).toBeFocused();
        await tabTo(
          page,
          market.getByRole('button', { name: copy['data.fetch'], exact: true }),
          stops,
        );
        await page.keyboard.press('Enter');
        await expect(
          market.getByRole('button', { name: copy['data.use'], exact: true }),
        ).toBeEnabled();
        await page.keyboard.press('Escape');
        await expect(market).toHaveCount(0);
        await expect(marketTrigger).toBeFocused();
      } finally {
        const path = info.outputPath('keyboard-stops.json');
        await writeFile(path, JSON.stringify(stops, null, 2));
        await info.attach('Keyboard stops', { path, contentType: 'application/json' });
      }
    });

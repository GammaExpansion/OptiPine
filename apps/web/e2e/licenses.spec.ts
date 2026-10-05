import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { catalogs } from '../src/i18n/catalogs.ts';
import { origins } from './ports.ts';

for (const language of ['en', 'zh'] as const) {
  for (const width of [1440, 1024, 390]) {
    test(`licenses open from the header with readable notices (${language}, ${width})`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('/');
      if (language === 'zh')
        await page
          .getByRole('radiogroup', { name: 'Language' })
          .getByRole('radio', { name: '中' })
          .click();
      const copy = catalogs[language];
      const trigger = page.getByRole('button', {
        name: copy['shell.licenses'],
        exact: true,
      });
      await expect(trigger).toHaveText('');
      await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
      await trigger.hover();
      await expect(page.getByRole('tooltip')).toHaveText(copy['shell.licenses']);
      await page.mouse.move(0, 200);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('tooltip')).not.toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole('banner').screenshot({
        path: info.outputPath(`header-${language}-${width}.png`),
      });
      // The repository link: beside About, or on a phone beside the language switch, as a real
      // link that opens GitHub in a new tab, within the page and a full touch target on a phone.
      const github = page.getByRole('banner').getByRole('link', {
        name: copy['shell.github'],
        exact: true,
      });
      await expect(github).toBeVisible();
      await expect(github).toHaveAttribute('href', 'https://github.com/GammaExpansion/OptiPine');
      await expect(github).toHaveAttribute('target', '_blank');
      await expect(github).toHaveAttribute('rel', 'noopener noreferrer');
      const box = (await github.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      if (width === 390) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      if (width === 390) {
        await page.getByRole('button', { name: copy['shell.backtest'], exact: true }).focus();
        for (
          let step = 0;
          step < 8 && !(await trigger.evaluate((el) => el.matches(':focus')));
          step++
        )
          await page.keyboard.press('Tab');
      } else {
        await page
          .getByRole('radiogroup', { name: copy['shell.language'] })
          .getByRole('radio', { checked: true })
          .focus();
        await page.keyboard.press('Tab');
      }
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', {
        name: copy['licenses.title'],
      });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(
        'Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/',
      );
      await expect(dialog.getByRole('link', { name: 'TradingView', exact: true })).toHaveAttribute(
        'href',
        'https://www.tradingview.com/',
      );
      for (const link of await dialog.locator('a[href^="/licenses/"]').all()) {
        const response = await page.request.get((await link.getAttribute('href'))!);
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8');
        const text = await response.text();
        expect(text.length).toBeGreaterThan(1000);
        expect(text).not.toContain('<!doctype html>');
      }
      expect(await page.evaluate(() => document.body.scrollWidth)).toBe(width);
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      expect(
        (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations,
      ).toEqual([]);
      await page.screenshot({ path: info.outputPath(`licenses-${language}-${width}.png`) });
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      expect(errors).toEqual([]);
    });
  }
}

test('production, preview and dev serve complete notices and the three original OFL texts', async ({
  request,
}) => {
  for (const origin of [origins.production, origins.preview, origins.dev]) {
    const response = await request.get(`${origin}/licenses/THIRD_PARTY_NOTICES.txt`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');
    const text = await response.text();
    expect(text).toContain('lightweight-charts@5.2.1');
    expect(text).toContain('Copyright (c) Microsoft Corporation');
    expect(text).toContain('MIT License');
    expect(text).toContain('The GitHub mark is from GitHub Octicons');
    expect(text).toContain('Copyright (c) 2025 GitHub Inc.');
    for (const font of ['barlow', 'noto-sans-sc', 'source-code-pro']) {
      const fontResponse = await request.get(`${origin}/licenses/${font}.txt`);
      expect(fontResponse.status()).toBe(200);
      const fontText = await fontResponse.text();
      expect(fontText).toContain('SIL OPEN FONT LICENSE Version 1.1');
      expect(fontText).toContain('DISCLAIMER');
      expect(text).toContain(fontText);
    }
  }
});

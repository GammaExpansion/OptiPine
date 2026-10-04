import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { en } from '../src/i18n/en.ts';
import { zh } from '../src/i18n/zh.ts';
import { installMarketFixtures } from './market-fixtures.ts';

const sizes = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const;

/** Report-only findings in forbidden paths; no serious or critical rule is exempted. */
const allowList = [
  {
    rule: 'region',
    impact: 'moderate',
    viewport: 'desktop',
    screens: [
      'S1',
      'B1-report',
      'B1-trades',
      'B1-code',
      'B1-equity',
      'B13',
      'O1',
      'optimize-setup',
    ],
    selector: '[role="separator"][aria-controls$="-main"]',
    file: 'src/shell/Workbench.tsx',
  },
] as const;

/** Keep every severity in the evidence; only serious and critical violations gate the audit. */
async function scan(page: Page, info: TestInfo, screen: string, viewport: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  const unexpected = [];
  const allowed = [];
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      const exception = allowList.find(
        (item) =>
          item.rule === violation.id &&
          item.impact === violation.impact &&
          item.viewport === viewport &&
          (item.screens as readonly string[]).includes(screen),
      );
      const target = node.target.length === 1 ? node.target[0] : undefined;
      const matches =
        exception &&
        typeof target === 'string' &&
        (await page
          .locator(target)
          .evaluate((element, selector) => element.matches(selector), exception.selector));
      const finding = {
        rule: violation.id,
        impact: violation.impact,
        target: node.target,
        html: node.html,
      };
      if (matches) allowed.push({ ...finding, file: exception.file });
      else if (violation.impact === 'serious' || violation.impact === 'critical')
        unexpected.push(finding);
    }
  }
  const path = info.outputPath(`${screen}.json`);
  await writeFile(
    path,
    JSON.stringify(
      {
        screen,
        viewport,
        axeVersion: results.testEngine.version,
        violations: results.violations,
        incomplete: results.incomplete,
        allowed,
      },
      null,
      2,
    ),
  );
  await info.attach(screen, { path, contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath(`${screen}.png`) });
  expect.soft(unexpected, screen).toEqual([]);
}

for (const language of ['en', 'zh'] as const)
  for (const size of sizes)
    test(`accessibility ${size.name} ${language}`, async ({ page }, info) => {
      test.setTimeout(120_000);
      const copy = language === 'en' ? en : zh;
      const audit = (screen: string) => scan(page, info, screen, size.name);
      await page.setViewportSize(size);
      await installMarketFixtures(page);
      await page.addInitScript((language) => {
        localStorage.setItem('optipine.ui', JSON.stringify({ state: { language }, version: 1 }));
      }, language);
      await page.goto('/');
      const example = page.getByRole('button', { name: copy['backtest.loadExample'] });
      await expect(example).toBeVisible();
      await audit('S1');

      await example.click();
      const run = page.getByRole('banner').getByRole('button', {
        name: new RegExp(`^${copy[size.name === 'phone' ? 'shell.run' : 'shell.runBacktest']}`),
      });
      await expect(run).toBeEnabled();
      await run.click();
      await page.getByRole('tab', { name: copy['dock.report'], exact: true }).click();
      await expect(page.getByText(copy['report.netProfit'], { exact: true }).first()).toBeVisible();
      await audit('B1-report');

      await page.getByRole('tab', { name: new RegExp(`^${copy['dock.trades']}`) }).click();
      await expect(page.getByRole('grid')).toBeVisible();
      await audit('B1-trades');
      await page
        .getByRole('tab', {
          name: copy[size.name === 'phone' ? 'dock.codeShort' : 'dock.code'],
          exact: true,
        })
        .click();
      await expect(page.locator('.cm-content')).toBeVisible();
      await audit('B1-code');
      await page.getByRole('tab', { name: copy['dock.equity'], exact: true }).click();
      await expect(page.getByRole('group', { name: copy['charts.equityKeyboard'] })).toBeVisible();
      await audit('B1-equity');

      if (size.name === 'phone')
        await page.getByRole('tab', { name: copy['dock.inputs'], exact: true }).click();
      await page.getByRole('button', { name: copy['properties.allSettings'], exact: true }).click();
      const properties = page.getByRole('dialog', {
        name: copy['backtest.properties'],
        exact: true,
      });
      await expect(
        properties.getByRole('spinbutton', {
          name: copy['backtest.property.initialCapital'],
          exact: true,
        }),
      ).toBeVisible();
      await audit('B13');
      await page.keyboard.press('Escape');
      await expect(properties).toHaveCount(0);

      await page
        .getByRole('banner')
        .getByRole('button', { name: /BTCUSDT/ })
        .click();
      const market = page.getByRole('dialog', { name: copy['data.marketTitle'], exact: true });
      await expect(
        market.getByRole('button', { name: copy['data.fetch'], exact: true }),
      ).toBeVisible();
      await audit('S3');
      await market.getByRole('button', { name: copy['data.fetch'], exact: true }).click();
      await expect(
        market.getByRole('button', { name: copy['data.use'], exact: true }),
      ).toBeEnabled();
      await audit('S5');
      await page.keyboard.press('Escape');
      await expect(market).toHaveCount(0);

      await page.getByRole('button', { name: copy['shell.optimize'], exact: true }).click();
      await expect(page.getByRole('heading', { name: copy['optimize.empty'] })).toBeVisible();
      await audit('O1');
      if (size.name === 'phone')
        await page.getByRole('tab', { name: copy['layout.settings'], exact: true }).click();
      await expect(
        page.getByRole('spinbutton', {
          name: copy['optimize.setup.fromLabel'].replace('{title}', 'Length'),
          exact: true,
        }),
      ).toBeVisible();
      await audit('optimize-setup');
    });

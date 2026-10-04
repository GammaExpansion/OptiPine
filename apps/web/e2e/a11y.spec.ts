import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { catalogs } from '../src/i18n/catalogs.ts';
import { installMarketFixtures } from './market-fixtures.ts';

const { en, zh } = catalogs;

const sizes = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const;

/** A moderate or minor finding reported for a file this audit may not change. */
interface AllowedFinding {
  readonly rule: string;
  readonly impact: 'minor' | 'moderate';
  readonly viewport: (typeof sizes)[number]['name'];
  readonly screens: readonly string[];
  readonly selector: string;
  readonly file: string;
}

/**
 * Report-only findings in forbidden paths: none remain. A future one goes here with its owning
 * file; no serious or critical rule is ever exempted.
 */
const allowList: readonly AllowedFinding[] = [];

/**
 * Keep every severity in the evidence and prevent the resolved shell and heading findings from
 * returning.
 */
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
          item.screens.includes(screen),
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
  expect
    .soft(
      [...results.violations, ...results.incomplete].filter(
        ({ id }) =>
          id === 'region' ||
          id === 'aria-prohibited-attr' ||
          id === 'landmark-main-is-top-level' ||
          id === 'page-has-heading-one',
      ),
      `${screen}: shell landmarks, accessible names and the page heading`,
    )
    .toEqual([]);
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
      const facts = page.getByRole('banner').getByRole('group', { name: copy['shell.facts'] });
      if (size.name === 'desktop') {
        await expect(facts).toMatchAriaSnapshot(`
          - group "${copy['shell.facts']}":
            - text: "${copy['shell.runMissing']}"
        `);
        await expect(
          page
            .getByRole('main', { name: copy['shell.backtest'], exact: true })
            .getByRole('separator', { name: copy['layout.resizeRight'] }),
        ).toHaveCount(1);
      }
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
      await expect(facts).toMatchAriaSnapshot(`
        - group "${copy['shell.facts']}":
          - text: "${copy['optimize.empty']}"
      `);
      if (size.name === 'desktop')
        await expect(
          page
            .getByRole('main', { name: copy['shell.optimize'], exact: true })
            .getByRole('separator', { name: copy['layout.resizeRight'] }),
        ).toHaveCount(1);
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

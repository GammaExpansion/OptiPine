import { expect, test, type Page } from '@playwright/test';
import { catalogs } from '../src/i18n/catalogs.ts';
import type { CatalogArea, Language, MessageId } from '../src/i18n/translate.ts';
import type { Dialog } from '../src/state/ui.ts';
import { origins } from './ports.ts';

const areas = [
  { area: 'optimize', id: 'optimize.start' },
  { area: 'data', dialog: 'marketData', id: 'data.limits' },
  { area: 'script', dialog: 'script', id: 'script.pasteHint' },
  { area: 'properties', dialog: 'properties', id: 'properties.shared' },
  { area: 'licenses', dialog: 'licenses', id: 'licenses.title' },
] as const satisfies readonly { area: CatalogArea; dialog?: Dialog; id: MessageId }[];

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function switchLanguage(page: Page, language: Language) {
  // Dialog focus traps intentionally cover the shell's language switch. Use its store action.
  await page.evaluate(async (language) => {
    const path = '/src/state/ui.ts';
    const { uiStore } = (await import(path)) as typeof import('../src/state/ui.ts');
    uiStore.getState().setLanguage(language);
  }, language);
}

async function openArea(page: Page, dialog?: Dialog) {
  await page.evaluate(async (dialog) => {
    const path = '/src/state/ui.ts';
    const { uiStore } = (await import(path)) as typeof import('../src/state/ui.ts');
    if (dialog) uiStore.getState().setDialogOpen(dialog, true);
    else uiStore.getState().setPage('optimize');
  }, dialog);
}

for (const language of ['en', 'zh'] as const) {
  for (const entry of areas) {
    test(`${entry.area} waits for copy on first open and language switch (${language})`, async ({
      page,
    }) => {
      const other = language === 'en' ? 'zh' : 'en';
      const first = gate();
      const firstRequested = gate();
      const replacement = gate();
      const replacementRequested = gate();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(`**/src/i18n/${entry.area}-${language}.ts`, async (route) => {
        firstRequested.resolve();
        await first.promise;
        await route.continue();
      });
      await page.route(`**/src/i18n/${entry.area}-${other}.ts`, async (route) => {
        replacementRequested.resolve();
        await replacement.promise;
        await route.continue();
      });
      await page.addInitScript(() => {
        const raw: string[] = [];
        Object.assign(window, { rawCatalogIds: raw });
        new MutationObserver(() => {
          const text = document.getElementById('root')?.textContent ?? '';
          raw.push(
            ...[
              ...text.matchAll(/\b(?:shell|optimize|data|csv|script|properties|licenses)\.[\w.]+/g),
            ].map((match) => match[0]),
          );
        }).observe(document, { childList: true, subtree: true, characterData: true });
      });
      await page.goto(origins.dev);
      await expect(page.getByRole('button', { name: 'Open script', exact: true })).toBeVisible();
      await switchLanguage(page, language);
      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        language === 'en' ? 'en' : 'zh-CN',
      );
      await openArea(page, 'dialog' in entry ? entry.dialog : undefined);
      await firstRequested.promise;
      const label = page.getByText(catalogs[language][entry.id], { exact: true }).first();
      await expect(label).not.toBeVisible();
      first.resolve();
      await expect(label).toBeVisible();
      await switchLanguage(page, other);
      await replacementRequested.promise;
      await expect(label).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        language === 'en' ? 'en' : 'zh-CN',
      );
      replacement.resolve();
      await expect(
        page.getByText(catalogs[other][entry.id], { exact: true }).first(),
      ).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', other === 'en' ? 'en' : 'zh-CN');
      expect(
        await page.evaluate(() => (window as unknown as { rawCatalogIds: string[] }).rawCatalogIds),
      ).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test('switching language during an area first load renders only the newly selected copy', async ({
  page,
}) => {
  const requested = gate();
  const release = gate();
  await page.route('**/src/i18n/licenses-en.ts', async (route) => {
    requested.resolve();
    await release.promise;
    await route.continue();
  });
  await page.goto(origins.dev);
  await expect(page.getByRole('button', { name: 'About & licenses', exact: true })).toBeVisible();
  await openArea(page, 'licenses');
  await requested.promise;
  await switchLanguage(page, 'zh');
  await expect(page.getByRole('dialog', { name: catalogs.zh['licenses.title'] })).toBeVisible();
  release.resolve();
  await expect(page.getByRole('dialog', { name: catalogs.en['licenses.title'] })).not.toBeVisible();
});

import { en } from './en.ts';
import { sheetEn } from './sheet-en.ts';
import { sheetZh } from './sheet-zh.ts';
import { registerCatalog } from './translate.ts';
import { zh } from './zh.ts';

/**
 * App and component-sheet copy, registered in both languages for tests and dev pages.
 * The app itself loads only the active language's app catalog (`loadCatalog`).
 */
export const catalogs = { en: { ...en, ...sheetEn }, zh: { ...zh, ...sheetZh } };
registerCatalog('en', catalogs.en);
registerCatalog('zh', catalogs.zh);

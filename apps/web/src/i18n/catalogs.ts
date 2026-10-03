import { en } from './en.ts';
import { registerCatalog } from './translate.ts';
import { zh } from './zh.ts';

/**
 * Both catalogs, registered on import: for tests, which read and render either language at once,
 * and for the dev pages. The app itself loads one language at a time (`loadCatalog`).
 */
export const catalogs = { en, zh };
registerCatalog('en', en);
registerCatalog('zh', zh);

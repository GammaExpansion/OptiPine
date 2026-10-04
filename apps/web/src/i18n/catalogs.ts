import { en } from './en.ts';
import { optimizeEn } from './optimize-en.ts';
import { dataEn } from './data-en.ts';
import { scriptEn } from './script-en.ts';
import { propertiesEn } from './properties-en.ts';
import { sheetEn } from './sheet-en.ts';
import { licensesEn } from './licenses-en.ts';
import { zh } from './zh.ts';
import { optimizeZh } from './optimize-zh.ts';
import { dataZh } from './data-zh.ts';
import { scriptZh } from './script-zh.ts';
import { propertiesZh } from './properties-zh.ts';
import { sheetZh } from './sheet-zh.ts';
import { licensesZh } from './licenses-zh.ts';
import { registerCatalog } from './translate.ts';

/** Eager aggregate for tests only; runtime entry points use the area loader. */
export const catalogAreas = {
  en: {
    core: en,
    optimize: optimizeEn,
    data: dataEn,
    script: scriptEn,
    properties: propertiesEn,
    sheet: sheetEn,
    licenses: licensesEn,
  },
  zh: {
    core: zh,
    optimize: optimizeZh,
    data: dataZh,
    script: scriptZh,
    properties: propertiesZh,
    sheet: sheetZh,
    licenses: licensesZh,
  },
} as const;
export const catalogs = {
  en: {
    ...catalogAreas.en.core,
    ...catalogAreas.en.optimize,
    ...catalogAreas.en.data,
    ...catalogAreas.en.script,
    ...catalogAreas.en.properties,
    ...catalogAreas.en.sheet,
    ...catalogAreas.en.licenses,
  },
  zh: {
    ...catalogAreas.zh.core,
    ...catalogAreas.zh.optimize,
    ...catalogAreas.zh.data,
    ...catalogAreas.zh.script,
    ...catalogAreas.zh.properties,
    ...catalogAreas.zh.sheet,
    ...catalogAreas.zh.licenses,
  },
};
registerCatalog('en', 'core', catalogAreas.en.core);
registerCatalog('en', 'optimize', catalogAreas.en.optimize);
registerCatalog('en', 'data', catalogAreas.en.data);
registerCatalog('en', 'script', catalogAreas.en.script);
registerCatalog('en', 'properties', catalogAreas.en.properties);
registerCatalog('en', 'sheet', catalogAreas.en.sheet);
registerCatalog('en', 'licenses', catalogAreas.en.licenses);
registerCatalog('zh', 'core', catalogAreas.zh.core);
registerCatalog('zh', 'optimize', catalogAreas.zh.optimize);
registerCatalog('zh', 'data', catalogAreas.zh.data);
registerCatalog('zh', 'script', catalogAreas.zh.script);
registerCatalog('zh', 'properties', catalogAreas.zh.properties);
registerCatalog('zh', 'sheet', catalogAreas.zh.sheet);
registerCatalog('zh', 'licenses', catalogAreas.zh.licenses);

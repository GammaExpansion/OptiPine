import type { en } from './en.ts';
import type { optimizeEn } from './optimize-en.ts';
import type { dataEn } from './data-en.ts';
import type { scriptEn } from './script-en.ts';
import type { propertiesEn } from './properties-en.ts';
import type { sheetEn } from './sheet-en.ts';
import type { licensesEn } from './licenses-en.ts';

export type Language = 'en' | 'zh';
export type CatalogArea =
  'core' | 'optimize' | 'data' | 'script' | 'properties' | 'sheet' | 'licenses';
export type MessageId =
  | keyof typeof en
  | keyof typeof optimizeEn
  | keyof typeof dataEn
  | keyof typeof scriptEn
  | keyof typeof propertiesEn
  | keyof typeof sheetEn
  | keyof typeof licensesEn;
export type Catalog = Readonly<Partial<Record<MessageId, string>>>;

import { errorText, message, plainText, type MessageValues, type Text } from '@pine/messages';
import { createCatalogLoader } from './catalog-loader.ts';
import type { Catalog, CatalogArea, Language, MessageId } from './types.ts';
export type { Catalog, CatalogArea, Language, MessageId } from './types.ts';

export function defaultLanguage(locale: string): Language {
  return /^zh(?:-|$)/i.test(locale) ? 'zh' : 'en';
}

const imports: Record<CatalogArea, Record<Language, () => Promise<Catalog>>> = {
  core: {
    en: () => import('./en.ts').then((m) => m.en),
    zh: () => import('./zh.ts').then((m) => m.zh),
  },
  optimize: {
    en: () => import('./optimize-en.ts').then((m) => m.optimizeEn),
    zh: () => import('./optimize-zh.ts').then((m) => m.optimizeZh),
  },
  data: {
    en: () => import('./data-en.ts').then((m) => m.dataEn),
    zh: () => import('./data-zh.ts').then((m) => m.dataZh),
  },
  script: {
    en: () => import('./script-en.ts').then((m) => m.scriptEn),
    zh: () => import('./script-zh.ts').then((m) => m.scriptZh),
  },
  properties: {
    en: () => import('./properties-en.ts').then((m) => m.propertiesEn),
    zh: () => import('./properties-zh.ts').then((m) => m.propertiesZh),
  },
  sheet: {
    en: () => import('./sheet-en.ts').then((m) => m.sheetEn),
    zh: () => import('./sheet-zh.ts').then((m) => m.sheetZh),
  },
  licenses: {
    en: () => import('./licenses-en.ts').then((m) => m.licensesEn),
    zh: () => import('./licenses-zh.ts').then((m) => m.licensesZh),
  },
};
const loader = createCatalogLoader((language, area) => imports[area][language]());
export const registerCatalog = loader.register;
export const hasCatalog = loader.has;
export const onCatalog = loader.subscribe;
export const catalogRevision = loader.revision;
export const hasRequestedCatalogs = loader.ready;
export const loadRequestedCatalogs = loader.loadRequested;
export const loadCatalog = loader.load;

/**
 * Literal source text stays literal; package messages and nested groups are translated
 * recursively. An id the language's catalog lacks, or a catalog not loaded, keeps the message's
 * plain fallback. A message whose `count` is 1 reads the catalog's `.one` form of its id where
 * there is one: "1 bar", not "1 bars".
 */
export function translate(text: Text, language: Language): string {
  if (typeof text === 'string') return text;
  if (text.kind === 'message-group') {
    return text.parts
      .map((part) => translate(part, language))
      .join(translate(text.separator, language));
  }
  const catalog = loader.get(language);
  if (!catalog || !Object.hasOwn(catalog, text.id)) return plainText(text);
  const one = `${text.id}.one`;
  const id = text.values.count === 1 && Object.hasOwn(catalog, one) ? one : text.id;
  return catalog[id as MessageId]!.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
    if (!Object.hasOwn(text.values, key)) return placeholder;
    const value = text.values[key];
    return typeof value === 'number' ? formatNumber(value) : translate(value, language);
  });
}

export function translateId(id: MessageId, language: Language, values: MessageValues = {}): string {
  return translate(message(id, values), language);
}

export function translateError(error: unknown, language: Language): string {
  return translate(errorText(error), language);
}

const numberFormatterCache = new Map<string, Intl.NumberFormat>();
const numberFormatterCacheLimit = 32;

/** Share value-independent formatters across renders; bound the cache for varying option sets. */
function numberFormatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const normalized = { maximumFractionDigits: 8, ...options };
  const key = JSON.stringify(
    Object.entries(normalized)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const cached = numberFormatterCache.get(key);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat('en-US', normalized);
  if (numberFormatterCache.size >= numberFormatterCacheLimit)
    numberFormatterCache.delete(numberFormatterCache.keys().next().value!);
  numberFormatterCache.set(key, formatter);
  return formatter;
}

/** Financial values and UTC dates use one representation regardless of the interface language. */
export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  return numberFormatter(options).format(value);
}

export function formatDate(value: Date | number, includeTime = false): string {
  const iso = new Date(value).toISOString();
  return includeTime ? `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC` : iso.slice(0, 10);
}

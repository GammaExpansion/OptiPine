import { errorText, message, plainText, type MessageValues, type Text } from '@pine/messages';
import type { MessageId as AppMessageId } from './en.ts';
import type { sheetEn } from './sheet-en.ts';

export type Language = 'en' | 'zh';
export type MessageId = AppMessageId | keyof typeof sheetEn;
export type Catalog = Readonly<Partial<Record<MessageId, string>>>;

export function defaultLanguage(locale: string): Language {
  return /^zh(?:-|$)/i.test(locale) ? 'zh' : 'en';
}

/**
 * The catalogs `translate` can use. The app loads the active language's before its first render
 * and the other when the language first switches to it (`loadCatalog`), so the first screen
 * carries one language; tests and the dev pages register both at once (`catalogs.ts`).
 */
const catalogs: Partial<Record<Language, Catalog>> = {};
const loading: Partial<Record<Language, Promise<void>>> = {};
const listeners = new Set<() => void>();

export function registerCatalog(language: Language, catalog: Catalog): void {
  catalogs[language] = catalog;
  for (const listener of listeners) listener();
}

export function hasCatalog(language: Language): boolean {
  return catalogs[language] !== undefined;
}

/** Call `listener` whenever a catalog becomes available; returns the unsubscribe. */
export function onCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Make `language`'s catalog available, fetching its chunk the first time; a failure may retry. */
export function loadCatalog(language: Language): Promise<void> {
  if (hasCatalog(language)) return Promise.resolve();
  loading[language] ??= (
    language === 'zh'
      ? import('./zh.ts').then((module) => module.zh)
      : import('./en.ts').then((module) => module.en)
  ).then(
    (catalog) => registerCatalog(language, catalog),
    (error: unknown) => {
      delete loading[language];
      throw error;
    },
  );
  return loading[language];
}

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
  const catalog = catalogs[language];
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

/** Financial values and UTC dates use one representation regardless of the interface language. */
export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8, ...options }).format(value);
}

export function formatDate(value: Date | number, includeTime = false): string {
  const iso = new Date(value).toISOString();
  return includeTime ? `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC` : iso.slice(0, 10);
}

import { errorText, message, plainText, type MessageValues, type Text } from '@pine/messages';
import { en, type MessageId } from './en.ts';
import { zh } from './zh.ts';

export type Language = 'en' | 'zh';
export type { MessageId } from './en.ts';
export const catalogs = { en, zh };

export function defaultLanguage(locale: string): Language {
  return /^zh(?:-|$)/i.test(locale) ? 'zh' : 'en';
}

/** Literal source text stays literal; package messages and nested groups are translated recursively. */
export function translate(text: Text, language: Language): string {
  if (typeof text === 'string') return text;
  if (text.kind === 'message-group') {
    return text.parts
      .map((part) => translate(part, language))
      .join(translate(text.separator, language));
  }
  const catalog = catalogs[language];
  if (!Object.hasOwn(catalog, text.id)) return plainText(text);
  return catalog[text.id as MessageId].replace(/\{(\w+)\}/g, (placeholder, key: string) => {
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

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { MessageValues, Text } from '@pine/messages';
import { useUiStore } from '../state/ui.ts';
import {
  translate,
  translateError,
  translateId,
  type Language,
  type MessageId,
} from './translate.ts';

interface I18n {
  language: Language;
  t: (id: MessageId, values?: MessageValues) => string;
  text: (text: Text) => string;
  error: (error: unknown) => string;
}
const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const language = useUiStore((state) => state.language);
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);
  const value = useMemo<I18n>(
    () => ({
      language,
      t: (id, values) => translateId(id, language, values),
      text: (text) => translate(text, language),
      error: (error) => translateError(error, language),
    }),
    [language],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n requires I18nProvider');
  return context;
}

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { MessageValues, Text } from '@pine/messages';
import { uiStore, useUiStore } from '../state/ui.ts';
import {
  hasCatalog,
  loadCatalog,
  onCatalog,
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

/**
 * Load the stored or browser language's catalog, to await before the first render: the first
 * screen then never shows the other language, nor ids. A catalog that fails to load leaves the
 * messages' plain fallbacks.
 */
export function loadActiveCatalog(): Promise<void> {
  return loadCatalog(uiStore.getState().language).catch(() => {});
}

/**
 * The chosen language once its catalog is in. Switching to a language for the first time fetches
 * its catalog and keeps the current one on screen meanwhile; later switches are immediate.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const wanted = useUiStore((state) => state.language);
  const ready = useSyncExternalStore(onCatalog, () => hasCatalog(wanted));
  const [shown, setShown] = useState(wanted);
  if (ready && shown !== wanted) setShown(wanted);
  const language = ready ? wanted : shown;
  useEffect(() => {
    if (!ready) void loadCatalog(wanted).catch(() => {});
  }, [ready, wanted]);
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

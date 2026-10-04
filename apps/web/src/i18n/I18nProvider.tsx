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
  hasRequestedCatalogs,
  catalogRevision,
  loadRequestedCatalogs,
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
 * screen then never shows the other language, nor ids.
 */
export function loadActiveCatalog(): Promise<void> {
  return loadCatalog(uiStore.getState().language);
}

/**
 * Switch languages only after core and every requested area's copy arrive. Areas retain their
 * old translation while loading; a boundary also guards areas opened during that switch.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const wanted = useUiStore((state) => state.language);
  const revision = useSyncExternalStore(onCatalog, catalogRevision);
  const ready = hasRequestedCatalogs(wanted);
  const [shown, setShown] = useState(wanted);
  if (ready && shown !== wanted) setShown(wanted);
  const language = ready ? wanted : shown;
  useEffect(() => {
    if (!ready) void loadRequestedCatalogs(wanted).catch(() => {});
  }, [ready, wanted, revision]);
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

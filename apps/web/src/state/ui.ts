import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { defaultLanguage, type Language } from '../i18n/translate.ts';

export type Page = 'backtest' | 'optimize';
export type DockTab = 'report' | 'equity' | 'trades' | 'code' | 'issues';
export type Dialog = 'script' | 'marketData' | 'dateRange' | 'properties';
export interface PaneSizes {
  right: number;
  chart: number;
}
export interface UiState {
  page: Page;
  dockTab: DockTab;
  paneSizes: Record<Page, PaneSizes>;
  openDialogs: Dialog[];
  language: Language;
  setPage: (page: Page) => void;
  setDockTab: (tab: DockTab) => void;
  setPaneSizes: (page: Page, sizes: Partial<PaneSizes>) => void;
  setDialogOpen: (dialog: Dialog, open: boolean) => void;
  setLanguage: (language: Language) => void;
}

export const defaultPaneSizes: PaneSizes = { right: 336, chart: 430 };
export const uiStorageKey = 'optipine.ui';

/** Private browsing and disabled storage must not prevent the workbench from opening. */
const browserStorage: StateStorage = {
  getItem(name) {
    try {
      return globalThis.localStorage?.getItem(name) ?? null;
    } catch {
      return null;
    }
  },
  setItem(name, value) {
    try {
      globalThis.localStorage?.setItem(name, value);
    } catch {
      // Persistence is optional; the in-memory session remains usable.
    }
  },
  removeItem(name) {
    try {
      globalThis.localStorage?.removeItem(name);
    } catch {
      // Nothing is persisted when storage is disabled.
    }
  },
};

function validSize(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000
    ? value
    : fallback;
}

export function createUiStore(
  storage: StateStorage = browserStorage,
  locale = globalThis.navigator?.language ?? 'en',
) {
  return createStore<UiState>()(
    persist(
      (set) => ({
        page: 'backtest',
        dockTab: 'code',
        paneSizes: {
          backtest: { ...defaultPaneSizes },
          optimize: { ...defaultPaneSizes },
        },
        openDialogs: [],
        language: defaultLanguage(locale),
        setPage: (page) => set({ page }),
        setDockTab: (dockTab) => set({ dockTab }),
        setPaneSizes: (page, sizes) =>
          set((state) => ({
            paneSizes: {
              ...state.paneSizes,
              [page]: {
                right: validSize(sizes.right, state.paneSizes[page].right),
                chart: validSize(sizes.chart, state.paneSizes[page].chart),
              },
            },
          })),
        setDialogOpen: (dialog, open) =>
          set((state) => ({
            openDialogs: open
              ? [...new Set([...state.openDialogs, dialog])]
              : state.openDialogs.filter((value) => value !== dialog),
          })),
        setLanguage: (language) => set({ language }),
      }),
      {
        name: uiStorageKey,
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: ({ language, paneSizes }) => ({ language, paneSizes }),
        merge(persisted, current) {
          const saved = persisted as Partial<UiState> | undefined;
          const panes = (page: Page) => ({
            right: validSize(saved?.paneSizes?.[page]?.right, defaultPaneSizes.right),
            chart: validSize(saved?.paneSizes?.[page]?.chart, defaultPaneSizes.chart),
          });
          return {
            ...current,
            language:
              saved?.language === 'en' || saved?.language === 'zh'
                ? saved.language
                : current.language,
            paneSizes: { backtest: panes('backtest'), optimize: panes('optimize') },
          };
        },
      },
    ),
  );
}

export const uiStore = createUiStore();
export function useUiStore<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector);
}

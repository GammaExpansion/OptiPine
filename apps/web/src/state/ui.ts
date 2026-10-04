import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { defaultLanguage, type Language } from '../i18n/translate.ts';

export type Page = 'backtest' | 'optimize';
/** The Backtest page's result tabs; `inputs` is the phone's tab for the right panel (G3). */
export type DockTab = 'report' | 'equity' | 'trades' | 'inputs' | 'code' | 'issues';
/**
 * The Optimize page's tabs on a phone (G4): R1's regions, or W1's (Windows, Stability) while
 * walk-forward is on display; Settings holds the right panel.
 */
export type OptimizeTab =
  'summary' | 'leaderboard' | 'map' | 'sensitivity' | 'windows' | 'stability' | 'settings';
export type Dialog =
  'script' | 'replaceScript' | 'marketData' | 'dateRange' | 'properties' | 'failedCombinations';
/** Pane sizes in pixels, kept per page; each page reads the fields of its own panes. */
export interface PaneSizes {
  right: number;
  /** Backtest: the chart above the dock. */
  chart: number;
  /** Optimize: the summary chart above the leaderboard and the map (R1). */
  summary: number;
  /** Optimize: the leaderboard beside the map and sensitivity. */
  leaderboard: number;
  /** Optimize: the parameter map above sensitivity. */
  map: number;
  /** Optimize, walk-forward: the stitched equity above the windows (W1). */
  wfSummary: number;
  /** Optimize, walk-forward: the per-window table beside stability and the window map. */
  wfTable: number;
}
export interface UiState {
  page: Page;
  dockTab: DockTab;
  paneSizes: Record<Page, PaneSizes>;
  openDialogs: Dialog[];
  language: Language;
  /** The right panel shows as a drawer over the page on a tablet (G2). */
  drawerOpen: boolean;
  optimizeTab: OptimizeTab;
  setPage: (page: Page) => void;
  setDockTab: (tab: DockTab) => void;
  setDrawerOpen: (open: boolean) => void;
  setOptimizeTab: (tab: OptimizeTab) => void;
  setPaneSizes: (page: Page, sizes: Partial<PaneSizes>) => void;
  setDialogOpen: (dialog: Dialog, open: boolean) => void;
  setLanguage: (language: Language) => void;
}

export const defaultPaneSizes: PaneSizes = {
  right: 336,
  chart: 430,
  summary: 232,
  leaderboard: 624,
  map: 314,
  wfSummary: 362,
  wfTable: 640,
};
const paneNames = Object.keys(defaultPaneSizes) as (keyof PaneSizes)[];
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

/** Each size from `sizes`, or from `fallback` where it is missing or unusable. */
function validSizes(
  sizes: Partial<Record<keyof PaneSizes, unknown>> | undefined,
  fallback: PaneSizes,
): PaneSizes {
  const valid = { ...fallback };
  for (const name of paneNames) valid[name] = validSize(sizes?.[name], fallback[name]);
  return valid;
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
        drawerOpen: false,
        optimizeTab: 'summary',
        // The drawer belongs to the page it was opened on.
        setPage: (page) => set({ page, drawerOpen: false }),
        setDockTab: (dockTab) => set({ dockTab }),
        setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
        setOptimizeTab: (optimizeTab) => set({ optimizeTab }),
        setPaneSizes: (page, sizes) =>
          set((state) => ({
            paneSizes: {
              ...state.paneSizes,
              [page]: validSizes(sizes, state.paneSizes[page]),
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
          const panes = (page: Page) => validSizes(saved?.paneSizes?.[page], defaultPaneSizes);
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

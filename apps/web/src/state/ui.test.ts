import { expect, test } from 'vitest';
import { createUiStore, defaultPaneSizes, uiStorageKey } from './ui.ts';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

test('persists only language and independent pane sizes, keeping session navigation ephemeral', () => {
  const storage = memoryStorage();
  const first = createUiStore(storage, 'zh-TW');
  expect(first.getState().language).toBe('zh');
  first.getState().setLanguage('en');
  first.getState().setPage('optimize');
  first.getState().setDockTab('trades');
  first.getState().setPaneSizes('backtest', { right: 380, chart: 500 });
  first.getState().setPaneSizes('optimize', { right: 410 });
  first.getState().setDialogOpen('marketData', true);
  first.getState().setDialogOpen('marketData', true);
  expect(first.getState().openDialogs).toEqual(['marketData']);
  const restored = createUiStore(storage, 'zh-CN').getState();
  expect(restored.language).toBe('en');
  expect(restored.paneSizes).toEqual({
    backtest: { right: 380, chart: 500 },
    optimize: { right: 410, chart: 430 },
  });
  expect(restored.page).toBe('backtest');
  expect(restored.dockTab).toBe('code');
  expect(restored.openDialogs).toEqual([]);
  first.getState().setDialogOpen('marketData', false);
  expect(first.getState().openDialogs).toEqual([]);
});

test('invalid persisted preferences and pane sizes fall back to usable defaults', () => {
  const storage = memoryStorage();
  storage.setItem(
    uiStorageKey,
    JSON.stringify({
      version: 1,
      state: {
        language: 'invalid',
        paneSizes: { backtest: { right: -1, chart: 'huge' } },
        page: 'optimize',
      },
    }),
  );
  const store = createUiStore(storage, 'en-US');
  expect(store.getState().language).toBe('en');
  expect(store.getState().paneSizes.backtest).toEqual(defaultPaneSizes);
  store.getState().setPaneSizes('backtest', { right: NaN, chart: Infinity });
  expect(store.getState().paneSizes.backtest).toEqual(defaultPaneSizes);
  storage.setItem(uiStorageKey, 'broken JSON');
  expect(createUiStore(storage, 'en').getState().language).toBe('en');
});

test('denied browser storage keeps an in-memory session usable', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('denied');
    },
  });
  try {
    const store = createUiStore();
    store.getState().setLanguage('zh');
    expect(store.getState().language).toBe('zh');
    store.persist.clearStorage();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', original!);
  }
});

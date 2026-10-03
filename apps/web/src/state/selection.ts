import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { BacktestResult, BacktestState } from '../workflows/backtest.ts';
import { getServices, type AppServices } from './services.ts';
import { uiStore } from './ui.ts';

/**
 * A one-shot request. `seq` grows with every request, so asking again for the same trade or line
 * is still a change a consumer can react to; a consumer remembers the last `seq` it handled.
 */
export interface TradeFocus {
  /** The trade's `#`, `TradeRow.number` from `tradeRows`. */
  readonly trade: number;
  readonly seq: number;
}

export interface CodeLineRequest {
  /** 1-based, as engine diagnostics give it. */
  readonly line: number;
  readonly seq: number;
}

/**
 * What one part of the Backtest page points at for another: a Trades row and the chart (B6), and
 * Go to line from the chart area or the Issues tab to the Pine code (B11). Trades are identified
 * by their `#` number, so a new displayed result clears both trade fields.
 */
export interface SelectionState {
  /** The trade under the pointer in the Trades tab, which the chart highlights. */
  readonly hoveredTrade: number | null;
  /** The trade a Trades row click asked the chart to focus. */
  readonly focusedTrade: TradeFocus | null;
  /** The line the Pine code tab should scroll to and select. */
  readonly codeLine: CodeLineRequest | null;
  readonly hoverTrade: (trade: number | null) => void;
  readonly focusTrade: (trade: number) => void;
  /** Switches the dock to the Pine code tab and asks it to reveal `line`. */
  readonly revealCodeLine: (line: number) => void;
}

/** The result the page displays: the open preview's while there is one (B16). */
const displayedResult = (state: BacktestState): BacktestResult | null =>
  (state.preview ?? state).result;

function createSelectionStore(services: AppServices) {
  let seq = 0;
  const store = createStore<SelectionState>()((set) => ({
    hoveredTrade: null,
    focusedTrade: null,
    codeLine: null,
    hoverTrade: (hoveredTrade) => set({ hoveredTrade }),
    focusTrade: (trade) => set({ focusedTrade: { trade, seq: ++seq } }),
    revealCodeLine(line) {
      uiStore.getState().setDockTab('code');
      set({ codeLine: { line, seq: ++seq } });
    },
  }));
  let shown = displayedResult(services.backtest.getState());
  services.onDispose(
    services.backtest.subscribe((state) => {
      const next = displayedResult(state);
      if (next === shown) return;
      shown = next;
      store.setState({ hoveredTrade: null, focusedTrade: null });
    }),
  );
  return store;
}

type SelectionStore = ReturnType<typeof createSelectionStore>;
const stores = new WeakMap<AppServices, SelectionStore>();

export function getSelectionStore(services = getServices()): SelectionStore {
  let store = stores.get(services);
  if (!store) {
    store = createSelectionStore(services);
    stores.set(services, store);
  }
  return store;
}

export function useSelectionStore<T>(selector: (state: SelectionState) => T): T {
  return useStore(getSelectionStore(), selector);
}

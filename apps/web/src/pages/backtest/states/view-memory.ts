import type { EquityView, PriceView } from '../../../charts/view-state.ts';
import type { BacktestState, Dataset } from '../../../workflows/backtest.ts';
import { shownResult } from './chart-view.ts';

interface BacktestViewMemory {
  price: PriceView;
  equity: EquityView;
  trades: { scrollTop: number };
}

const create = (): BacktestViewMemory => ({ price: {}, equity: {}, trades: { scrollTop: 0 } });
const datasets = new WeakMap<
  Dataset,
  Map<
    number,
    {
      main: BacktestViewMemory;
      previews: WeakMap<object, BacktestViewMemory>;
    }
  >
>();

/**
 * Views belong to the displayed dataset and opened script, not to a result or source revision.
 * Accepted fetches/uploads get a new Dataset; edits and re-runs retain it. Preview origins own
 * separate views so closing B16 restores the main view even after leaving the Backtest page.
 */
export function backtestViewMemory(state: BacktestState): BacktestViewMemory | undefined {
  const dataset = shownResult(state)?.computedWith.dataset ?? state.dataset;
  if (!dataset) return undefined;
  let scripts = datasets.get(dataset);
  if (!scripts) datasets.set(dataset, (scripts = new Map()));
  let views = scripts.get(state.scriptId);
  if (!views) {
    views = { main: create(), previews: new WeakMap() };
    scripts.set(state.scriptId, views);
  }
  if (!state.preview) return views.main;
  const origin = state.preview.origin;
  let preview = views.previews.get(origin);
  if (!preview) views.previews.set(origin, (preview = create()));
  return preview;
}

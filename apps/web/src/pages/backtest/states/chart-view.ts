import type { Text } from '@pine/messages';
import type { BacktestResult, BacktestState, DatasetInput } from '../../../workflows/backtest.ts';
import type { TradeContext } from '../../../workflows/trades.ts';

/** A note over the chart: a failed run (B11) or a result without trades (B12). */
export type ChartNote =
  | {
      readonly kind: 'runFailed';
      /** The first diagnostic's line; null when the Worker failed rather than the script. */
      readonly line: number | null;
      /** The engine's zero-based bar; displays add one, so it reads as a count (B11). */
      readonly bar: number | null;
      /** Set when the Worker failed. */
      readonly error: Text | null;
    }
  | { readonly kind: 'noTrades' };

export type ChartView =
  /** No script or no data: the first-launch steps (S1). */
  | { readonly kind: 'firstLaunch' }
  | {
      readonly kind: 'chart';
      /** The result's own bars, so its plots and trades line up; otherwise the current data. */
      readonly input: DatasetInput;
      /** Null for candles alone. */
      readonly result: BacktestResult | null;
      readonly note: ChartNote | null;
    };

/**
 * What the chart area shows. The displayed run and result are the open preview's while there is
 * one (B16). A failed compile shows the data alone (B10): the result no longer matches the script.
 * A failed run keeps the previous result, as every result view does (WEB.md 3.1).
 */
export function chartView(
  state: Pick<BacktestState, 'source' | 'dataset' | 'compile' | 'run' | 'result' | 'preview'>,
): ChartView {
  if (!state.source.trim() || !state.dataset) return { kind: 'firstLaunch' };
  const { run, result: shown } = state.preview ?? state;
  const result = state.compile.status === 'failed' ? null : shown;
  let note: ChartNote | null = null;
  if (run.status === 'failed') {
    const { diagnostics, bar, error } = run.failure;
    note = { kind: 'runFailed', line: diagnostics[0]?.line ?? null, bar, error };
  } else if (result && result.initialCapital !== null && result.output.trades.length === 0) {
    // An indicator has no account, so it has no trades to miss.
    note = { kind: 'noTrades' };
  }
  return {
    kind: 'chart',
    input: result ? result.computedWith.dataset.input : state.dataset.input,
    result,
    note,
  };
}

/** How trade rows of a result are measured: open trades are marked at its last bar. */
export function tradeContext(input: DatasetInput): TradeContext {
  const pointvalue = input.syminfo.pointvalue;
  return {
    pointvalue: typeof pointvalue === 'number' ? pointvalue : 1,
    lastBarIndex: input.bars.length - 1,
    lastClose: input.bars.at(-1)?.close ?? 0,
  };
}

/** A Pine timeframe as the chart legend shows it: `60` is 1h, `15` is 15m, `D` is 1D. */
export function timeframeLabel(timeframe: string): string {
  const match = /^(\d*)([SDWM]?)$/.exec(timeframe);
  if (!match || (!match[1] && !match[2])) return timeframe;
  const count = Number(match[1] || 1);
  if (match[2] === 'S') return `${count}s`;
  if (match[2]) return `${count}${match[2]}`;
  return count % 60 === 0 ? `${count / 60}h` : `${count}m`;
}

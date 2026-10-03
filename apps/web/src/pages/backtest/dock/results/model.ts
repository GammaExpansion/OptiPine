import type { BacktestResult } from '../../../../workflows/backtest.ts';
import { equitySummary, type EquityInput } from '../../../../workflows/equity.ts';
import { strategyReport } from '../../../../workflows/report.ts';
import { tradeRows } from '../../../../workflows/trades.ts';

// Use the chart area's selection rule for previews and failed compiles as well as normal runs.
export { shownResult as displayedResult } from '../../states/chart-view.ts';

/** Cache by the immutable run so selection and language changes never rebuild financial data. */
const reports = new WeakMap<BacktestResult, ReturnType<typeof strategyReport>>();
export function reportFor(result: BacktestResult) {
  let report = reports.get(result);
  if (!report) {
    report = strategyReport(result.output.metrics);
    reports.set(result, report);
  }
  return report;
}

const trades = new WeakMap<BacktestResult, ReturnType<typeof tradeRows>>();
export function tradesFor(result: BacktestResult) {
  let rows = trades.get(result);
  if (!rows) {
    const { bars, syminfo } = result.computedWith.dataset.input;
    rows = tradeRows(result.output.trades, {
      pointvalue: Number(syminfo?.pointvalue ?? 1),
      lastBarIndex: bars.length - 1,
      lastClose: bars.at(-1)?.close ?? 0,
    });
    trades.set(result, rows);
  }
  return rows;
}

function buildEquity(result: BacktestResult) {
  if (result.initialCapital === null) return null;
  const { bars, syminfo } = result.computedWith.dataset.input;
  const input: EquityInput = {
    equity: result.output.equity ?? [],
    times: bars.map((bar) => bar.time),
    initialCapital: result.initialCapital,
    timezone: String(syminfo?.timezone ?? 'Etc/UTC'),
  };
  const summary = equitySummary(input);
  return summary ? { input, summary } : null;
}

const equities = new WeakMap<BacktestResult, ReturnType<typeof buildEquity>>();
export function equityFor(result: BacktestResult) {
  if (!equities.has(result)) equities.set(result, buildEquity(result));
  return equities.get(result)!;
}

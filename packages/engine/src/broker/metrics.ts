import type { MarketBar, Trade } from '../types.ts';
import { closedEquityStatistics } from './closed-equity.ts';
import { reportCycleCash } from './report-cash.ts';
import { averageMarginUsed } from './report-margin.ts';

export interface ReportContext {
  trades: readonly Trade[];
  initialCapital: number;
  currency: string;
  pointvalue: number;
  bars: readonly MarketBar[];
  mintick?: number;
  mincontract?: number;
  riskFreeRate?: number;
  intrabarDrawdown?: { value: number; percent: number };
  intrabarRunup?: { value: number; percent: number };
  /** Account equity sampled at the end of each executed bar. */
  equity?: readonly number[];
  /** Account margin indexed by input bar, including the final snapshot; partial runs may be shorter. */
  marginUsed?: readonly number[];
  maxMarginUsed?: number;
  /** Exact nonnegative intrabar position peaks; these cannot be recovered from bar-close positions. */
  maxContractsHeld?: { all: number; long: number; short: number };
  liquidations?: readonly { direction: Trade['direction']; quantity: number; price: number }[];
}

type MetricValue = number | string | null;
type Metrics = Record<string, MetricValue>;
const total = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0);
const average = (values: readonly number[]): number | null =>
  values.length ? total(values) / values.length : null;
const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

/** Returns include entry commission in the invested amount, as in Pine's trade statistics. */
export function tradeReturn(trade: Trade, pointvalue: number): number {
  const cost = trade.entryPrice * trade.quantity * pointvalue + trade.entryCommission;
  return (trade.profit / cost) * 100;
}

const month = (time: number): number => {
  const date = new Date(time * 1000);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
};

function returnRange(context: ReportContext): { first: number; last: number } {
  let first = Infinity;
  let last = -Infinity;
  for (const trade of context.trades) {
    first = Math.min(first, trade.entryTime);
    last = Math.max(last, trade.exitTime ?? context.bars.at(-1)!.time);
  }
  return {
    first: Number.isFinite(first) ? first : context.bars[0].time,
    last: Number.isFinite(last) ? last : context.bars.at(-1)!.time,
  };
}

/** Closed-equity returns; an open position contributes its mark only to the final period. */
function periodReturns(context: ReportContext, period: (time: number) => number): number[] {
  if (!context.bars.length) return [];
  const range = returnRange(context);
  const balances = new Map<number, number>();
  let balance = context.initialCapital;
  for (const trade of context.trades) {
    if (trade.exitTime === null) continue;
    balance += trade.profit;
    balances.set(period(trade.exitTime), balance);
  }
  const lastPeriod = period(range.last);
  balances.set(
    lastPeriod,
    balance +
      total(context.trades.filter((trade) => trade.exitTime === null).map((trade) => trade.profit)),
  );
  const returns: number[] = [];
  let previous = context.initialCapital;
  for (let key = period(range.first); key <= lastPeriod; key++) {
    const current = balances.get(key) ?? previous;
    returns.push(previous === 0 ? NaN : (current - previous) / previous);
    previous = current;
  }
  return returns;
}

/** Calendar-month returns across the traded range, carrying intervening idle months. */
export function monthlyReturns(context: ReportContext): number[] {
  return periodReturns(context, month);
}

function riskReturns(context: ReportContext): { values: number[]; periodsPerYear: number } {
  if (!context.bars.length) return { values: [], periodsPerYear: 12 };
  const range = returnRange(context);
  // Native Jan–Mar captures retain daily returns; Jan–Apr switches to months.
  // Closed strategies end at the last exit, excluding a subsequent idle tail.
  const monthly = !context.trades.length || month(range.last) - month(range.first) > 2;
  return {
    values: periodReturns(context, monthly ? month : (time) => Math.floor(time / 86400)),
    periodsPerYear: monthly ? 12 : 365,
  };
}

/**
 * A report is derived only from executed economics. Missing optional observations leave
 * the associated metrics absent; an undefined statistic with complete inputs is null.
 */
export function calculateMetrics(context: ReportContext): Metrics {
  const { trades, initialCapital, currency, pointvalue } = context;
  const closed = trades.filter((trade) => trade.exitBar !== null);
  const open = trades.filter((trade) => trade.exitBar === null);
  const metrics: Metrics = {};
  const set = (sheet: string, name: string, scope: string, value: MetricValue, percent = false) => {
    metrics[`${sheet}/${name}/${scope} ${percent ? '%' : currency}`] = value;
  };
  const capitalPercent = (value: number): number => (value / initialCapital) * 100;

  // Outliers are selected over all closed trade returns, then attributed to each side.
  // Recomputing separate thresholds for long/short would change which trades are outliers.
  const returns = closed.map((trade) => tradeReturn(trade, pointvalue));
  const meanReturn = average(returns) ?? 0;
  const deviation =
    returns.length > 1
      ? Math.sqrt(total(returns.map((value) => (value - meanReturn) ** 2)) / (returns.length - 1))
      : 0;
  const outliers = new Set(
    closed.filter((_, index) => Math.abs(returns[index] - meanReturn) > 2 * deviation),
  );

  set('Performance', 'Initial capital', 'All', initialCapital);
  // Open trade profit is net of its entry fee. Account reporting recognizes
  // that fee in realized losses and reports the floating price PnL separately.
  const openCommission = total(open.map((trade) => trade.entryCommission));
  const openProfit = total(open.map((trade) => trade.profit)) + openCommission;
  set('Performance', 'Open PnL', 'All', openProfit);
  const closedProfit = total(closed.map((trade) => trade.profit));
  const realizedProfit = closedProfit - openCommission;
  const averageMargin = averageMarginUsed(trades, context.marginUsed, context.bars.length);
  if (averageMargin !== undefined) set('Performance', 'Average margin used', 'All', averageMargin);
  const closedEquity = initialCapital + realizedProfit;
  const closedStatistics = closedEquityStatistics(trades, initialCapital);
  for (const [name, statistics] of [
    ['run-up', closedStatistics.runup],
    ['drawdown', closedStatistics.drawdown],
  ] as const) {
    set(
      'Performance',
      `Average ${name} (close-to-close)`,
      'All',
      statistics ? reportCycleCash(statistics.average.value) : null,
    );
    set(
      'Performance',
      `Average ${name} (close-to-close)`,
      'All',
      statistics?.average.percent ?? null,
      true,
    );
    set(
      'Performance',
      `Max ${name} (close-to-close)`,
      'All',
      statistics ? reportCycleCash(statistics.maximum.value) : null,
    );
    set(
      'Performance',
      `Max ${name} (close-to-close)`,
      'All',
      statistics?.maximum.percent ?? null,
      true,
    );
    const durationUnit = statistics && statistics.average.days < 1 ? 'hour' : 'day';
    const duration = statistics
      ? Math.floor(statistics.average.days * (durationUnit === 'hour' ? 24 : 1))
      : null;
    set(
      'Performance',
      `Average ${name} duration (close-to-close)`,
      'All',
      duration !== null
        ? `${duration.toLocaleString('en-US')} ${durationUnit}${duration === 1 ? '' : 's'}`
        : null,
    );
  }
  set(
    'Performance',
    'Open PnL',
    'All',
    closedEquity === 0 ? null : (openProfit / closedEquity) * 100,
    true,
  );

  for (const scope of ['All', 'Long', 'Short'] as const) {
    const onSide = (trade: { direction: Trade['direction'] }): boolean =>
      scope === 'All' || trade.direction === scope.toLowerCase();
    const positions = trades.filter(onSide);
    const history = closed.filter(onSide);
    const winners = history.filter((trade) => trade.profit > 0);
    const losers = history.filter((trade) => trade.profit < 0);
    const entryFees = total(open.filter(onSide).map((trade) => trade.entryCommission));
    const net = total(history.map((trade) => trade.profit)) - entryFees;
    const grossProfit = total(winners.map((trade) => trade.profit));
    const grossLoss = -total(losers.map((trade) => trade.profit)) + entryFees;
    const largestProfit = winners.length ? Math.max(...winners.map((trade) => trade.profit)) : null;
    const largestLoss = losers.length ? Math.max(...losers.map((trade) => -trade.profit)) : null;
    const averageProfit = average(winners.map((trade) => trade.profit));
    const averageLoss = losers.length ? grossLoss / losers.length : null;
    const performance = (name: string, value: MetricValue, percent = false) =>
      set('Performance', name, scope, value, percent);
    const analysis = (name: string, value: MetricValue, percent = false) =>
      set('Trades analysis', name, scope, value, percent);

    for (const [name, value] of [
      ['Net profit', net],
      ['Gross profit', grossProfit],
      ['Gross loss', grossLoss],
    ] as const) {
      performance(name, value);
      performance(name, capitalPercent(value), true);
    }
    performance('Expected payoff', history.length ? net / history.length : 0);
    // New native reports leave Expectancy undefined when this side has no closed trades.
    performance('Expectancy', history.length ? net / history.length : null);
    performance('Commission paid', total(positions.map((trade) => trade.commission)));
    performance('Return on initial capital', capitalPercent(net), true);
    if (averageMargin !== undefined)
      // Each side uses the entire account's open PnL and shared average margin.
      performance(
        'Margin efficiency',
        averageMargin === 0 ? 0 : (net + openProfit) / averageMargin,
      );
    if (context.bars.length > 1) {
      const years = (context.bars.at(-1)!.time - context.bars[0].time) / (365 * 86400);
      const finalRatio = (initialCapital + net) / initialCapital;
      performance(
        'Annualized return (CAGR)',
        years > 0 && finalRatio > 0 ? (finalRatio ** (1 / years) - 1) * 100 : 0,
        true,
      );
    }
    performance('Net PnL as % of largest loss', largestLoss ? (net / largestLoss) * 100 : 0, true);
    performance(
      'Largest profit as % of gross profit',
      grossProfit ? (largestProfit! / grossProfit) * 100 : 0,
      true,
    );
    performance(
      'Largest loss as % of gross loss',
      grossLoss ? (largestLoss! / grossLoss) * 100 : 0,
      true,
    );

    analysis('Total open trades', open.filter(onSide).length);
    analysis('Total trades', history.length);
    analysis('Total winners', winners.length);
    analysis('Total losers', losers.length);
    analysis('Even trades', history.length - winners.length - losers.length);
    analysis(
      'Percent profitable',
      history.length ? (winners.length / history.length) * 100 : null,
      true,
    );
    analysis('Average PnL', average(history.map((trade) => trade.profit)));
    analysis('Average PnL', average(history.map((trade) => tradeReturn(trade, pointvalue))), true);
    analysis('Expectancy', history.length ? net / history.length : null);
    analysis('Expectancy', average(history.map((trade) => tradeReturn(trade, pointvalue))), true);
    analysis('Average profit', averageProfit);
    analysis(
      'Average profit',
      average(winners.map((trade) => tradeReturn(trade, pointvalue))),
      true,
    );
    analysis('Average loss', averageLoss);
    analysis('Average loss', average(losers.map((trade) => -tradeReturn(trade, pointvalue))), true);
    analysis(
      'Average profit / average loss',
      averageLoss === null ? null : ratio(averageProfit ?? 0, averageLoss),
    );
    analysis('Largest profit', largestProfit);
    analysis(
      'Largest profit %',
      winners.length ? Math.max(...winners.map((trade) => tradeReturn(trade, pointvalue))) : null,
      true,
    );
    analysis('Largest loss', largestLoss);
    analysis(
      'Largest loss %',
      losers.length ? Math.max(...losers.map((trade) => -tradeReturn(trade, pointvalue))) : null,
      true,
    );
    const outlierTrades = history.filter((trade) => outliers.has(trade));
    const outlierProfit = total(outlierTrades.map((trade) => trade.profit));
    analysis('Outliers', outlierTrades.length);
    analysis('Outliers P&L', outlierProfit);
    analysis('Outliers P&L', capitalPercent(outlierProfit), true);
    for (const [name, rows] of [
      ['trades', history],
      ['winners', winners],
      ['losers', losers],
    ] as const) {
      analysis(
        `Average bars in ${name}`,
        average(rows.map((trade) => trade.exitBar! - trade.entryBar + 1)) ?? 0,
      );
    }
    set('Risk-adjusted performance', 'Profit factor', scope, ratio(grossProfit, grossLoss));

    if (context.maxContractsHeld)
      performance(
        'Max contracts held',
        // This report field uses whole contracts, with positive half ties rounded up.
        Math.round(context.maxContractsHeld[scope.toLowerCase() as 'all' | 'long' | 'short']),
      );
    if (context.liquidations) {
      const liquidations = context.liquidations.filter(onSide);
      performance(
        'Total liquidated volume',
        total(liquidations.map((fill) => fill.quantity * fill.price * pointvalue)),
      );
      performance(
        'Largest liquidated volume',
        Math.max(0, ...liquidations.map((fill) => fill.quantity * fill.price * pointvalue)),
      );
      set('Risk-adjusted performance', 'Margin calls', scope, liquidations.length);
    }
  }
  if (trades.length && context.bars.length && context.mintick && context.mincontract) {
    // The benchmark starts at the first reported trade's entry. With ANY close order,
    // that trade can have entered after a still-open or later-closed position.
    const first = trades[0].entryPrice;
    const last = Math.round(context.bars.at(-1)!.close / context.mintick) * context.mintick;
    const quantity =
      Math.floor(initialCapital / (first * pointvalue * context.mincontract)) * context.mincontract;
    const profit = (last - first) * quantity * pointvalue;
    set('Performance', 'Buy and hold PnL', 'All', profit);
    set('Performance', 'Buy and hold PnL', 'All', capitalPercent(profit), true);
    set('Performance', 'Buy and hold % gain', 'All', (last / first - 1) * 100, true);
    set('Performance', 'Strategy outperformance', 'All', realizedProfit - profit);
    set(
      'Performance',
      'Strategy outperformance',
      'All',
      capitalPercent(realizedProfit - profit),
      true,
    );
  }
  const periodic = riskReturns(context);
  if (periodic.values.length && periodic.values.every(Number.isFinite)) {
    const mean = average(periodic.values)!;
    const riskFree = (context.riskFreeRate ?? 2) / 100 / periodic.periodsPerYear;
    const excess = mean - riskFree;
    const deviation = Math.sqrt(average(periodic.values.map((value) => (value - mean) ** 2))!);
    const downside = Math.sqrt(
      average(periodic.values.map((value) => Math.min(value - riskFree, 0) ** 2))!,
    );
    set('Risk-adjusted performance', 'Sharpe ratio', 'All', ratio(excess, deviation));
    set('Risk-adjusted performance', 'Sortino ratio', 'All', ratio(excess, downside));
  }
  for (const [name, observation] of [
    ['drawdown', context.intrabarDrawdown],
    ['run-up', context.intrabarRunup],
  ] as const) {
    if (!observation) continue;
    set('Performance', `Max ${name} (intrabar)`, 'All', observation.value);
    set('Performance', `Max ${name} (intrabar)`, 'All', observation.percent, true);
    set(
      'Performance',
      `Max ${name} as % of initial capital (intrabar)`,
      'All',
      capitalPercent(observation.value),
      true,
    );
  }
  if (context.intrabarDrawdown && context.marginUsed) {
    const required =
      context.intrabarDrawdown.value +
      (context.maxMarginUsed ?? Math.max(0, ...context.marginUsed));
    set('Performance', 'Account size required', 'All', required);
    for (const scope of ['All', 'Long', 'Short']) {
      const onSide = (trade: Trade): boolean =>
        scope === 'All' || trade.direction === scope.toLowerCase();
      const net =
        total(closed.filter(onSide).map((trade) => trade.profit)) -
        total(open.filter(onSide).map((trade) => trade.entryCommission));
      set(
        'Performance',
        'Return of max drawdown',
        scope,
        context.intrabarDrawdown.value === 0
          ? 0
          : (net + openProfit) / context.intrabarDrawdown.value,
      );
      set(
        'Performance',
        'Return on account size required',
        scope,
        required === 0 ? 0 : (net / required) * 100,
        true,
      );
    }
  }
  if (context.marginUsed) {
    set(
      'Performance',
      'Max margin used',
      'All',
      context.maxMarginUsed ?? Math.max(0, ...context.marginUsed),
    );
  }
  return metrics;
}

/**
 * TradingView's report has a rectangular grid with two kinds of blank: cells outside a
 * metric's dimensions, and applicable cells whose result is undefined (such as a ratio
 * with no trades). This describes the export schema, independent of any case or result.
 */
type Dimensions =
  'all-value' | 'all-percent' | 'all-both' | 'side-value' | 'side-percent' | 'side-both';

const dimensions = new Map<string, Dimensions>();
function register(sheet: string, shape: Dimensions, names: string[]): void {
  for (const name of names) dimensions.set(`${sheet}/${name}`, shape);
}

register('Performance', 'all-value', [
  'Initial capital',
  'Account size required',
  'Average margin used',
  'Max margin used',
  'Average run-up duration (close-to-close)',
  'Average drawdown duration (close-to-close)',
]);
register('Performance', 'all-percent', [
  'Buy and hold % gain',
  'Max run-up as % of initial capital (intrabar)',
  'Max drawdown as % of initial capital (intrabar)',
]);
register('Performance', 'all-both', [
  'Open PnL',
  'Buy and hold PnL',
  'Strategy outperformance',
  'Average run-up (close-to-close)',
  'Max run-up (close-to-close)',
  'Max run-up (intrabar)',
  'Average drawdown (close-to-close)',
  'Max drawdown (close-to-close)',
  'Max drawdown (intrabar)',
]);
register('Performance', 'side-value', [
  'Expected payoff',
  'Expectancy',
  'Commission paid',
  'Max contracts held',
  'Margin efficiency',
  'Total liquidated volume',
  'Largest liquidated volume',
  'Return of max drawdown',
]);
register('Performance', 'side-percent', [
  'Annualized return (CAGR)',
  'Return on initial capital',
  'Return on account size required',
  'Net PnL as % of largest loss',
  'Largest profit as % of gross profit',
  'Largest loss as % of gross loss',
]);
register('Performance', 'side-both', ['Net profit', 'Gross profit', 'Gross loss']);
register('Trades analysis', 'side-value', [
  'Total open trades',
  'Total trades',
  'Total winners',
  'Total losers',
  'Even trades',
  'Average profit / average loss',
  'Largest profit',
  'Largest loss',
  'Outliers',
  'Average bars in trades',
  'Average bars in winners',
  'Average bars in losers',
]);
register('Trades analysis', 'side-percent', [
  'Percent profitable',
  'Largest profit %',
  'Largest loss %',
]);
register('Trades analysis', 'side-both', [
  'Average PnL',
  'Expectancy',
  'Average profit',
  'Average loss',
  'Outliers P&L',
]);
register('Risk-adjusted performance', 'all-value', ['Sharpe ratio', 'Sortino ratio']);
register('Risk-adjusted performance', 'side-value', ['Profit factor', 'Margin calls']);

export function isMetricCell(sheet: string, metric: string, header: string): boolean {
  const shape = dimensions.get(`${sheet}/${metric}`);
  if (!shape) throw new Error(`Unknown report metric layout: ${sheet}/${metric}`);
  const column = /^(All|Long|Short) (\S+)$/.exec(header);
  if (!column) throw new Error(`Invalid report metric column: ${header}`);
  const [scope, unit] = shape.split('-');
  return (
    (scope === 'side' || column[1] === 'All') &&
    (unit === 'both' || (column[2] === '%' ? unit === 'percent' : unit === 'value'))
  );
}

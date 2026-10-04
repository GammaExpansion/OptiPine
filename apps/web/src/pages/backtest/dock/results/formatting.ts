import { message, type Message } from '@pine/messages';
import type { MetricValue } from '@pine/optimizer';
import type { MessageId } from '../../../../i18n/translate.ts';

export interface NumberStyle {
  decimals?: number;
  signed?: boolean;
  loss?: boolean;
  percent?: boolean;
}

const formats = new Map<number, Intl.NumberFormat>();
/** Only presentation rounding and signs live here; amounts and ratios come from workflows. */
export function numberMessage(value: MetricValue | undefined, style: NumberStyle = {}): Message {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'number' && !Number.isFinite(value))
  )
    return message('common.unavailable');
  if (typeof value === 'string') return message('report.value', { value });
  const decimals = style.decimals ?? 2;
  let formatter = formats.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formats.set(decimals, formatter);
  }
  const absolute = formatter.format(Math.abs(value));
  // Rounding to zero must not leave a negative zero or a spurious profit sign.
  const nonzero = Number(absolute.replaceAll(',', '')) !== 0;
  const negative = nonzero && (style.loss || value < 0);
  const signed = message(
    negative ? 'report.negative' : style.signed && nonzero ? 'report.positive' : 'report.value',
    { value: absolute },
  );
  return style.percent ? message('report.percent', { value: signed }) : signed;
}

export const profitTone = (value: MetricValue | undefined) =>
  typeof value !== 'number' || !Number.isFinite(value) || value === 0
    ? 'neutral'
    : value > 0
      ? 'profit'
      : 'loss';

interface MetricStyle extends NumberStyle {
  label: MessageId;
  color?: boolean;
  bars?: boolean;
}

export const metricStyles: Readonly<Record<string, MetricStyle>> = {
  'Performance/Net profit': { label: 'report.netProfit', signed: true, color: true },
  'Performance/Gross profit': { label: 'report.grossProfit' },
  'Performance/Gross loss': { label: 'report.grossLoss' },
  'Performance/Commission paid': { label: 'report.commission' },
  'Performance/Buy and hold PnL': { label: 'report.buyHold', signed: true },
  'Performance/Max run-up (intrabar)': { label: 'report.maxRunUp', signed: true },
  'Performance/Max drawdown (intrabar)': { label: 'report.maxDrawdown' },
  'Performance/Open PnL': { label: 'report.openPnl', signed: true, color: true },
  'Trades analysis/Total trades': { label: 'report.totalTrades', decimals: 0 },
  'Trades analysis/Total winners': { label: 'report.winningTrades', decimals: 0 },
  'Trades analysis/Total losers': { label: 'report.losingTrades', decimals: 0 },
  'Trades analysis/Percent profitable': { label: 'report.winRate' },
  'Trades analysis/Average PnL': { label: 'report.averagePnl', signed: true },
  'Trades analysis/Average profit': { label: 'report.averageWin', signed: true },
  'Trades analysis/Average loss': { label: 'report.averageLoss' },
  'Trades analysis/Average profit / average loss': { label: 'report.winLoss' },
  'Risk-adjusted performance/Sharpe ratio': { label: 'report.sharpe' },
  'Risk-adjusted performance/Sortino ratio': { label: 'report.sortino' },
  'Risk-adjusted performance/Profit factor': { label: 'report.profitFactor' },
  'Trades analysis/Largest profit': { label: 'report.largestWin', signed: true },
  'Trades analysis/Largest loss': { label: 'report.largestLoss' },
  'Trades analysis/Average bars in trades': {
    label: 'report.averageBars',
    decimals: 0,
    bars: true,
  },
  // The engine reports whole contracts, as TradingView does; a decimal would claim a precision
  // the figure does not have (bug bash #34).
  'Performance/Max contracts held': { label: 'report.maxContracts', decimals: 0 },
  'Risk-adjusted performance/Margin calls': { label: 'report.marginCalls', decimals: 0 },
};

export function metricMessage(
  id: string,
  value: MetricValue | undefined,
  show: 'value' | 'percent',
  loss: boolean,
) {
  const style = metricStyles[id];
  const result = numberMessage(value, { ...style, loss, percent: show === 'percent' });
  return style?.bars && typeof value === 'number' && Number.isFinite(value)
    ? message('report.bars', { value: result, count: value })
    : result;
}

export function metricTone(id: string, value: MetricValue | undefined) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'number' && !Number.isFinite(value))
  )
    return 'muted';
  return metricStyles[id]?.color ? profitTone(value) : 'neutral';
}

export function tradeTime(time: number | null): Message {
  return time === null
    ? message('trades.open')
    : message('report.value', {
        value: new Date(time * 1000).toISOString().slice(0, 16).replace('T', ' '),
      });
}

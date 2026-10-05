import { message, type Message } from '@pine/messages';
import { formatNumber, type MessageId } from '../../../i18n/translate.ts';
import type { FilterCondition, FilterMetricId } from '../../../workflows/optimize-ranking.ts';

/** Metrics a condition states in percent, as their report keys do. */
const percentMetrics: ReadonlySet<FilterMetricId> = new Set([
  'annualizedReturn',
  'maxDrawdown',
  'winRate',
]);

/** Ratios keep a decimal, as the mock writes them: PF ≥ 1.2, Sharpe ratio ≥ 1.0 (R10). */
const ratioMetrics: ReadonlySet<FilterMetricId> = new Set([
  'profitFactor',
  'sharpeRatio',
  'sortinoRatio',
]);

const operators = { '>=': '≥', '<=': '≤' } as const;

/** A metric's short name, as filter chips and conditions use it: Trades, Max DD, PF. */
export function metricName(metric: FilterMetricId): Message {
  return message(`optimize.setup.metric.${metric}` satisfies MessageId);
}

/** A condition's value with its unit: 15% for a drawdown, 30 for trades, 1.0 for a ratio. */
export function filterValueText(
  filter: Pick<FilterCondition, 'metric' | 'value'>,
): Message | string | number {
  if (percentMetrics.has(filter.metric))
    return message('optimize.setup.percent', { value: filter.value });
  return ratioMetrics.has(filter.metric)
    ? formatNumber(filter.value, { minimumFractionDigits: 1 })
    : filter.value;
}

/**
 * A condition's text wherever it appears, chips, presets and R9's diagnosis alike: Trades ≥ 5 or
 * Max DD ≤ 35% (O1, R1, R9, R10).
 */
export function filterLabel(filter: FilterCondition): Message {
  return message('optimize.setup.filter', {
    metric: metricName(filter.metric),
    operator: operators[filter.operator],
    value: filterValueText(filter),
  });
}

import { message, type Message } from '@pine/messages';
import type { MessageId } from '../../../i18n/translate.ts';
import type { FilterCondition, FilterMetricId } from '../../../workflows/optimize-ranking.ts';

/** Metrics a condition states in percent, as their report keys do. */
const percentMetrics: ReadonlySet<FilterMetricId> = new Set([
  'annualizedReturn',
  'maxDrawdown',
  'winRate',
]);

const operators = { '>=': '≥', '<=': '≤' } as const;

/** A metric's short name, as filter chips and conditions use it: Trades, Max DD, PF. */
export function metricName(metric: FilterMetricId): Message {
  return message(`optimize.setup.metric.${metric}` satisfies MessageId);
}

/** A condition's value with its unit: 15% for a drawdown, 30 for trades. */
export function filterValueText(
  filter: Pick<FilterCondition, 'metric' | 'value'>,
): Message | number {
  return percentMetrics.has(filter.metric)
    ? message('optimize.setup.percent', { value: filter.value })
    : filter.value;
}

/** A filter chip's text, such as Trades ≥ 30 or Max DD ≤ 15% (O1, R1). */
export function filterLabel(filter: FilterCondition): Message {
  return message('optimize.setup.filter', {
    metric: metricName(filter.metric),
    operator: operators[filter.operator],
    value: filterValueText(filter),
  });
}

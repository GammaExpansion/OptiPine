import type { LiteralValue } from '@pine/engine';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../../i18n/translate.ts';
import type { FilterCondition, FilterMetricId } from '../../../workflows/optimize-ranking.ts';

/** Presentation only: workflow values keep their original units and missing-value semantics. */
export function useResultFormat() {
  const { t } = useI18n();
  const number = (value: number | null | undefined, signed = false) =>
    value == null || Number.isNaN(value)
      ? t('common.unavailable')
      : formatNumber(value, {
          maximumFractionDigits: 2,
          signDisplay: signed ? 'exceptZero' : 'auto',
        });
  const parameter = (value: LiteralValue | undefined) =>
    typeof value === 'boolean'
      ? t(value ? 'inputs.on' : 'inputs.off')
      : typeof value === 'number'
        ? formatNumber(value)
        : value == null
          ? t('common.unavailable')
          : String(value);
  const metricValue = (metric: FilterMetricId, value: number | null) =>
    value !== null && ['annualizedReturn', 'maxDrawdown', 'winRate'].includes(metric)
      ? t('optimize.leaderboard.percent', { value: number(value) })
      : number(value);
  const condition = (filter: FilterCondition) =>
    t('optimize.leaderboard.condition', {
      metric: t(`optimize.leaderboard.metric.${filter.metric}`),
      operator: t(
        filter.operator === '>=' ? 'optimize.leaderboard.greater' : 'optimize.leaderboard.less',
      ),
      value: metricValue(filter.metric, filter.value),
    });
  return { number, parameter, metricValue, condition };
}

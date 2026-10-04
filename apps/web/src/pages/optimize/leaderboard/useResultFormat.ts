import type { LiteralValue } from '@pine/engine';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import type { FilterCondition, FilterMetricId } from '../../../workflows/optimize-ranking.ts';
import { parameterText } from '../../../workflows/optimize-parameters.ts';
import type { SearchRow } from '../../../workflows/optimize-setup.ts';

// Financial formatting is always en-US (WEB.md 6). Reuse the formatters across the page's
// cells: constructing Intl.NumberFormat for each value dominates a throttled live table render.
const figures = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const signedFigures = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

/** Presentation only: workflow values keep their original units and missing-value semantics. */
export function useResultFormat(rows: readonly SearchRow[] = []) {
  const { t, text } = useI18n();
  const number = (value: number | null | undefined, signed = false) =>
    value == null || Number.isNaN(value)
      ? t('common.unavailable')
      : (signed ? signedFigures : figures).format(value);
  const parameter = (value: LiteralValue | undefined, title?: string) =>
    text(
      parameterText(
        value,
        rows.find((row) => row.descriptor.title === title),
      ),
    );
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

import type { LiteralValue } from '@pine/engine';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../../i18n/translate.ts';
import type { FilterCondition, FilterMetricId } from '../../../workflows/optimize-ranking.ts';
import { parameterText } from '../../../workflows/optimize-parameters.ts';
import { filterLabel } from '../filters/filter-label.ts';
import type { SearchRow } from '../../../workflows/optimize-setup.ts';

const minus = (value: string) => value.replace('-', '−');

/** Presentation only: workflow values keep their original units and missing-value semantics. */
export function useResultFormat(rows: readonly SearchRow[] = []) {
  const { t, text } = useI18n();
  /**
   * A figure with exactly `digits` decimals, as R1 writes them (whole amounts, profit factor to
   * two); without `digits`, up to two, for a value a user typed. Negatives take a minus sign.
   */
  const number = (value: number | null | undefined, signed = false, digits?: number) =>
    value == null || Number.isNaN(value)
      ? t('common.unavailable')
      : minus(
          formatNumber(value, {
            minimumFractionDigits: digits ?? 0,
            maximumFractionDigits: digits ?? 2,
            signDisplay: signed ? 'exceptZero' : 'auto',
          }),
        );
  /** A drawdown as the leaderboard shows it, a loss: "−7.5%". */
  const drawdown = (value: number | null) =>
    value == null || Number.isNaN(value)
      ? t('common.unavailable')
      : t('optimize.leaderboard.percent', { value: number(value && -Math.abs(value), false, 1) });
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
  /** A condition as the filter chips read it (R9, R10). */
  const condition = (filter: FilterCondition) => text(filterLabel(filter));
  return { number, drawdown, parameter, metricValue, condition };
}

import { message } from '@pine/messages';
import type { AnalysisValue, HeatmapCell, MetricConstraint } from '@pine/optimizer';
import {
  filterMetricIds,
  reportMetrics,
  type Direction,
} from '../../../workflows/optimize-ranking.ts';
import { filterLabel } from '../filters/filter-label.ts';
import { parameterText } from '../../../workflows/optimize-parameters.ts';
import type { SearchRow } from '../../../workflows/optimize-setup.ts';

/** The slice that takes the best value: Max, or Min when the objective is minimized (R4). */
export function bestSlice(direction: Direction): 'optimize.map.max' | 'optimize.map.min' {
  return direction === 'minimize' ? 'optimize.map.min' : 'optimize.map.max';
}

export function axisLabel(title: string, binSize: number) {
  return message(binSize > 1 ? 'optimize.map.binnedAxis' : 'optimize.map.axisTitle', {
    title,
    count: binSize,
  });
}

export function valueLabel(value: AnalysisValue | null | undefined, row?: SearchRow) {
  return message(
    value === null || value === undefined
      ? 'optimize.map.na'
      : typeof value === 'boolean'
        ? value
          ? 'optimize.map.on'
          : 'optimize.map.off'
        : 'optimize.map.value',
    { value: row ? parameterText(value, row) : typeof value === 'boolean' ? '' : (value ?? '') },
  );
}

export function rangeLabel(values: readonly (AnalysisValue | undefined)[], row?: SearchRow) {
  return message(values.length > 1 ? 'optimize.map.range' : 'optimize.map.value', {
    from: valueLabel(values[0], row),
    to: valueLabel(values.at(-1), row),
    value: valueLabel(values[0], row),
  });
}

export function isBinnedCell(cell: HeatmapCell) {
  return (cell.xValues?.length ?? 1) > 1 || (cell.yValues?.length ?? 1) > 1;
}

/** Reuse the filter chips' names and percentage units when explaining excluded map values. */
export function failedConstraintLabel(constraint: MetricConstraint) {
  const metric = filterMetricIds.find((metric) => reportMetrics[metric] === constraint.metric);
  return metric
    ? filterLabel({ ...constraint, metric })
    : message('optimize.setup.filter', {
        metric: constraint.metric,
        operator: constraint.operator === '>=' ? '≥' : '≤',
        value: constraint.value,
      });
}

import { message } from '@pine/messages';
import type { AnalysisValue, HeatmapCell } from '@pine/optimizer';

export function axisLabel(title: string, binSize: number) {
  return message(binSize > 1 ? 'optimize.map.binnedAxis' : 'optimize.map.axisTitle', {
    title,
    count: binSize,
  });
}

export function valueLabel(value: AnalysisValue | null | undefined) {
  return message(
    value === null || value === undefined
      ? 'optimize.map.na'
      : typeof value === 'boolean'
        ? value
          ? 'optimize.map.on'
          : 'optimize.map.off'
        : 'optimize.map.value',
    { value: value == null ? '' : typeof value === 'boolean' ? '' : value },
  );
}

export function rangeLabel(values: readonly (AnalysisValue | undefined)[]) {
  return message(values.length > 1 ? 'optimize.map.range' : 'optimize.map.value', {
    from: valueLabel(values[0]),
    to: valueLabel(values.at(-1)),
    value: valueLabel(values[0]),
  });
}

export function isBinnedCell(cell: HeatmapCell) {
  return (cell.xValues?.length ?? 1) > 1 || (cell.yValues?.length ?? 1) > 1;
}

import type { AnalysisValue, Heatmap, HeatmapCell } from './analysis.ts';

export interface BinDetailSelection {
  x: AnalysisValue;
  y?: AnalysisValue;
  z?: AnalysisValue;
}
export interface BinDetail {
  selectedCell: HeatmapCell;
  localMap: Heatmap;
  mergedCells: HeatmapCell[];
  mean: number | null;
  xValues: AnalysisValue[];
  yValues: (AnalysisValue | undefined)[];
  /** Panel-axis positions, first edge inclusive and last edge exclusive, before reversing the Y axis. */
  panelXRange: [number, number];
  panelYRange: [number, number];
}

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
const unique = <T>(values: T[]): T[] => [
  ...new Map(values.map((value) => [JSON.stringify(value), value])).values(),
];
const includes = (values: readonly unknown[], value: unknown): boolean =>
  values.some((candidate) => same(candidate, value));

/** A centered interval shifts at either edge to keep its requested width when possible. */
function around(center: number, count: number, length: number): [number, number] {
  const size = Math.min(count, length);
  const start = Math.max(0, Math.min(length - size, Math.floor(center - (size - 1) / 2)));
  return [start, start + size];
}

function binEdges(
  bins: readonly (readonly unknown[])[],
  first: unknown,
  last: unknown,
): [number, number] | undefined {
  let from: number | undefined, to: number | undefined;
  for (const [index, values] of bins.entries()) {
    const start = values.findIndex((value) => same(value, first));
    const end = values.findIndex((value) => same(value, last));
    // A panel cell represents the whole bin. Mark every bin intersecting the
    // real-value window rather than implying sub-cell precision on the main map.
    if (start >= 0) from = index;
    if (end >= 0) to = index + 1;
  }
  return from === undefined || to === undefined ? undefined : [from, to];
}

/** Select a centered real-value interval, keeping the selected interval intact. */
function selectedWindow(
  values: readonly AnalysisValue[],
  selected: readonly AnalysisValue[],
  requested: number,
): [number, number] {
  const indices = selected
    .map((value) => values.findIndex((candidate) => same(candidate, value)))
    .filter((index) => index >= 0);
  if (!indices.length) return [0, Math.min(requested, values.length)];
  const first = Math.min(...indices),
    last = Math.max(...indices);
  const size = Math.min(values.length, Math.max(requested, last - first + 1));
  const center = (first + last) / 2;
  return around(center, size, values.length);
}

/** Slice already-ranked full-resolution cells; local inspection never changes their global colour bins. */
export function buildBinDetail(
  fullMap: Heatmap,
  panelMap: Heatmap,
  selection: BinDetailSelection,
): BinDetail | undefined {
  if (
    fullMap.xKey !== panelMap.xKey ||
    fullMap.yKey !== panelMap.yKey ||
    fullMap.zKey !== panelMap.zKey
  )
    return undefined;
  if (
    !panelMap.yKey ||
    !panelMap.cells.some(
      (cell) => (cell.xValues?.length ?? 1) > 1 || (cell.yValues?.length ?? 1) > 1,
    )
  )
    return undefined;
  const selectedCell = panelMap.cells.find(
    (cell) => same(cell.x, selection.x) && same(cell.y, selection.y) && same(cell.z, selection.z),
  );
  if (!selectedCell) return undefined;
  const layer = fullMap.cells.filter((cell) => same(cell.z, selectedCell.z));
  const panelLayer = panelMap.cells.filter((cell) => same(cell.z, selectedCell.z));
  if (!layer.length) return undefined;
  const panelXs = unique(panelLayer.map((cell) => cell.x)),
    panelYs = unique(panelLayer.map((cell) => cell.y));
  const xBins = panelXs.map((value) => {
    const cell = panelLayer.find((cell) => same(cell.x, value))!;
    return cell.xValues ?? [cell.x];
  });
  const yBins = panelYs.map((value) => {
    const cell = panelLayer.find((cell) => same(cell.y, value))!;
    return cell.yValues?.length ? cell.yValues : [cell.y];
  });
  const fullXs = unique(layer.map((cell) => cell.x));
  // Detail is measured in original values. Keep the selected bin and add
  // neighbours until ten columns are visible; a large bin may exceed ten.
  const [fullXFrom, fullXTo] = selectedWindow(fullXs, selectedCell.xValues ?? [selectedCell.x], 10);
  const xValues = fullXs.slice(fullXFrom, fullXTo);
  const fullYs = unique(layer.map((cell) => cell.y));
  const selectedXs = selectedCell.xValues ?? [selectedCell.x];
  const selectedYs = selectedCell.yValues?.length ? selectedCell.yValues : [selectedCell.y];
  const selectedYIndices = selectedYs.map((value) =>
    fullYs.findIndex((candidate) => same(candidate, value)),
  );
  if (selectedYIndices.some((index) => index < 0)) return undefined;
  const firstY = Math.min(...selectedYIndices),
    lastY = Math.max(...selectedYIndices);
  // The local view always shows five real rows around the selected bin's centre.
  // The value table still lists every value that contributed to the selected bin.
  const [yFrom, yTo] = around((firstY + lastY) / 2, 5, fullYs.length);
  const yValues = fullYs.slice(yFrom, yTo);
  const panelXRange = binEdges(xBins, xValues[0], xValues.at(-1));
  const panelYRange = binEdges(yBins, yValues[0], yValues.at(-1));
  if (!panelXRange || !panelYRange) return undefined;
  const mergedCells = layer.filter(
    (cell) => includes(selectedXs, cell.x) && includes(selectedYs, cell.y),
  );
  if (!mergedCells.length) return undefined;
  const valid = mergedCells.flatMap((cell) =>
    cell.value !== null && Number.isFinite(cell.value) ? [cell.value] : [],
  );
  const mean = valid.length ? valid.reduce((sum, value) => sum + value / valid.length, 0) : null;
  const localMap: Heatmap = {
    xKey: fullMap.xKey,
    yKey: fullMap.yKey,
    cells: layer.filter((cell) => includes(xValues, cell.x) && includes(yValues, cell.y)),
    scale: fullMap.scale,
    display: fullMap.display,
  };
  return { selectedCell, localMap, mergedCells, mean, xValues, yValues, panelXRange, panelYRange };
}

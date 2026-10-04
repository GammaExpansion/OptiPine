import type { AnalysisValue, Heatmap, HeatmapCell } from './analysis.ts';
import { combinedExclusions } from './heatmap-exclusions.ts';

export interface HeatmapDisplay {
  minimum: number | null;
  maximum: number | null;
  median: number | null;
  xBinSize: number;
  yBinSize: number;
  originalXCount: number;
  originalYCount: number;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const unique = (values: (AnalysisValue | undefined)[]) => [...new Set(values)];

/** Adjacent cells are averaged, never treating missing samples as zero. Limits default to 24. */
export function prepareHeatmap(
  map: Heatmap,
  bin: boolean | { x: number; y: number } = false,
): Heatmap {
  const xs = unique(map.cells.map((cell) => cell.x)),
    ys = unique(map.cells.map((cell) => cell.y));
  const limit = (axis: 'x' | 'y') =>
    typeof bin === 'object' && Number.isFinite(bin[axis])
      ? Math.max(1, Math.min(24, Math.floor(bin[axis])))
      : 24;
  const xBinSize = bin && map.yKey ? Math.max(1, Math.ceil(xs.length / limit('x'))) : 1;
  const yBinSize = bin && map.yKey ? Math.max(1, Math.ceil(ys.length / limit('y'))) : 1;
  let cells: HeatmapCell[];
  if (xBinSize === 1 && yBinSize === 1) cells = map.cells.map((cell) => ({ ...cell }));
  else {
    const buckets = new Map<string, HeatmapCell[]>();
    const xAt = new Map(xs.map((x, i) => [x, Math.floor(i / xBinSize)]));
    const yAt = new Map(ys.map((y, i) => [y, Math.floor(i / yBinSize)]));
    for (const cell of map.cells) {
      const key = JSON.stringify([xAt.get(cell.x), yAt.get(cell.y), cell.z]);
      const bucket = buckets.get(key) ?? [];
      bucket.push(cell);
      buckets.set(key, bucket);
    }
    cells = [...buckets.values()].map((bucket) => {
      const valid = bucket.filter((cell) => cell.value !== null && Number.isFinite(cell.value));
      const weight = valid.reduce((sum, cell) => sum + (cell.averagedCells ?? 1), 0);
      return {
        ...bucket[0],
        value: weight
          ? valid.reduce((sum, cell) => sum + cell.value! * ((cell.averagedCells ?? 1) / weight), 0)
          : null,
        count: bucket.reduce((sum, cell) => sum + cell.count, 0),
        excludedCount: undefined,
        failedConstraints: undefined,
        ...combinedExclusions(bucket),
        xValues: unique(bucket.flatMap((cell) => cell.xValues ?? [cell.x])) as AnalysisValue[],
        yValues: unique(bucket.flatMap((cell) => cell.yValues ?? [cell.y])).filter(
          (value): value is AnalysisValue => value !== undefined,
        ),
        averagedCells: weight,
        // A bin opens detail; it must never select the first member as if it were the whole bin.
        trialId: undefined,
      };
    });
  }
  for (const cell of cells) delete cell.rankBin;
  const ranked = cells
    .filter((cell) => cell.value !== null && Number.isFinite(cell.value))
    .sort((a, b) => a.value! - b.value!);
  // Stable coordinate order breaks ties, keeping each bin's occupancy within one cell.
  for (const [index, cell] of ranked.entries())
    cell.rankBin =
      ranked.length === 1
        ? 4
        : ranked.length < 9
          ? Math.round((index * 8) / (ranked.length - 1))
          : Math.floor((index * 9) / ranked.length);
  const mid = Math.floor(ranked.length / 2);
  const median = !ranked.length
    ? null
    : ranked.length % 2
      ? ranked[mid].value!
      : ranked[mid - 1].value! / 2 + ranked[mid].value! / 2;
  return {
    ...map,
    cells,
    layers: map.layers?.map((layer) => ({
      ...layer,
      cells: cells.filter((cell) => same(cell.z, layer.z)),
    })),
    display: {
      minimum: ranked[0]?.value ?? null,
      maximum: ranked.at(-1)?.value ?? null,
      median,
      xBinSize: cells.reduce((size, cell) => Math.max(size, cell.xValues?.length ?? 1), 1),
      yBinSize: cells.reduce((size, cell) => Math.max(size, cell.yValues?.length ?? 1), 1),
      originalXCount: map.display?.originalXCount ?? xs.length,
      originalYCount: map.display?.originalYCount ?? ys.length,
    },
  };
}

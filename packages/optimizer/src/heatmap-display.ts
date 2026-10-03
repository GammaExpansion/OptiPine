import type { AnalysisValue, Heatmap, HeatmapCell } from './analysis.ts';

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
const mean = (values: number[]) => values.reduce((sum, value) => sum + value / values.length, 0);

/** Display-only aggregation and rank statistics run inside the analysis Worker. */
export function prepareHeatmap(map: Heatmap, bin = false): Heatmap {
  const xs = unique(map.cells.map((cell) => cell.x)),
    ys = unique(map.cells.map((cell) => cell.y));
  const xBinSize = bin && map.yKey ? Math.max(1, Math.ceil(xs.length / 24)) : 1;
  const yBinSize = bin && map.yKey ? Math.max(1, Math.ceil(ys.length / 24)) : 1;
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
      const valid = bucket.flatMap((cell) =>
        cell.value !== null && Number.isFinite(cell.value) ? [cell.value] : [],
      );
      return {
        ...bucket[0],
        value: valid.length ? mean(valid) : null,
        count: bucket.reduce((sum, cell) => sum + cell.count, 0),
        xValues: unique(bucket.map((cell) => cell.x)) as AnalysisValue[],
        yValues: unique(bucket.map((cell) => cell.y)).filter(
          (value): value is AnalysisValue => value !== undefined,
        ),
        averagedCells: valid.length,
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
      xBinSize,
      yBinSize,
      originalXCount: xs.length,
      originalYCount: ys.length,
    },
  };
}

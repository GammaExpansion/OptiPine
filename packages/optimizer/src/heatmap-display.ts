import type { AnalysisValue, Heatmap, HeatmapCell } from './analysis.ts';
import { combinedExclusions } from './heatmap-exclusions.ts';

export interface HeatmapDisplay {
  minimum: number | null;
  maximum: number | null;
  /** The values at the ramp's loss and profit ends: the worst and best in the map's direction. */
  worst: number | null;
  best: number | null;
  /** The break-even the colours split at, as the map's scale gives it; null without one. */
  breakEven: number | null;
  median: number | null;
  xBinSize: number;
  yBinSize: number;
  originalXCount: number;
  originalYCount: number;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const unique = (values: (AnalysisValue | undefined)[]) => [...new Set(values)];

/** The ramp's colour steps: three for losing cells, the neutral break-even, five for winning. */
const lossSteps = [0, 2] as const;
const neutralStep = 3;
const profitSteps = [4, 8] as const;

/**
 * Spread cells ordered worst first over the steps `from`–`to` by rank, so one extreme set cannot
 * flatten the rest. A stable sort keeps tied cells in coordinate order, so each step's occupancy
 * stays within one run of cells.
 */
function spread(cells: readonly HeatmapCell[], [from, to]: readonly [number, number]): void {
  const steps = to - from + 1;
  for (const [index, cell] of cells.entries())
    cell.rankBin =
      from +
      (cells.length === 1
        ? Math.floor((steps - 1) / 2)
        : cells.length < steps
          ? Math.round((index * (steps - 1)) / (cells.length - 1))
          : Math.floor((index * steps) / cells.length));
}

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
  const valued = cells.filter((cell) => cell.value !== null && Number.isFinite(cell.value));
  const ranked = [...valued].sort((a, b) => a.value! - b.value!);
  // Colours run from the worst cell to the best in the map's direction. With a break-even, losing
  // cells take the loss steps and winning cells the profit steps, each ranked among themselves,
  // so the legend's break-even falls where it is; without one, every cell shares the nine steps.
  const minimize = map.scale?.direction === 'minimize';
  const ordered = minimize ? [...valued].sort((a, b) => b.value! - a.value!) : ranked;
  const breakEven = map.scale?.breakEven;
  if (breakEven === undefined) spread(ordered, [lossSteps[0], profitSteps[1]]);
  else {
    const wins = (value: number) => (minimize ? value < breakEven : value > breakEven);
    spread(
      ordered.filter((cell) => cell.value !== breakEven && !wins(cell.value!)),
      lossSteps,
    );
    for (const cell of ordered) if (cell.value === breakEven) cell.rankBin = neutralStep;
    spread(
      ordered.filter((cell) => wins(cell.value!)),
      profitSteps,
    );
  }
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
      worst: ordered[0]?.value ?? null,
      best: ordered.at(-1)?.value ?? null,
      breakEven: breakEven ?? null,
      median,
      xBinSize: cells.reduce((size, cell) => Math.max(size, cell.xValues?.length ?? 1), 1),
      yBinSize: cells.reduce((size, cell) => Math.max(size, cell.yValues?.length ?? 1), 1),
      originalXCount: map.display?.originalXCount ?? xs.length,
      originalYCount: map.display?.originalYCount ?? ys.length,
    },
  };
}

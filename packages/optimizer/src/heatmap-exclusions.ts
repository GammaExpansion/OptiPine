import type { HeatmapCell } from './analysis.ts';

/** Preserve sampled/filter status through slice, bin and window aggregation. */
export function combinedExclusions(
  cells: readonly Pick<HeatmapCell, 'excludedCount' | 'failedConstraints'>[],
): Pick<HeatmapCell, 'excludedCount' | 'failedConstraints'> {
  const excludedCount = cells.reduce((sum, cell) => sum + (cell.excludedCount ?? 0), 0);
  return excludedCount
    ? {
        excludedCount,
        failedConstraints: [
          ...new Map(
            cells.flatMap((cell) =>
              (cell.failedConstraints ?? []).map((constraint) => [
                JSON.stringify(constraint),
                constraint,
              ]),
            ),
          ).values(),
        ],
      }
    : {};
}

import type { Heatmap, HeatmapCell } from '@pine/optimizer';
import { containsSelection } from './geometry.ts';

export interface MapMarker {
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly label: string;
  readonly selected?: boolean;
}

/** Co-located picks share a ring and retain every label, including inside a binned cell. */
export function markersByCell(map: Heatmap, markers: readonly MapMarker[]) {
  const groups = new Map<HeatmapCell, MapMarker[]>();
  for (const marker of markers) {
    const cell = map.cells.find((cell) => containsSelection(map, cell, marker.parameters));
    if (!cell) continue;
    const group = groups.get(cell) ?? [];
    group.push(marker);
    groups.set(cell, group);
  }
  return groups;
}

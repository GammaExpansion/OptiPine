import {
  prepareHeatmap,
  type AnalysisValue,
  type Heatmap,
  type HeatmapCell,
} from '@pine/optimizer';

export const cellSize = 16;
export const cellPitch = 18;
const left = 64;
const right = 16;
const bottom = 66;

/** Reserve both axes and captions before fitting 16px squares with 2px gaps. Z layers scroll. */
export function fitMap(map: Heatmap, width: number, height: number): Heatmap {
  if (!map.yKey) return map;
  if (width <= 0 || height <= 0) return prepareHeatmap(map, true);
  return prepareHeatmap(map, {
    x: Math.floor((width - left - right + 2) / cellPitch),
    y: Math.floor((height - (map.zKey ? 30 : 8) - bottom) / cellPitch),
  });
}

export interface MapLayerGeometry {
  readonly z?: AnalysisValue;
  readonly top: number;
  readonly xs: readonly AnalysisValue[];
  readonly ys: readonly (AnalysisValue | undefined)[];
  readonly columns: readonly (readonly AnalysisValue[])[];
  readonly rows: readonly (readonly (AnalysisValue | undefined)[])[];
  readonly cells: ReadonlyMap<number, HeatmapCell>;
}

export interface MapGeometry {
  readonly width: number;
  readonly height: number;
  readonly layers: readonly MapLayerGeometry[];
}

/** Layout for an already fitted map, or for the full-resolution bin inspection. */
export function mapGeometry(map: Heatmap): MapGeometry {
  const groups = map.layers?.length ? map.layers : [{ cells: map.cells, z: undefined }];
  let height = 0;
  let width = 0;
  const layers = groups.map((group) => {
    const columns = new Map<AnalysisValue, readonly AnalysisValue[]>();
    const rows = new Map<AnalysisValue | undefined, readonly (AnalysisValue | undefined)[]>();
    for (const cell of group.cells) {
      columns.set(cell.x, cell.xValues ?? [cell.x]);
      rows.set(cell.y, cell.yValues?.length ? cell.yValues : [cell.y]);
    }
    const xs = [...columns.keys()];
    const ys = [...rows.keys()].reverse();
    const xIndex = new Map(xs.map((value, index) => [value, index]));
    const yIndex = new Map(ys.map((value, index) => [value, index]));
    const cells = new Map<number, HeatmapCell>();
    for (const cell of group.cells)
      cells.set(yIndex.get(cell.y)! * xs.length + xIndex.get(cell.x)!, cell);
    const top = height + (map.zKey ? 30 : 8);
    width = Math.max(width, left + xs.length * cellPitch - 2 + right);
    height = top + ys.length * cellPitch + bottom;
    return {
      z: group.z,
      top,
      xs,
      ys,
      columns: xs.map((value) => columns.get(value)!),
      rows: ys.map((value) => rows.get(value)!),
      cells,
    };
  });
  return { width, height, layers };
}

export function cellRect(layer: MapLayerGeometry, index: number, _width: number) {
  return {
    x: left + (index % layer.xs.length) * cellPitch,
    y: layer.top + Math.floor(index / layer.xs.length) * cellPitch,
    width: cellSize,
    height: cellSize,
  };
}

/** Gaps never select a neighbour. Hit testing has no scan over the cells. */
export function cellAt(geometry: MapGeometry, x: number, y: number, width: number) {
  const layer = geometry.layers.find(
    (item) => y >= item.top && y < item.top + item.ys.length * cellPitch,
  );
  if (!layer) return null;
  const origin = cellRect(layer, 0, width);
  const dx = x - origin.x;
  const dy = y - layer.top;
  const column = Math.floor(dx / cellPitch);
  if (
    dx < 0 ||
    column >= layer.xs.length ||
    dx % cellPitch >= cellSize ||
    dy % cellPitch >= cellSize
  )
    return null;
  return layer.cells.get(Math.floor(dy / cellPitch) * layer.xs.length + column) ?? null;
}

export function containsSelection(
  map: Heatmap,
  cell: HeatmapCell,
  parameters: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (!parameters) return false;
  return (
    (cell.xValues ?? [cell.x]).includes(parameters[map.xKey] as AnalysisValue) &&
    (!map.yKey ||
      (cell.yValues?.length ? cell.yValues : [cell.y]).includes(
        parameters[map.yKey] as AnalysisValue,
      )) &&
    (!map.zKey || parameters[map.zKey] === cell.z)
  );
}

/** The mock has eight heat tokens; its neutral divider supplies the ninth rank step. */
export const heatTokens = [
  '--heat-1',
  '--heat-2',
  '--heat-3',
  '--divider',
  '--heat-4',
  '--heat-5',
  '--heat-6',
  '--heat-7',
  '--heat-8',
] as const;

export function colorStep(cell: HeatmapCell): number | null {
  return cell.value !== null && Number.isFinite(cell.value) && cell.rankBin !== undefined
    ? Math.max(0, Math.min(8, cell.rankBin))
    : null;
}

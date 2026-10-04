import {
  prepareHeatmap,
  type AnalysisValue,
  type Heatmap,
  type HeatmapCell,
} from '@pine/optimizer';

/** A dense map's 16 px cells at an 18 px pitch, as R1 draws them; binning keeps to this pitch. */
export const cellSize = 16;
export const cellPitch = 18;
/** The largest pitch a sparse map grows to while filling its panel. */
export const maxCellPitch = 40;
const gap = cellPitch - cellSize;
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
  /** The distance from one cell to the next, its size plus the 2 px gap. */
  readonly pitch: number;
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

/**
 * The pitch a single-layer map draws at in a panel: as large as fills the panel's width or height,
 * whichever is tighter, from the dense map's 18 px up to `maxCellPitch`, so a few cells (a 4 × 3
 * grid) fill their panel instead of sitting small in its corner. Layered maps scroll and keep 18 px.
 */
function fittedPitch(
  columns: number,
  rows: number,
  panel: { readonly width: number; readonly height: number },
  top: number,
): number {
  const across = Math.floor((panel.width - left - right + gap) / Math.max(1, columns));
  const down = Math.floor((panel.height - top - bottom + gap) / Math.max(1, rows));
  return Math.max(cellPitch, Math.min(maxCellPitch, across, down));
}

/**
 * Layout for an already fitted map, or for the full-resolution bin inspection. With the `panel`
 * it is drawn in, a single-layer map scales its cells to the panel (`fittedPitch`).
 */
export function mapGeometry(
  map: Heatmap,
  panel?: { readonly width: number; readonly height: number },
): MapGeometry {
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
    const pitch =
      panel && groups.length === 1 && map.yKey
        ? fittedPitch(xs.length, ys.length, panel, top)
        : cellPitch;
    width = Math.max(width, left + xs.length * pitch - gap + right);
    height = top + ys.length * pitch + bottom;
    return {
      z: group.z,
      top,
      pitch,
      xs,
      ys,
      columns: xs.map((value) => columns.get(value)!),
      rows: ys.map((value) => rows.get(value)!),
      cells,
    };
  });
  return { width, height, layers };
}

/** A cell's square; the grid is centred in a canvas `width` wide, as R1 centres its map. */
export function cellRect(layer: MapLayerGeometry, index: number, width: number) {
  const grid = layer.xs.length * layer.pitch - gap;
  return {
    x:
      left +
      Math.max(0, Math.floor((width - left - right - grid) / 2)) +
      (index % layer.xs.length) * layer.pitch,
    y: layer.top + Math.floor(index / layer.xs.length) * layer.pitch,
    width: layer.pitch - gap,
    height: layer.pitch - gap,
  };
}

/** Gaps never select a neighbour. Hit testing has no scan over the cells. */
export function cellAt(geometry: MapGeometry, x: number, y: number, width: number) {
  const layer = geometry.layers.find(
    (item) => y >= item.top && y < item.top + item.ys.length * item.pitch,
  );
  if (!layer) return null;
  const origin = cellRect(layer, 0, width);
  const dx = x - origin.x;
  const dy = y - layer.top;
  const column = Math.floor(dx / layer.pitch);
  if (
    dx < 0 ||
    column >= layer.xs.length ||
    dx % layer.pitch >= origin.width ||
    dy % layer.pitch >= origin.height
  )
    return null;
  return layer.cells.get(Math.floor(dy / layer.pitch) * layer.xs.length + column) ?? null;
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

/**
 * Where the vertical Y axis title goes: centred on the rows where it fits, otherwise as far along
 * as the layer's band allows (`top` to `bottom`), so a title longer than the rows extends past them
 * instead of being cut at the canvas edge (bug bash #33). `span` is the length it is drawn at:
 * its own, unless even the band is shorter.
 */
export function verticalTitle(
  length: number,
  rows: { readonly top: number; readonly height: number },
  band: { readonly top: number; readonly bottom: number },
): { centre: number; span: number } {
  const span = Math.min(length, band.bottom - band.top);
  const centre = Math.min(
    Math.max(rows.top + rows.height / 2, band.top + span / 2),
    band.bottom - span / 2,
  );
  return { centre, span };
}

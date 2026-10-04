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
/**
 * The smallest pitch a single-layer map shrinks to before it averages values, so a 14-value axis
 * keeps its rows in a panel too short for 18 px ones.
 */
export const minCellPitch = 12;
const gap = cellPitch - cellSize;
/** The room left of the grid for the Y labels and title, unless the labels need more. */
export const axisLeft = 64;
const right = 16;
/** Below the grid: the X labels and, under them, the X title. */
export const axisBottom = 44;

const layerTop = (map: Heatmap) => (map.zKey ? 30 : 8);

/** The Y labels end this far left of the grid, and the rotated title sits this far beyond them. */
export const yLabelGap = 8;
export const yTitleGap = 6;
/** Wider labels, such as long option names, are squeezed to this width. */
export const maxYLabelWidth = 120;

/**
 * The room left of the grid for Y labels `labelWidth` wide: the gap, the labels, the gap and the
 * rotated title's line, never less than `axisLeft`, so the title never covers a label.
 */
export function yAxisLeft(labelWidth: number): number {
  const labels = Math.ceil(Math.min(maxYLabelWidth, Math.max(0, labelWidth)));
  return Math.max(axisLeft, yLabelGap + labels + yTitleGap + 18);
}

/**
 * Average an axis's values only when its cells would fall below `minCellPitch` in the panel, or
 * above 24 values; `left` is the room the Y labels take. Layered maps keep 18 px cells and scroll.
 */
export function fitMap(map: Heatmap, width: number, height: number, left = axisLeft): Heatmap {
  if (!map.yKey) return map;
  if (width <= 0 || height <= 0) return prepareHeatmap(map, true);
  const pitch = map.zKey ? cellPitch : minCellPitch;
  return prepareHeatmap(map, {
    x: Math.floor((width - left - right + gap) / pitch),
    y: Math.floor((height - layerTop(map) - axisBottom + gap) / pitch),
  });
}

export interface MapLayerGeometry {
  readonly z?: AnalysisValue;
  readonly top: number;
  /** Where the grid's room starts, after the Y labels and title. */
  readonly left: number;
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
 * whichever is tighter, from `minCellPitch` up to `maxCellPitch`, so a few cells (a 4 × 3 grid)
 * fill their panel instead of sitting small in its corner, and many keep their rows. Layered maps
 * scroll and keep 18 px.
 */
function fittedPitch(
  columns: number,
  rows: number,
  panel: { readonly width: number; readonly height: number },
  top: number,
  left: number,
): number {
  const across = Math.floor((panel.width - left - right + gap) / Math.max(1, columns));
  const down = Math.floor((panel.height - top - axisBottom + gap) / Math.max(1, rows));
  return Math.max(minCellPitch, Math.min(maxCellPitch, across, down));
}

/**
 * Layout for an already fitted map, or for the full-resolution bin inspection. With the `panel`
 * it is drawn in, a single-layer map scales its cells to the panel (`fittedPitch`).
 */
export function mapGeometry(
  map: Heatmap,
  panel?: { readonly width: number; readonly height: number },
  left = axisLeft,
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
    const top = height + layerTop(map);
    const pitch =
      panel && groups.length === 1 && map.yKey
        ? fittedPitch(xs.length, ys.length, panel, top, left)
        : cellPitch;
    width = Math.max(width, left + xs.length * pitch - gap + right);
    height = top + ys.length * pitch + axisBottom;
    return {
      z: group.z,
      top,
      left,
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
  const { left } = layer;
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

/** The neutral step between the three loss steps and the five profit steps. */
export const neutralStep = 3;

/** What a map's legend shows (R4): the ramp's ends, its steps and the break-even between them. */
export interface LegendScale {
  /** The worst and best values in the objective's direction, at the loss and profit ends. */
  readonly worst: number | null;
  readonly best: number | null;
  /** The steps the cells can take, as indices into `heatTokens` in ramp order. */
  readonly steps: readonly number[];
  /** The break-even, labelled on the neutral step; null when the ramp does not reach it. */
  readonly breakEven: number | null;
}

/**
 * A map's legend: every step for an objective without a break-even; otherwise only the sides the
 * cells fall on, so the break-even is labelled where losing and winning cells meet and nowhere
 * when they are all on one side.
 */
export function legendScale(map: Heatmap): LegendScale {
  const worst = map.display?.worst ?? null;
  const best = map.display?.best ?? null;
  const breakEven = map.display?.breakEven ?? null;
  const used = new Set(map.cells.map(colorStep).filter((step) => step !== null));
  const all = heatTokens.map((_, index) => index);
  if (breakEven === null || !used.size) return { worst, best, steps: all, breakEven: null };
  const loss = all.filter((step) => step < neutralStep);
  const profit = all.filter((step) => step > neutralStep);
  const losing = loss.some((step) => used.has(step));
  const winning = profit.some((step) => used.has(step));
  const even = used.has(neutralStep) || (losing && winning);
  return {
    worst,
    best,
    steps: [...(losing ? loss : []), ...(even ? [neutralStep] : []), ...(winning ? profit : [])],
    breakEven: even ? breakEven : null,
  };
}

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

import type { Diagnostic, LiteralValue } from '@pine/engine';
import {
  buildBinDetail,
  type AnalysisAxis,
  type AnalysisValue,
  type BinDetail,
  type Heatmap,
  type HeatmapCell,
  type OptimizerSummary,
  type OptimizerSummaryRequest,
  type ParameterSensitivity,
  type Slice,
} from '@pine/optimizer';
import type { OptimizationTrial } from '@pine/workers';
import { diagnosticBar } from './backtest.ts';
import { csvNumber, csvText } from './csv.ts';
import type { ParameterOrigin } from './inputs.ts';
import {
  passesFilter,
  reportMetrics,
  type Direction,
  type FilterCondition,
  type ObjectiveId,
} from './optimize-ranking.ts';

/** Rows per leaderboard page (R1, WEB.md 3.4). */
export const leaderboardPageSize = 13;
/** Sets the Top 20 equity view reruns (R1). */
export const topEquityCount = 20;

/** The metrics a leaderboard row shows for each range. */
const figureMetrics = [
  reportMetrics.netProfit,
  reportMetrics.profitFactor,
  reportMetrics.maxDrawdown,
  reportMetrics.trades,
] as const;

/**
 * What the views ask of the analysis Worker: per-set columns of the leaderboard's figures and of
 * the filters' metrics, and the maps at full resolution when hover and bin detail need them.
 */
export function summaryRequest(
  filters: readonly FilterCondition[],
  fullMaps: boolean,
): OptimizerSummaryRequest {
  return {
    metrics: [
      ...new Set([...figureMetrics, ...filters.map((filter) => reportMetrics[filter.metric])]),
    ],
    fullMaps,
  };
}

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
const mean = (values: readonly number[]): number | null =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
const orNull = (value: number | undefined): number | null =>
  value === undefined || Number.isNaN(value) ? null : value;

export type ValidationResultMode = 'none' | 'in-out';

/** One analysis summary with the run's trials, which its positions index. */
export interface RankedResults {
  readonly summary: OptimizerSummary;
  /** The run's trials of the full or IS range, in the order the Worker received them. */
  readonly trials: readonly OptimizationTrial[];
  readonly mode: ValidationResultMode;
  readonly objective: ObjectiveId;
  readonly direction: Direction;
  /** The searched inputs with their values, in declaration order. */
  readonly axes: readonly AnalysisAxis[];
  /** 1-based rank by position; 0 for a set the filters exclude or that failed. */
  readonly rankOf: Int32Array;
}

export function rankResults(
  summary: OptimizerSummary,
  trials: readonly OptimizationTrial[],
  mode: ValidationResultMode,
  objective: ObjectiveId,
  direction: Direction,
  axes: readonly AnalysisAxis[],
): RankedResults {
  const rankOf = new Int32Array(summary.total);
  summary.ranked.forEach((position, index) => (rankOf[position] = index + 1));
  return { summary, trials, mode, objective, direction, axes, rankOf };
}

/** The figures a leaderboard row shows for one range. */
export interface TrialFigures {
  readonly netProfit: number | null;
  readonly profitFactor: number | null;
  /** The largest drawdown as a positive percentage, as the engine reports it. */
  readonly maxDrawdownPercent: number | null;
  readonly trades: number | null;
}

function figures(
  results: RankedResults,
  position: number,
  range: 'inSample' | 'outOfSample',
): TrialFigures {
  const read = (metric: string) =>
    orNull(results.summary.columns.metrics[metric]?.[range][position]);
  return {
    netProfit: read(reportMetrics.netProfit),
    profitFactor: read(reportMetrics.profitFactor),
    maxDrawdownPercent: read(reportMetrics.maxDrawdown),
    trades: read(reportMetrics.trades),
  };
}

const parametersAt = (results: RankedResults, position: number) =>
  (results.trials[position]?.parameters.inputs ?? {}) as Record<string, LiteralValue>;

export interface LeaderboardRow {
  readonly rank: number;
  readonly trialId: string;
  /** Every input the run set, keyed by title: the set to preview or apply. */
  readonly parameters: Readonly<Record<string, LiteralValue>>;
  /** The value the ranking sorts by: the objective's IS value, or the neighbourhood mean. */
  readonly score: number | null;
  /** The objective's value on each range. */
  readonly objective: { readonly inSample: number | null; readonly outOfSample: number | null };
  /** The full range for validation None. */
  readonly inSample: TrialFigures;
  /** Null for validation None. */
  readonly outOfSample: TrialFigures | null;
  /** The mean of the objective over the set and its ±1 step neighbours. */
  readonly neighbourhoodMean: number | null;
}

function leaderboardRow(results: RankedResults, rank: number): LeaderboardRow {
  const position = results.summary.ranked[rank - 1];
  const { columns } = results.summary;
  const neighbourhoodMean = orNull(columns.neighborhood[position]);
  const inSample = orNull(columns.inSampleValue[position]);
  return {
    rank,
    trialId: results.trials[position].trialId,
    parameters: parametersAt(results, position),
    score: results.objective === 'neighbourhoodMean' ? neighbourhoodMean : inSample,
    objective: { inSample, outOfSample: orNull(columns.outOfSampleValue[position]) },
    inSample: figures(results, position, 'inSample'),
    outOfSample: results.mode === 'none' ? null : figures(results, position, 'outOfSample'),
    neighbourhoodMean,
  };
}

export interface LeaderboardView {
  /** 0-based, within `pageCount`. */
  readonly page: number;
  readonly pageCount: number;
  /** Sets that pass the filters and are ranked. */
  readonly passing: number;
  /** Sets in the results, failed ones included. */
  readonly total: number;
  /** Searched inputs, the map's axes first, then the rest in declaration order (R4). */
  readonly columns: readonly string[];
  readonly rows: readonly LeaderboardRow[];
}

export function pageCount(passing: number): number {
  return Math.max(1, Math.ceil(passing / leaderboardPageSize));
}

/** The page shown: `page` kept within the pages there are. */
function pageOf(results: RankedResults, page: number): number {
  return Math.min(Math.max(0, Math.floor(page)), pageCount(results.summary.ranked.length) - 1);
}

export function leaderboardView(results: RankedResults, page: number): LeaderboardView {
  const passing = results.summary.ranked.length;
  const at = pageOf(results, page);
  const { x, y, z } = results.summary.axes;
  const searched = results.axes.map((axis) => axis.title);
  const first = [x, y, z].filter((title): title is string => !!title && searched.includes(title));
  const start = at * leaderboardPageSize;
  const rows: LeaderboardRow[] = [];
  for (let rank = start + 1; rank <= Math.min(passing, start + leaderboardPageSize); rank++)
    rows.push(leaderboardRow(results, rank));
  return {
    page: at,
    pageCount: pageCount(passing),
    passing,
    total: results.summary.total,
    columns: [...first, ...searched.filter((title) => !first.includes(title))],
    rows,
  };
}

/** The leading sets, best first, as Top 20 equity reruns them (R1). */
export function leadingSets(
  results: RankedResults,
  count: number,
): { trialId: string; parameters: Readonly<Record<string, LiteralValue>> }[] {
  return [...results.summary.ranked.subarray(0, count)].map((position) => ({
    trialId: results.trials[position].trialId,
    parameters: parametersAt(results, position),
  }));
}

/** The selection bar's set (3.3): the selected row, or #1 while none is selected. */
export interface Selection {
  readonly row: LeaderboardRow;
  /** The user picked it; otherwise it is #1. */
  readonly explicit: boolean;
  readonly origin: ParameterOrigin;
}

export function selectionOf(
  results: RankedResults,
  trialId: string | null,
  optimizationId: number,
): Selection | null {
  const position =
    trialId === null ? -1 : results.trials.findIndex((trial) => trial.trialId === trialId);
  const picked = position >= 0 && position < results.summary.total ? results.rankOf[position] : 0;
  const rank = picked || (results.summary.ranked.length ? 1 : 0);
  if (!rank) return null;
  const row = leaderboardRow(results, rank);
  return {
    row,
    explicit: row.trialId === trialId,
    origin: { kind: 'rank', optimizationId, trialId: row.trialId, rank },
  };
}

/** IS vs OOS (R2): one point per completed set with both net profits. */
export interface ScatterView {
  /** Columns of equal length: one point each. */
  readonly inSample: Float64Array;
  readonly outOfSample: Float64Array;
  /** 1-based rank, 0 for a set the filters exclude. */
  readonly rank: Int32Array;
  /** The current leaderboard page's ranks, first and last, highlighted on the chart. */
  readonly pageRanks: readonly [number, number] | null;
}

export function scatterView(results: RankedResults, page: number): ScatterView | null {
  if (results.mode === 'none') return null;
  const { total, columns } = results.summary;
  const net = columns.metrics[reportMetrics.netProfit];
  const inSample = new Float64Array(total);
  const outOfSample = new Float64Array(total);
  const rank = new Int32Array(total);
  let points = 0;
  for (let position = 0; position < total; position++) {
    const inside = net.inSample[position];
    const outside = net.outOfSample[position];
    if (!columns.valid[position] || Number.isNaN(inside) || Number.isNaN(outside)) continue;
    inSample[points] = inside;
    outOfSample[points] = outside;
    rank[points++] = results.rankOf[position];
  }
  const passing = results.summary.ranked.length;
  const start = pageOf(results, page) * leaderboardPageSize + 1;
  return {
    inSample: inSample.subarray(0, points),
    outOfSample: outOfSample.subarray(0, points),
    rank: rank.subarray(0, points),
    pageRanks: passing ? [start, Math.min(passing, start + leaderboardPageSize - 1)] : null,
  };
}

export interface Histogram {
  /** Sets per bin, aligned with the distribution's bins. */
  readonly counts: readonly number[];
  readonly sets: number;
  readonly profitable: number;
  readonly median: number | null;
}

/** Net profit distribution (R2b): IS and OOS on shared bins of a round width. */
export interface DistributionView {
  /** The first bin's lower edge; bin `i` covers `[start + i·width, start + (i + 1)·width)`. */
  readonly start: number;
  readonly width: number;
  readonly bins: number;
  /** The full range for validation None. */
  readonly inSample: Histogram;
  readonly outOfSample: Histogram | null;
  /** #1's IS net profit, marked on the chart. */
  readonly best: number | null;
}

/** At most this many bins: enough shape, wide enough bars. */
const maxBins = 40;

/** The smallest of 1, 2, 2.5 and 5 times a power of ten that fits the span in `maxBins` bins. */
export function binWidth(span: number): number {
  const raw = span / maxBins;
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((step) => step * power >= raw) ?? 10) * power;
}

function median(sorted: ArrayLike<number>): number | null {
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The completed sets' values of one column; NaN marks a set without one. */
function completed(results: RankedResults, column: Float64Array): Float64Array {
  const { total, columns } = results.summary;
  const values = new Float64Array(total);
  let count = 0;
  for (let position = 0; position < total; position++)
    if (columns.valid[position] && !Number.isNaN(column[position]))
      values[count++] = column[position];
  return values.subarray(0, count);
}

/** Typed arrays sort numerically without a comparator, several times faster on large runs. */
export function distributionView(results: RankedResults): DistributionView {
  const net = results.summary.columns.metrics[reportMetrics.netProfit];
  const inValues = completed(results, net.inSample).sort();
  const outValues =
    results.mode === 'none' ? new Float64Array() : completed(results, net.outOfSample).sort();
  // The sorted ends rather than Math.min(...values): a large sample exceeds the argument limit.
  const ends = [inValues, outValues].filter((values) => values.length);
  const low = ends.length ? Math.min(...ends.map((values) => values[0])) : 0;
  const high = ends.length ? Math.max(...ends.map((values) => values.at(-1)!)) : 0;
  const width = binWidth(high - low);
  const start = Math.floor(low / width) * width;
  const bins = Math.floor((high - start) / width + 1e-9) + 1;
  const histogram = (values: Float64Array): Histogram => {
    const counts = new Array<number>(bins).fill(0);
    let profitable = 0;
    for (const value of values) {
      counts[Math.min(bins - 1, Math.max(0, Math.floor((value - start) / width + 1e-9)))]++;
      if (value > 0) profitable++;
    }
    return { counts, sets: values.length, profitable, median: median(values) };
  };
  const best = results.summary.ranked[0];
  return {
    start,
    width,
    bins,
    inSample: histogram(inValues),
    outOfSample: results.mode === 'none' ? null : histogram(outValues),
    best: best === undefined ? null : orNull(net.inSample[best]),
  };
}

/** R9: how one filter does on its own. */
export interface FilterDiagnosis {
  readonly filter: FilterCondition;
  /** Completed sets that pass this filter alone. */
  readonly passing: number;
  /** When none passes: the best value any set reached, the highest for ≥, the lowest for ≤. */
  readonly best: number | null;
}

/** For "No combination passes" (R9); empty when a set passes or there is no filter. */
export function filterDiagnosis(
  results: RankedResults,
  filters: readonly FilterCondition[],
): FilterDiagnosis[] {
  const { valid, metrics } = results.summary.columns;
  if (results.summary.ranked.length || !filters.length) return [];
  return filters.map((filter) => {
    const values = metrics[reportMetrics[filter.metric]]?.inSample;
    let passing = 0;
    let best: number | null = null;
    for (let position = 0; position < results.summary.total; position++) {
      if (!valid[position]) continue;
      const value = orNull(values?.[position]);
      if (passesFilter(filter, value)) passing++;
      if (value !== null && (best === null || (filter.operator === '>=') === value > best))
        best = value;
    }
    return { filter, passing, best: passing ? null : best };
  });
}

/** R10: what a draft condition would do to the ranking. */
export interface DraftPreview {
  readonly filter: FilterCondition;
  /** Ranked sets it would exclude besides those already excluded. */
  readonly excluded: number;
  /** Ranks on the current page that would drop out. */
  readonly pageRanks: readonly number[];
}

/** From the summary of an analysis computed with `draft` as its `constraintDraft`. */
export function draftPreview(
  results: RankedResults,
  draft: FilterCondition,
  page: number,
): DraftPreview {
  const start = pageOf(results, page) * leaderboardPageSize;
  return {
    filter: draft,
    excluded: results.summary.removedConstraintRanks.length,
    pageRanks: [...results.summary.removedConstraintRanks]
      .filter((index) => index >= start && index < start + leaderboardPageSize)
      .map((index) => index + 1),
  };
}

export type MapSurface = 'in' | 'out';

/** An input that is neither X, Y nor Z: the map fixes it, or takes its maximum or mean. */
export interface SliceChip {
  readonly title: string;
  readonly mode: Slice['mode'];
  /** A fixed slice's value: the chosen one, else the selected or best set's. */
  readonly value: AnalysisValue | null;
  readonly values: readonly AnalysisValue[];
}

/** The parameter map (R1, R4): binned above 24 values per axis. */
export interface MapView {
  /** `all` for validation None. */
  readonly surface: 'all' | MapSurface;
  readonly x: string;
  readonly y: string | null;
  readonly z: string | null;
  /** Full resolution, which cell hover and bin detail read; null while the run streams. */
  readonly map: Heatmap | null;
  /** What the map draws: adjacent values averaged into one cell above 24 per axis. */
  readonly panel: Heatmap;
  readonly binned: boolean;
  readonly slices: readonly SliceChip[];
}

function surfaceMap(
  summary: OptimizerSummary,
  surface: 'all' | MapSurface,
): OptimizerSummary['maps'][number] | undefined {
  return summary.maps.find((item) => item.surface === surface);
}

/** The map for two or more searched inputs; the IS / OOS switch needs no new analysis. */
export function mapView(
  results: RankedResults,
  surface: MapSurface,
  slices: Readonly<Record<string, Slice>>,
): MapView | null {
  const { summary } = results;
  const { x, y, z } = summary.axes;
  if (results.axes.length < 2 || !x) return null;
  const shown = results.mode === 'none' ? 'all' : surface;
  const maps = surfaceMap(summary, shown);
  if (!maps) return null;
  const display = maps.panelMap.display;
  const selected = summary.selection >= 0 ? parametersAt(results, summary.selection) : {};
  return {
    surface: shown,
    x,
    y: y ?? null,
    z: z ?? null,
    map: maps.map ?? null,
    panel: maps.panelMap,
    binned: !!display && (display.xBinSize > 1 || display.yBinSize > 1),
    slices: results.axes
      .filter((axis) => ![x, y, z].includes(axis.title))
      .map((axis) => {
        const slice = slices[axis.title];
        const chosen = slice && Object.hasOwn(slice, 'value') ? slice.value : undefined;
        const value = chosen ?? selected[axis.title] ?? axis.values[0] ?? null;
        return {
          title: axis.title,
          mode: slice?.mode ?? 'fixed',
          value: value as AnalysisValue | null,
          values: axis.values as AnalysisValue[],
        };
      }),
  };
}

export interface CellValue {
  readonly x: AnalysisValue;
  readonly y?: AnalysisValue;
  readonly inSample: number | null;
  readonly outOfSample: number | null;
}

/** R6: the values a map cell covers, with their IS and OOS results and the means. */
export interface CellValues {
  readonly values: readonly CellValue[];
  readonly mean: { readonly inSample: number | null; readonly outOfSample: number | null };
}

/**
 * The values under a map cell. A binned cell's values come from the full-resolution maps, which
 * summaries of complete results carry; without them each value reads as null.
 */
export function cellValues(summary: OptimizerSummary, cell: HeatmapCell): CellValues {
  const full = (surface: 'all' | MapSurface) => {
    const maps = surfaceMap(summary, surface);
    return maps?.map ?? maps?.panelMap;
  };
  const inSample = full('in') ?? full('all');
  const outOfSample = full('out');
  const valueAt = (map: Heatmap | undefined, x: AnalysisValue, y: AnalysisValue | undefined) =>
    map?.cells.find(
      (item) => !item.xValues && same(item.x, x) && same(item.y, y) && same(item.z, cell.z),
    )?.value ?? null;
  const values: CellValue[] = [];
  for (const y of cell.yValues?.length ? cell.yValues : [cell.y])
    for (const x of cell.xValues ?? [cell.x])
      values.push({
        x,
        ...(y === undefined ? {} : { y }),
        inSample: valueAt(inSample, x, y),
        outOfSample: valueAt(outOfSample, x, y),
      });
  const average = (pick: (value: CellValue) => number | null) =>
    mean(values.map(pick).filter((value): value is number => value !== null));
  return {
    values,
    mean: {
      inSample: average((value) => value.inSample),
      outOfSample: average((value) => value.outOfSample),
    },
  };
}

/** R7: a binned cell at full resolution, from @pine/optimizer's `buildBinDetail`. */
export function binDetail(view: MapView, cell: HeatmapCell): BinDetail | undefined {
  if (!view.map) return undefined;
  return buildBinDetail(view.map, view.panel, {
    x: cell.x,
    ...(cell.y === undefined ? {} : { y: cell.y }),
    ...(cell.z === undefined ? {} : { z: cell.z }),
  });
}

export interface CurvePoint {
  readonly x: AnalysisValue;
  /** The full range for validation None. */
  readonly inSample: number | null;
  readonly outOfSample: number | null;
  readonly neighbourhoodMean: number | null;
  readonly trialId: string | null;
}

/** R8: the objective against the only searched input. */
export interface CurveView {
  readonly input: string;
  readonly points: readonly CurvePoint[];
  readonly peak: AnalysisValue | null;
  /** The values around the peak whose IS objective stays within 90% of it. */
  readonly nearPeak: { readonly from: AnalysisValue; readonly to: AnalysisValue } | null;
}

/** Share of the peak's magnitude a value may fall short by and stay near the peak (R8). */
const peakTolerance = 0.1;

/** A one-input map is never binned, so its drawn map is the full one. */
export function curveView(results: RankedResults): CurveView | null {
  const { summary } = results;
  if (results.axes.length !== 1) return null;
  const inSample = (surfaceMap(summary, 'in') ?? surfaceMap(summary, 'all'))?.panelMap;
  if (!inSample) return null;
  const outOfSample = surfaceMap(summary, 'out')?.panelMap;
  const positions = new Map(
    results.trials.slice(0, summary.total).map((trial, position) => [trial.trialId, position]),
  );
  const points = inSample.cells.map((cell) => {
    const trialId = cell.trialId ?? null;
    const position = trialId === null ? undefined : positions.get(trialId);
    return {
      x: cell.x,
      inSample: cell.value,
      outOfSample: outOfSample?.cells.find((item) => same(item.x, cell.x))?.value ?? null,
      neighbourhoodMean:
        position === undefined ? null : orNull(summary.columns.neighborhood[position]),
      trialId,
    };
  });
  const better = (a: number, b: number) => (results.direction === 'maximize' ? a > b : a < b);
  let peak = -1;
  points.forEach((point, index) => {
    if (point.inSample !== null && (peak < 0 || better(point.inSample, points[peak].inSample!)))
      peak = index;
  });
  if (peak < 0) return { input: results.axes[0].title, points, peak: null, nearPeak: null };
  const top = points[peak].inSample!;
  const near = (index: number) => {
    const value = points[index]?.inSample;
    if (value === null || value === undefined) return false;
    const shortfall = results.direction === 'maximize' ? top - value : value - top;
    return shortfall <= peakTolerance * Math.abs(top);
  };
  let from = peak;
  let to = peak;
  while (near(from - 1)) from--;
  while (near(to + 1)) to++;
  return {
    input: results.axes[0].title,
    points,
    peak: points[peak].x,
    nearPeak: { from: points[from].x, to: points[to].x },
  };
}

export interface SensitivityRow extends ParameterSensitivity {
  /** The map axis this input is, marked on its row (R12). */
  readonly role: 'x' | 'y' | 'z' | null;
}

/** One-way η² per searched input, largest first, on one shared scale (from the analysis). */
export interface SensitivityView {
  readonly rows: readonly SensitivityRow[];
  readonly sharedScale: readonly [number, number] | null;
}

export function sensitivityView(results: RankedResults): SensitivityView {
  const { sensitivity, axes } = results.summary;
  return {
    rows: sensitivity.parameters.map((row) => ({
      ...row,
      role:
        row.parameter === axes.x
          ? 'x'
          : row.parameter === axes.y
            ? 'y'
            : row.parameter === axes.z
              ? 'z'
              : null,
    })),
    sharedScale: sensitivity.sharedScale,
  };
}

/** Per bar, the median of the curves that have a value there (R1). */
export function medianCurve(curves: readonly (readonly number[])[]): number[] {
  const length = Math.max(0, ...curves.map((curve) => curve.length));
  const result = new Array<number>(length);
  const column: number[] = [];
  for (let bar = 0; bar < length; bar++) {
    column.length = 0;
    for (const curve of curves) if (bar < curve.length) column.push(curve[bar]);
    column.sort((a, b) => a - b);
    result[bar] = median(column)!;
  }
  return result;
}

export type FailedRange = 'all' | 'in' | 'out';

/** R11: a combination whose run raised an error; it is not ranked. */
export interface FailedCombination {
  readonly trialId: string;
  readonly parameters: Readonly<Record<string, LiteralValue>>;
  /** The range that failed: the full range, or IS or OOS. */
  readonly range: FailedRange;
  readonly kind: Diagnostic['kind'];
  readonly line: number;
  /** The bar it failed on, once the engine reports one. */
  readonly bar: number | null;
  /** The engine's message, untranslated like the script. */
  readonly message: string;
}

/** The first diagnostic of a failed trial, or null for a trial that completed. */
export function failedCombination(
  trial: OptimizationTrial,
  range: FailedRange,
): FailedCombination | null {
  const diagnostic = trial.diagnostics[0];
  if (!diagnostic) return null;
  return {
    trialId: trial.trialId,
    parameters: (trial.parameters.inputs ?? {}) as Record<string, LiteralValue>,
    range,
    kind: diagnostic.kind,
    line: diagnostic.line,
    bar: diagnosticBar(diagnostic),
    message: diagnostic.message,
  };
}

/** The error columns of R11's export, after one column per input. */
export const failureCsvColumns = ['kind', 'line', 'bar', 'message'] as const;
export type FailureCsvColumn = (typeof failureCsvColumns)[number];

/**
 * CSV text of the failed combinations: one column per input in `inputs` order, headed by the
 * script's own titles, then the error columns with the caller's translated headers and kinds.
 */
export function failuresCsv(
  failures: readonly FailedCombination[],
  inputs: readonly string[],
  header: Readonly<Record<FailureCsvColumn, string>>,
  kinds: Readonly<Record<Diagnostic['kind'], string>>,
): string {
  const cell = (value: LiteralValue | undefined) =>
    typeof value === 'number' ? csvNumber(value) : value === undefined ? '' : String(value);
  return csvText([
    [...inputs, ...failureCsvColumns.map((column) => header[column])],
    ...failures.map((failure) => [
      ...inputs.map((title) =>
        cell(Object.hasOwn(failure.parameters, title) ? failure.parameters[title] : undefined),
      ),
      kinds[failure.kind],
      String(failure.line),
      failure.bar === null ? '' : String(failure.bar),
      failure.message,
    ]),
  ]);
}

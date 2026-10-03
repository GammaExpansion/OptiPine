import type { Diagnostic, LiteralValue, RunResult } from '@pine/engine';
import {
  buildBinDetail,
  leaderboard,
  metricRows,
  scoreMetric,
  type AnalysisAxis,
  type AnalysisValue,
  type BinDetail,
  type Heatmap,
  type HeatmapCell,
  type OptimizerAnalysis,
  type ParameterSensitivity,
  type Slice,
  type TrialRecord,
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
  type FilterMetricId,
  type ObjectiveId,
} from './optimize-ranking.ts';

/** Rows per leaderboard page (R1, WEB.md 3.4). */
export const leaderboardPageSize = 13;
/** Sets the Top 20 equity view reruns (R1). */
export const topEquityCount = 20;

type Metrics = RunResult['metrics'];
type MetricRead = (metrics: Metrics | undefined) => number | null;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
const mean = (values: readonly number[]): number | null =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;

/**
 * Read one report metric from every trial of a run with the value @pine/optimizer's `scoreMetric`
 * gives, resolving the report keys once from `sample`. Every trial of a run has the same keys,
 * and parsing each trial's report would cost the main thread a frame for a large run.
 */
export function metricReader(metric: string, sample: Metrics | undefined): MetricRead {
  if (!sample) return (metrics) => (metrics ? scoreMetric(metrics, metric) : null);
  if (Object.hasOwn(sample, metric))
    return (metrics) => {
      const value = metrics?.[metric];
      return finite(value) ? value : null;
    };
  const cell = metricRows(sample).find((row) => row.name === metric)?.all;
  const valueKey = cell?.valueKey;
  const percentKey = cell?.percentKey;
  return (metrics) => {
    if (!metrics) return null;
    const value = valueKey === undefined ? undefined : metrics[valueKey];
    if (finite(value)) return value;
    const percent = percentKey === undefined ? undefined : metrics[percentKey];
    return finite(percent) ? percent : null;
  };
}

const inSampleMetrics = (trial: TrialRecord): Metrics | undefined =>
  trial.inSampleMetrics ?? trial.inSample?.metrics ?? trial.result?.metrics;
const outOfSampleMetrics = (trial: TrialRecord): Metrics | undefined =>
  trial.outOfSampleMetrics ?? trial.outOfSample?.metrics;

/** A filter metric of a set as @pine/optimizer's `constraintValue` reads it. */
export function filterReader(
  metric: FilterMetricId,
  sample: Metrics | undefined,
): (trial: TrialRecord) => number | null {
  if (metric === 'consecutiveLosses')
    return (trial) => trial.inSampleStatistics?.maxConsecutiveLosses ?? null;
  const read = metricReader(reportMetrics[metric], sample);
  return (trial) => read(inSampleMetrics(trial));
}

/** The figures a leaderboard row shows for one range. */
export interface TrialFigures {
  readonly netProfit: number | null;
  readonly profitFactor: number | null;
  /** The largest drawdown as a positive percentage, as the engine reports it. */
  readonly maxDrawdownPercent: number | null;
  readonly trades: number | null;
}

interface FigureReaders {
  readonly netProfit: MetricRead;
  readonly profitFactor: MetricRead;
  readonly maxDrawdown: MetricRead;
  readonly trades: MetricRead;
}

function figures(readers: FigureReaders, metrics: Metrics | undefined): TrialFigures {
  return {
    netProfit: readers.netProfit(metrics),
    profitFactor: readers.profitFactor(metrics),
    maxDrawdownPercent: readers.maxDrawdown(metrics),
    trades: readers.trades(metrics),
  };
}

export type ValidationResultMode = 'none' | 'in-out';

/** One analysis in the current ranking order; the views below read it. */
export interface RankedResults {
  readonly analysis: OptimizerAnalysis;
  readonly mode: ValidationResultMode;
  readonly objective: ObjectiveId;
  readonly direction: Direction;
  /** The searched inputs with their values, in declaration order. */
  readonly axes: readonly AnalysisAxis[];
  /** Sets that pass the filters, best first. */
  readonly ranked: readonly TrialRecord[];
  /** 1-based rank by trial id. */
  readonly rankOf: ReadonlyMap<string, number>;
  /** A report every trial's keys match, for the metric readers. */
  readonly sample: Metrics | undefined;
  readonly readers: FigureReaders;
}

/**
 * Put an analysis in ranking order. The analysis ranks by the objective's IS value. The
 * neighbourhood mean re-ranks the same sets by the analysis' neighbourhood means with
 * @pine/optimizer's `leaderboard`: the analysis' own `rankBy: 'secondary'` means OOS for IS / OOS.
 */
export function rankResults(
  analysis: OptimizerAnalysis,
  mode: ValidationResultMode,
  objective: ObjectiveId,
  direction: Direction,
  axes: readonly AnalysisAxis[],
): RankedResults {
  let ranked: readonly TrialRecord[] = analysis.ranked;
  if (objective === 'neighbourhoodMean') {
    const byId = new Map(analysis.ranked.map((trial) => [trial.trialId, trial]));
    ranked = leaderboard(
      analysis.ranked.map((trial) => ({
        ...trial,
        objectiveValue: analysis.neighbors[trial.trialId] ?? null,
      })),
      { direction },
    ).map((trial) => byId.get(trial.trialId)!);
  }
  const sample =
    analysis.trials.find((trial) => trial.valid && inSampleMetrics(trial))?.inSampleMetrics ??
    analysis.trials.map(inSampleMetrics).find((metrics) => metrics);
  return {
    analysis,
    mode,
    objective,
    direction,
    axes,
    ranked,
    rankOf: new Map(ranked.map((trial, index) => [trial.trialId, index + 1])),
    sample,
    readers: {
      netProfit: metricReader(reportMetrics.netProfit, sample),
      profitFactor: metricReader(reportMetrics.profitFactor, sample),
      maxDrawdown: metricReader(reportMetrics.maxDrawdown, sample),
      trades: metricReader(reportMetrics.trades, sample),
    },
  };
}

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

function leaderboardRow(results: RankedResults, trial: TrialRecord, rank: number): LeaderboardRow {
  const neighbourhoodMean = results.analysis.neighbors[trial.trialId] ?? null;
  return {
    rank,
    trialId: trial.trialId,
    parameters: trial.parameters as Record<string, LiteralValue>,
    score: results.objective === 'neighbourhoodMean' ? neighbourhoodMean : trial.inSampleValue,
    objective: { inSample: trial.inSampleValue, outOfSample: trial.outOfSampleValue },
    inSample: figures(results.readers, inSampleMetrics(trial)),
    outOfSample:
      results.mode === 'none' ? null : figures(results.readers, outOfSampleMetrics(trial)),
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

export function leaderboardView(results: RankedResults, page: number): LeaderboardView {
  const pages = pageCount(results.ranked.length);
  const at = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const { x, y, z } = results.analysis.axes;
  const searched = results.axes.map((axis) => axis.title);
  const first = [x, y, z].filter((title): title is string => !!title && searched.includes(title));
  const start = at * leaderboardPageSize;
  return {
    page: at,
    pageCount: pages,
    passing: results.ranked.length,
    total: results.analysis.trials.length,
    columns: [...first, ...searched.filter((title) => !first.includes(title))],
    rows: results.ranked
      .slice(start, start + leaderboardPageSize)
      .map((trial, index) => leaderboardRow(results, trial, start + index + 1)),
  };
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
  const rank = (trialId !== null && results.rankOf.get(trialId)) || (results.ranked.length ? 1 : 0);
  if (!rank) return null;
  const row = leaderboardRow(results, results.ranked[rank - 1], rank);
  return {
    row,
    explicit: row.trialId === trialId,
    origin: { kind: 'rank', optimizationId, trialId: row.trialId, rank },
  };
}

export interface ScatterPoint {
  readonly trialId: string;
  readonly inSample: number;
  readonly outOfSample: number;
  /** Null for a set the filters exclude. */
  readonly rank: number | null;
}

/** IS vs OOS (R2): one point per completed set with both net profits. */
export interface ScatterView {
  readonly points: readonly ScatterPoint[];
  /** The current leaderboard page's ranks, first and last, highlighted on the chart. */
  readonly pageRanks: readonly [number, number] | null;
}

export function scatterView(results: RankedResults, page: number): ScatterView | null {
  if (results.mode === 'none') return null;
  const points: ScatterPoint[] = [];
  for (const trial of results.analysis.trials) {
    if (!trial.valid) continue;
    const inSample = results.readers.netProfit(inSampleMetrics(trial));
    const outOfSample = results.readers.netProfit(outOfSampleMetrics(trial));
    if (inSample === null || outOfSample === null) continue;
    points.push({
      trialId: trial.trialId,
      inSample,
      outOfSample,
      rank: results.rankOf.get(trial.trialId) ?? null,
    });
  }
  const passing = results.ranked.length;
  const first = Math.min(Math.max(0, Math.floor(page)), pageCount(passing) - 1);
  const start = first * leaderboardPageSize + 1;
  return {
    points,
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

function median(sorted: readonly number[]): number | null {
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function distributionView(results: RankedResults): DistributionView {
  const inValues: number[] = [];
  const outValues: number[] = [];
  for (const trial of results.analysis.trials) {
    if (!trial.valid) continue;
    const inSample = results.readers.netProfit(inSampleMetrics(trial));
    if (inSample !== null) inValues.push(inSample);
    if (results.mode === 'none') continue;
    const outOfSample = results.readers.netProfit(outOfSampleMetrics(trial));
    if (outOfSample !== null) outValues.push(outOfSample);
  }
  const all = [...inValues, ...outValues];
  const low = all.length ? Math.min(...all) : 0;
  const high = all.length ? Math.max(...all) : 0;
  const width = binWidth(high - low);
  const start = Math.floor(low / width) * width;
  const bins = Math.floor((high - start) / width + 1e-9) + 1;
  const histogram = (values: number[]): Histogram => {
    const counts = new Array<number>(bins).fill(0);
    for (const value of values)
      counts[Math.min(bins - 1, Math.max(0, Math.floor((value - start) / width + 1e-9)))]++;
    return {
      counts,
      sets: values.length,
      profitable: values.filter((value) => value > 0).length,
      median: median([...values].sort((a, b) => a - b)),
    };
  };
  const best = results.ranked[0];
  return {
    start,
    width,
    bins,
    inSample: histogram(inValues),
    outOfSample: results.mode === 'none' ? null : histogram(outValues),
    best: best ? results.readers.netProfit(inSampleMetrics(best)) : null,
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
  if (results.ranked.length || !filters.length) return [];
  const completed = results.analysis.trials.filter((trial) => trial.valid);
  return filters.map((filter) => {
    const read = filterReader(filter.metric, results.sample);
    let passing = 0;
    let best: number | null = null;
    for (const trial of completed) {
      const value = read(trial);
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

/** From the analysis computed with `draft` as its `constraintDraft`. */
export function draftPreview(
  results: RankedResults,
  draft: FilterCondition,
  page: number,
): DraftPreview {
  const removed = new Set(
    results.analysis.removedConstraintRanks.map((index) => results.analysis.ranked[index].trialId),
  );
  return {
    filter: draft,
    excluded: removed.size,
    pageRanks: leaderboardView(results, page)
      .rows.filter((row) => removed.has(row.trialId))
      .map((row) => row.rank),
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

/** The parameter map (R1, R4): full resolution and binned above 24 values per axis. */
export interface MapView {
  /** `all` for validation None. */
  readonly surface: 'all' | MapSurface;
  readonly x: string;
  readonly y: string | null;
  readonly z: string | null;
  readonly map: Heatmap;
  /** What the map draws: adjacent values averaged into one cell above 24 per axis. */
  readonly panel: Heatmap;
  readonly binned: boolean;
  readonly slices: readonly SliceChip[];
}

function surfaceMap(
  analysis: OptimizerAnalysis,
  surface: 'all' | MapSurface,
): OptimizerAnalysis['maps'][number] | undefined {
  return analysis.maps.find((item) => item.surface === surface);
}

/** The map for two or more searched inputs; the IS / OOS switch needs no new analysis. */
export function mapView(
  results: RankedResults,
  surface: MapSurface,
  slices: Readonly<Record<string, Slice>>,
): MapView | null {
  const { analysis } = results;
  const { x, y, z } = analysis.axes;
  if (results.axes.length < 2 || !x) return null;
  const shown = results.mode === 'none' ? 'all' : surface;
  const maps = surfaceMap(analysis, shown);
  if (!maps) return null;
  const display = maps.panelMap.display;
  return {
    surface: shown,
    x,
    y: y ?? null,
    z: z ?? null,
    map: maps.map,
    panel: maps.panelMap,
    binned: !!display && (display.xBinSize > 1 || display.yBinSize > 1),
    slices: results.axes
      .filter((axis) => ![x, y, z].includes(axis.title))
      .map((axis) => {
        const slice = slices[axis.title];
        const chosen = slice && Object.hasOwn(slice, 'value') ? slice.value : undefined;
        const value =
          chosen ?? analysis.heatmapSelection?.parameters[axis.title] ?? axis.values[0] ?? null;
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

export function cellValues(analysis: OptimizerAnalysis, cell: HeatmapCell): CellValues {
  const inSample = (surfaceMap(analysis, 'in') ?? surfaceMap(analysis, 'all'))?.map;
  const outOfSample = surfaceMap(analysis, 'out')?.map;
  const valueAt = (map: Heatmap | undefined, x: AnalysisValue, y: AnalysisValue | undefined) =>
    map?.cells.find((item) => same(item.x, x) && same(item.y, y) && same(item.z, cell.z))?.value ??
    null;
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

export function curveView(results: RankedResults): CurveView | null {
  const { analysis } = results;
  if (results.axes.length !== 1) return null;
  const inSample = (surfaceMap(analysis, 'in') ?? surfaceMap(analysis, 'all'))?.map;
  if (!inSample) return null;
  const outOfSample = surfaceMap(analysis, 'out')?.map;
  const points = inSample.cells.map((cell) => {
    const trialId = cell.trialId ?? null;
    return {
      x: cell.x,
      inSample: cell.value,
      outOfSample: outOfSample?.cells.find((item) => same(item.x, cell.x))?.value ?? null,
      neighbourhoodMean: trialId === null ? null : (analysis.neighbors[trialId] ?? null),
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
  const { sensitivity, axes } = results.analysis;
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

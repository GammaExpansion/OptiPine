import type { LiteralValue } from '@pine/engine';
import type { HeatmapDisplay } from './heatmap-display.ts';
import { optimizerError } from './text.ts';
import type { TrialRecord } from './validation.ts';

export type AnalysisValue = Exclude<LiteralValue, null>;
export interface AnalysisAxis {
  title: string;
  values: readonly LiteralValue[];
}
export type TrialValue = (trial: TrialRecord) => number | null;
export interface AnalysisOptions {
  axes?: readonly AnalysisAxis[];
  value?: TrialValue;
  neighborhood?: boolean;
}
export interface Slice {
  mode: 'fixed' | 'max' | 'mean';
  value?: LiteralValue;
  pinned?: boolean;
}
export interface HeatmapOptions extends AnalysisOptions {
  zKey?: string;
  slices?: Readonly<Record<string, Slice>>;
  sliceMode?: Slice['mode'];
  /** Selected/best parameters supply the default for a fixed slice. */
  parameters?: Readonly<Record<string, unknown>>;
  direction?: 'maximize' | 'minimize';
}
export interface HeatmapCell {
  x: AnalysisValue;
  y?: AnalysisValue;
  z?: AnalysisValue;
  value: number | null;
  count: number;
  rankBin?: number;
  xValues?: AnalysisValue[];
  yValues?: AnalysisValue[];
  averagedCells?: number;
  trialId?: string;
}
export interface HeatmapLayer {
  z: AnalysisValue;
  cells: HeatmapCell[];
}
export interface Heatmap {
  xKey: string;
  yKey?: string;
  zKey?: string;
  cells: HeatmapCell[];
  layers?: HeatmapLayer[];
  display?: HeatmapDisplay;
}
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const scalar = (value: unknown): value is AnalysisValue =>
  typeof value === 'string' || typeof value === 'boolean' || finite(value);
const key = (value: unknown): string => JSON.stringify(value) ?? 'undefined';
const same = (left: unknown, right: unknown): boolean => key(left) === key(right);
/** JSON keys decide parameter equality; each trial parameter is stringified once per analysis. */
class ParameterKeys {
  #cache = new Map<TrialRecord, Map<string, string>>();
  of(trial: TrialRecord, title: string): string {
    let keys = this.#cache.get(trial);
    if (!keys) {
      keys = new Map();
      this.#cache.set(trial, keys);
    }
    let value = keys.get(title);
    if (value === undefined) {
      value = key(trial.parameters[title]);
      keys.set(title, value);
    }
    return value;
  }
}
const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value / values.length, 0);
function sortedUnique(values: readonly unknown[]): AnalysisValue[] {
  const unique = [...new Map(values.filter(scalar).map((value) => [key(value), value])).values()];
  return unique.sort((a, b) =>
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : typeof a === 'boolean' && typeof b === 'boolean'
        ? Number(a) - Number(b)
        : String(a).localeCompare(String(b)),
  );
}
function axesFor(trials: readonly TrialRecord[], axes?: readonly AnalysisAxis[]): AnalysisAxis[] {
  return axes
    ? axes.map((axis) => ({ title: axis.title, values: axis.values.filter(scalar) }))
    : [...new Set(trials.flatMap((trial) => Object.keys(trial.parameters)))].map((title) => ({
        title,
        values: sortedUnique(trials.map((trial) => trial.parameters[title])),
      }));
}
const rawObjective: TrialValue = (trial) => trial.objectiveValue;
function accepted(trials: readonly TrialRecord[], value: TrialValue): TrialRecord[] {
  return trials.filter((trial) => trial.valid && !trial.excluded && finite(value(trial)));
}
/** Average observed +/-1-step neighbours in every active dimension; absent trials are never zeroes. */
export function neighborhoodValues(
  trials: readonly TrialRecord[],
  axes?: readonly AnalysisAxis[],
  value: TrialValue = rawObjective,
): Map<TrialRecord, number | null> {
  const dimensions = axesFor(trials, axes);
  const valid = accepted(trials, value);
  const keys = new ParameterKeys();
  // First occurrence wins, matching findIndex when an axis lists a value twice.
  const positions = dimensions.map((axis) => {
    const byKey = new Map<string, number>();
    axis.values.forEach((item, index) => {
      const itemKey = key(item);
      if (!byKey.has(itemKey)) byKey.set(itemKey, index);
    });
    return byKey;
  });
  const coordinates = new Map(
    valid.map((trial) => [
      trial,
      dimensions.map((axis, index) => positions[index].get(keys.of(trial, axis.title)) ?? -1),
    ]),
  );
  const byFirstCoordinate = new Map<number, TrialRecord[]>();
  for (const trial of valid) {
    const first = coordinates.get(trial)![0] ?? 0;
    const bucket = byFirstCoordinate.get(first) ?? [];
    bucket.push(trial);
    byFirstCoordinate.set(first, bucket);
  }
  const values = new Map<TrialRecord, number | null>();
  for (const trial of trials) {
    const coordinate = coordinates.get(trial);
    if (!coordinate || coordinate.some((index) => index < 0)) {
      values.set(trial, null);
      continue;
    }
    const candidates = dimensions.length
      ? [-1, 0, 1].flatMap((offset) => byFirstCoordinate.get(coordinate[0] + offset) ?? [])
      : valid;
    const neighbours = candidates.filter((other) => {
      const otherCoordinate = coordinates.get(other)!;
      if (!otherCoordinate.every((index, i) => index >= 0 && Math.abs(index - coordinate[i]) <= 1))
        return false;
      // A disabled/fixed input is not another neighbourhood dimension.
      return [...new Set([...Object.keys(trial.parameters), ...Object.keys(other.parameters)])]
        .filter((name) => !dimensions.some((axis) => axis.title === name))
        .every((name) => keys.of(trial, name) === keys.of(other, name));
    });
    values.set(trial, neighbours.length ? mean(neighbours.map((other) => value(other)!)) : null);
  }
  return values;
}
export function neighborhoodTrials(
  trials: readonly TrialRecord[],
  axes?: readonly AnalysisAxis[],
  value: TrialValue = rawObjective,
): TrialRecord[] {
  const values = neighborhoodValues(trials, axes, value);
  return trials.map((trial) => ({ ...trial, objectiveValue: values.get(trial) ?? null }));
}
function evaluated(
  trials: readonly TrialRecord[],
  options: AnalysisOptions,
): { trials: TrialRecord[]; value: TrialValue; axes: AnalysisAxis[] } {
  const axes = axesFor(trials, options.axes);
  const raw = options.value ?? rawObjective;
  const smoothed = options.neighborhood ? neighborhoodValues(trials, axes, raw) : undefined;
  const value: TrialValue = smoothed ? (trial) => smoothed.get(trial) ?? null : raw;
  return { trials: accepted(trials, value), value, axes };
}
interface Aggregate {
  value: number | null;
  count: number;
}
function aggregate(
  trials: readonly TrialRecord[],
  remaining: readonly AnalysisAxis[],
  options: HeatmapOptions,
  value: TrialValue,
  defaults: Readonly<Record<string, unknown>>,
  keys: ParameterKeys,
  depth = 0,
): Aggregate {
  if (!trials.length) return { value: null, count: 0 };
  const axis = remaining[depth];
  if (!axis) return { value: mean(trials.map((trial) => value(trial)!)), count: trials.length };
  const slice = options.slices?.[axis.title] ?? { mode: options.sliceMode ?? 'fixed' };
  const hasValue = Object.prototype.hasOwnProperty.call(slice, 'value');
  if (slice.mode === 'fixed' || slice.pinned) {
    const fixed = key(hasValue ? slice.value : (defaults[axis.title] ?? axis.values[0]));
    return aggregate(
      trials.filter((trial) => keys.of(trial, axis.title) === fixed),
      remaining,
      options,
      value,
      defaults,
      keys,
      depth + 1,
    );
  }
  const groups = axis.values
    .map((item) => {
      const itemKey = key(item);
      return aggregate(
        trials.filter((trial) => keys.of(trial, axis.title) === itemKey),
        remaining,
        options,
        value,
        defaults,
        keys,
        depth + 1,
      );
    })
    .filter((item) => item.value !== null);
  return {
    value: groups.length
      ? slice.mode === 'max'
        ? Math.max(...groups.map((item) => item.value!))
        : mean(groups.map((item) => item.value!))
      : null,
    count: groups.reduce((total, item) => total + item.count, 0),
  };
}
/** Remaining dimensions reduce in their declared axis order, with pinned chips always filtering first. */
export function heatmap(
  trials: readonly TrialRecord[],
  xKey: string,
  yKey?: string,
  options: HeatmapOptions = {},
): Heatmap {
  const evaluatedTrials = evaluated(trials, options);
  const { value, axes } = evaluatedTrials;
  const active = evaluatedTrials.trials;
  const selectedKeys = [xKey, yKey, options.zKey].filter((name): name is string => !!name);
  if (new Set(selectedKeys).size !== selectedKeys.length)
    throw optimizerError('heatmapAxesDistinct');
  const axis = (name: string): AnalysisAxis =>
    axes.find((item) => item.title === name) ?? {
      title: name,
      values: sortedUnique(active.map((trial) => trial.parameters[name])),
    };
  const xs = axis(xKey).values.filter(scalar),
    ys = yKey ? axis(yKey).values.filter(scalar) : [undefined];
  const zs = options.zKey ? axis(options.zKey).values.filter(scalar) : [undefined];
  if (xs.length * ys.length * zs.length > 1000000) throw optimizerError('heatmapCellLimit');
  const remaining = axes.filter((item) => !selectedKeys.includes(item.title));
  const best = [...active].sort((a, b) =>
    options.direction === 'minimize' ? value(a)! - value(b)! : value(b)! - value(a)!,
  )[0];
  const defaults = options.parameters ?? best?.parameters ?? {};
  // Group once by the selected coordinates instead of filtering every trial for every cell.
  const keys = new ParameterKeys();
  const zKey = options.zKey;
  const coordinate = (xk: string, yk: string, zk: string): string => JSON.stringify([xk, yk, zk]);
  const groups = new Map<string, TrialRecord[]>();
  for (const trial of active) {
    const id = coordinate(
      keys.of(trial, xKey),
      yKey ? keys.of(trial, yKey) : '',
      zKey ? keys.of(trial, zKey) : '',
    );
    const group = groups.get(id);
    if (group) group.push(trial);
    else groups.set(id, [trial]);
  }
  const cells: HeatmapCell[] = [];
  for (const z of zs)
    for (const y of ys)
      for (const x of xs) {
        const members =
          groups.get(coordinate(key(x), yKey ? key(y) : '', zKey ? key(z) : '')) ?? [];
        const result = aggregate(members, remaining, options, value, defaults, keys);
        cells.push({
          x,
          ...(y === undefined ? {} : { y }),
          ...(z === undefined ? {} : { z }),
          ...result,
        });
      }
  return {
    xKey,
    ...(yKey ? { yKey } : {}),
    ...(options.zKey
      ? {
          zKey: options.zKey,
          layers: zs
            .filter(scalar)
            .map((z) => ({ z, cells: cells.filter((cell) => same(cell.z, z)) })),
        }
      : {}),
    cells,
  };
}
/** Each window contributes one surface, including its own neighbourhood and retuned slices. */
export function meanWindowHeatmap(
  windows: readonly (readonly TrialRecord[])[],
  xKey: string,
  yKey?: string,
  options: HeatmapOptions = {},
): Heatmap {
  const maps = (windows.length ? windows : [[]]).map((trials) =>
    heatmap(trials, xKey, yKey, options),
  );
  const byCoordinate = maps.map(
    (map) => new Map(map.cells.map((cell) => [key([cell.x, cell.y, cell.z]), cell])),
  );
  const cells = maps[0].cells.map((cell) => {
    const contributions = byCoordinate
      .map((map) => map.get(key([cell.x, cell.y, cell.z])))
      .filter((item) => item?.value !== null && item?.value !== undefined);
    return {
      ...cell,
      value: contributions.length ? mean(contributions.map((item) => item!.value!)) : null,
      count: contributions.reduce((total, item) => total + item!.count, 0),
    };
  });
  return {
    ...maps[0],
    cells,
    ...(maps[0].layers
      ? {
          layers: maps[0].layers.map((layer) => ({
            z: layer.z,
            cells: cells.filter((cell) => same(cell.z, layer.z)),
          })),
        }
      : {}),
  };
}
export interface SensitivityPoint {
  parameter: string;
  value: AnalysisValue;
  mean: number | null;
  q1: number | null;
  q3: number | null;
  count: number;
  etaSquared: number;
}
export interface ParameterSensitivity {
  parameter: string;
  points: SensitivityPoint[];
  etaSquared: number;
}
export interface SensitivitySummary {
  parameters: ParameterSensitivity[];
  sharedScale: [number, number] | null;
}
function quantile(sorted: readonly number[], fraction: number): number | null {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * fraction,
    lo = Math.floor(at),
    weight = at - lo;
  return sorted[lo] * (1 - weight) + sorted[Math.min(lo + 1, sorted.length - 1)] * weight;
}
export function sensitivity(
  trials: readonly TrialRecord[],
  parameter: string,
  options: AnalysisOptions = {},
): SensitivityPoint[] {
  const { trials: active, value, axes } = evaluated(trials, options);
  const values =
    axes.find((axis) => axis.title === parameter)?.values.filter(scalar) ??
    sortedUnique(active.map((trial) => trial.parameters[parameter]));
  const groups = values.map((item) => ({
    item,
    scores: active
      .filter((trial) => same(trial.parameters[parameter], item))
      .map((trial) => value(trial)!)
      .sort((a, b) => a - b),
  }));
  const all = active.map((trial) => value(trial)!);
  const overall = all.length ? mean(all) : 0;
  const total = all.reduce((sum, score) => sum + (score - overall) ** 2, 0);
  const between = groups.reduce(
    (sum, group) =>
      sum + (group.scores.length ? group.scores.length * (mean(group.scores) - overall) ** 2 : 0),
    0,
  );
  const etaSquared = total > 0 ? Math.max(0, Math.min(1, between / total)) : 0;
  return groups.map((group) => ({
    parameter,
    value: group.item,
    mean: group.scores.length ? mean(group.scores) : null,
    q1: quantile(group.scores, 0.25),
    q3: quantile(group.scores, 0.75),
    count: group.scores.length,
    etaSquared,
  }));
}
export function buildSensitivitySummary(
  trials: readonly TrialRecord[],
  parameters: readonly string[],
  options: AnalysisOptions = {},
): SensitivitySummary {
  const strips = parameters.map((parameter) => {
    const points = sensitivity(trials, parameter, options);
    return { parameter, points, etaSquared: points[0]?.etaSquared ?? 0 };
  });
  const scores = strips
    .flatMap((strip) => strip.points.flatMap((point) => [point.mean, point.q1, point.q3]))
    .filter(finite);
  return {
    parameters: strips,
    sharedScale: scores.length ? [Math.min(...scores), Math.max(...scores)] : null,
  };
}
export function defaultHeatmapAxes(
  trials: readonly TrialRecord[],
  axes: readonly AnalysisAxis[],
): string[] {
  return axes
    .map((axis, index) => ({
      title: axis.title,
      index,
      eta: sensitivity(trials, axis.title, { axes })[0]?.etaSquared ?? 0,
    }))
    .sort((a, b) => b.eta - a.eta || a.index - b.index)
    .slice(0, 2)
    .map((axis) => axis.title);
}

export interface StabilityBand {
  parameter: string;
  window: number;
  values: AnalysisValue[];
  chosen: AnalysisValue | null;
  best: number | null;
  /** Best score with this parameter fixed and all other parameters re-tuned. */
  scores?: { value: AnalysisValue; objective: number | null; shortfall: number | null }[];
}
export interface StabilitySummary {
  parameter: string;
  bands: StabilityBand[];
  intersection: AnalysisValue[];
  fixedValue: AnalysisValue | null;
  averageShortfall: number | null;
  /** Runs of adjacent values in `intersection`; `from` equals `to` for a single value. */
  commonRanges: { from: AnalysisValue; to: AnalysisValue }[];
  allNearOptimal?: boolean;
}
/** At a zero best, only an equal score has finite relative shortfall. Missing evidence is null. */
function relativeShortfall(
  best: number,
  candidate: number,
  direction: 'maximize' | 'minimize',
): number {
  const loss = Math.max(0, direction === 'maximize' ? best - candidate : candidate - best);
  return best === 0 ? (loss === 0 ? 0 : Infinity) : loss / Math.abs(best);
}
export function stabilityBands(
  windows: readonly {
    trials: readonly TrialRecord[];
    chosenParameters?: Record<string, unknown>;
  }[],
  parameters: readonly string[],
  tolerance = 0.1,
  direction: 'maximize' | 'minimize' = 'maximize',
  options: AnalysisOptions = {},
): StabilitySummary[] {
  if (!finite(tolerance) || tolerance < 0) throw optimizerError('stabilityToleranceFinite');
  const globalAxes = axesFor(
    windows.flatMap((window) => [...window.trials]),
    options.axes,
  );
  const records = windows.map((window) =>
    evaluated(window.trials, { ...options, axes: globalAxes }),
  );
  return parameters.map((parameter) => {
    const domain = globalAxes.find((axis) => axis.title === parameter)?.values.filter(scalar) ?? [];
    const bands: StabilityBand[] = records.map((record, index) => {
      const scores = record.trials.map((trial) => record.value(trial)!);
      const best = scores.length
        ? direction === 'maximize'
          ? Math.max(...scores)
          : Math.min(...scores)
        : null;
      const profiles = domain.map((item) => {
        const matching = record.trials
          .filter((trial) => same(trial.parameters[parameter], item))
          .map((trial) => record.value(trial)!);
        const objective = matching.length
          ? direction === 'maximize'
            ? Math.max(...matching)
            : Math.min(...matching)
          : null;
        return {
          value: item,
          objective,
          shortfall:
            best === null || objective === null
              ? null
              : relativeShortfall(best, objective, direction),
        };
      });
      const chosen = windows[index].chosenParameters?.[parameter];
      return {
        parameter,
        window: index,
        best,
        chosen: scalar(chosen) ? chosen : null,
        values: profiles
          .filter((profile) => profile.shortfall !== null && profile.shortfall <= tolerance)
          .map((profile) => profile.value),
        scores: profiles,
      };
    });
    const intersection = bands.length
      ? domain.filter((item) =>
          bands.every((band) => band.values.some((value) => same(value, item))),
        )
      : [];
    const candidates = domain
      .map((item) => {
        const shortfalls = bands.map(
          (band) => band.scores!.find((profile) => same(profile.value, item))!.shortfall,
        );
        // Missing windows/parameter values cannot make a fixed value look risk-free.
        const score =
          !bands.length || shortfalls.some((shortfall) => shortfall === null)
            ? null
            : shortfalls.some((shortfall) => shortfall === Infinity)
              ? Infinity
              : mean(shortfalls as number[]);
        return { value: item, score };
      })
      .filter(
        (candidate): candidate is { value: AnalysisValue; score: number } =>
          candidate.score !== null && Number.isFinite(candidate.score),
      );
    candidates.sort((a, b) => a.score - b.score);
    const intervals: AnalysisValue[][] = [];
    for (const item of intersection) {
      const previous = intervals.at(-1);
      const adjacent =
        previous &&
        domain.findIndex((value) => same(value, item)) ===
          domain.findIndex((value) => same(value, previous.at(-1))) + 1;
      if (
        adjacent &&
        typeof item === 'number' &&
        previous.every((value) => typeof value === 'number')
      )
        previous.push(item);
      else intervals.push([item]);
    }
    return {
      parameter,
      bands,
      intersection,
      fixedValue: candidates[0]?.value ?? null,
      averageShortfall: candidates[0]?.score ?? null,
      commonRanges: intervals.map((interval) => ({ from: interval[0], to: interval.at(-1)! })),
      allNearOptimal:
        !!domain.length &&
        !!bands.length &&
        bands.every((band) => band.values.length === domain.length),
    };
  });
}

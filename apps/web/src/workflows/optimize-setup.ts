import type { InputDescriptor, LiteralValue, MarketBar } from '@pine/engine';
import { errorText, type Message, type Text } from '@pine/messages';
import {
  generateSearchSpace,
  sampleRandom,
  splitBars,
  type SearchRange,
  type SearchSpace,
  type WalkForwardConfig,
} from '@pine/optimizer';
import { fixedInputReason } from './inputs.ts';
import { workflowMessage } from './messages.ts';

/** Above this many grid combinations the search samples at random instead (O5, WEB.md 3.4). */
export const gridLimit = 20_000;
export const defaultSampleCount = 2_000;
export const defaultSeed = 42;

// The type groups @pine/optimizer searches: a range of numbers, or a list of values.
const numericTypes = new Set(['int', 'float', 'number', 'price', 'time']);
const booleanTypes = new Set(['bool', 'boolean']);

export type SearchValues =
  | { readonly kind: 'range'; readonly from: number; readonly to: number; readonly step: number }
  | { readonly kind: 'list'; readonly values: readonly LiteralValue[] };

/** What the user set on one search-range row. */
export interface SearchDraft {
  /** The row's checkbox: search the input, or fix it at `fixed`. */
  readonly searched: boolean;
  readonly values: SearchValues;
  /** The value of a row that is not searched; the input's current value until one is set. */
  readonly fixed?: LiteralValue;
}

export interface SearchChoice {
  readonly value: LiteralValue;
  readonly kept: boolean;
}

export type SearchRowStatus = 'searched' | 'fixed' | 'excluded';

/** One input's row under Search ranges (O1, O4–O6), in declaration order. */
export interface SearchRow {
  readonly descriptor: InputDescriptor;
  /** Null for an input that cannot be searched. */
  readonly draft: SearchDraft | null;
  /** A list row's every possible value in declaration order, and whether it is kept (O4). */
  readonly choices: readonly SearchChoice[];
  /**
   * The values the run takes: several for a searched input, one for a fixed one (a searched row
   * left with one value fixes the input), none with an error or when the script computes it.
   */
  readonly values: readonly LiteralValue[];
  readonly status: SearchRowStatus;
  /** Why the row blocks the run, from @pine/optimizer's own validation (O6). */
  readonly error: Text | null;
  /** Why the input cannot be searched; the run then uses its current or computed value. */
  readonly excluded: Message | null;
}

export interface SamplingSettings {
  readonly method: 'grid' | 'random';
  readonly count: number;
  readonly seed: number;
}

/** How the run picks its parameter sets (O5). */
export interface Sampling {
  readonly method: 'grid' | 'random';
  /** The grid was chosen but exceeds `gridLimit`, so the run samples at random. */
  readonly switched: boolean;
  readonly gridCombinations: number;
  /** The parameter sets the run takes. */
  readonly combinations: number;
  readonly count: number;
  readonly seed: number;
  /** Says that the grid switched to random sampling. */
  readonly notice: Message | null;
  /** A sample count or seed the run cannot use. */
  readonly error: Text | null;
}

export interface SearchSetup {
  readonly rows: readonly SearchRow[];
  /** The space the run searches; null while a row or the space has an error. */
  readonly space: SearchSpace | null;
  /** The space as a whole is invalid, for example its grid is too large to count. */
  readonly error: Text | null;
  /** Null without a space. */
  readonly sampling: Sampling | null;
  /** Errors that block the run: rows, the space, and sampling. */
  readonly errorCount: number;
  /** Identifies what the run would search, to tell whether results used other ranges (R5). */
  readonly key: string;
}

const searchable = (descriptor: InputDescriptor): boolean =>
  !descriptor.fixed &&
  (numericTypes.has(descriptor.type) ||
    booleanTypes.has(descriptor.type) ||
    !!descriptor.options?.length);

/** Every value a list row can keep: the declared options, or false and true. */
function choicesOf(descriptor: InputDescriptor): readonly LiteralValue[] {
  return descriptor.options?.length ? descriptor.options : [false, true];
}

const key = (value: unknown): string => JSON.stringify(value) ?? 'undefined';

/**
 * A new row's draft. A numeric range spans the input's minimum to maximum by its step, the same
 * bounds @pine/optimizer assumes, falling back to the default value and a step of 1 (0.01 for a
 * price); a list keeps the values @pine/optimizer searches by default. The row starts searched
 * when that gives more than one value.
 */
export function defaultSearchDraft(descriptor: InputDescriptor): SearchDraft {
  let values: SearchValues;
  if (numericTypes.has(descriptor.type) && !descriptor.options?.length) {
    const fallback = typeof descriptor.defaultValue === 'number' ? descriptor.defaultValue : 0;
    const from = descriptor.min ?? fallback;
    values = {
      kind: 'range',
      from,
      to: descriptor.max ?? Math.max(from, fallback),
      step: descriptor.step ?? (descriptor.type === 'price' ? 0.01 : 1),
    };
  } else {
    let kept: readonly LiteralValue[];
    try {
      kept = generateSearchSpace([descriptor]).axes[0].values;
    } catch {
      kept = choicesOf(descriptor);
    }
    values = { kind: 'list', values: kept };
  }
  const draft: SearchDraft = { searched: true, values };
  return { ...draft, searched: valuesOf(descriptor, draft).values.length > 1 };
}

/** A draft survives a recompile when the input keeps its type and, for a list, its choices. */
export function keepSearchDraft(
  descriptor: InputDescriptor,
  previous: { readonly descriptor: InputDescriptor; readonly draft: SearchDraft } | undefined,
): SearchDraft {
  return previous &&
    previous.descriptor.type === descriptor.type &&
    key(previous.descriptor.options) === key(descriptor.options)
    ? previous.draft
    : defaultSearchDraft(descriptor);
}

function rangeOf(values: SearchValues): SearchRange {
  return values.kind === 'range'
    ? { from: values.from, to: values.to, step: values.step }
    : { values: [...values.values] };
}

/** The values one row searches, checked by @pine/optimizer on its own. */
function valuesOf(
  descriptor: InputDescriptor,
  draft: SearchDraft,
): { values: LiteralValue[]; error: Text | null } {
  try {
    const space = generateSearchSpace([descriptor], {
      ranges: { [descriptor.id]: rangeOf(draft.values) },
    });
    return { values: space.axes[0].values, error: null };
  } catch (error) {
    return { values: [], error: errorText(error) };
  }
}

/** Check a fixed value as @pine/optimizer does for an input it does not search. */
function fixedValueError(descriptor: InputDescriptor, value: LiteralValue): Text | null {
  try {
    generateSearchSpace([descriptor], {
      active: { [descriptor.id]: false },
      currentValues: { [descriptor.id]: value },
    });
    return null;
  } catch (error) {
    return errorText(error);
  }
}

function searchRow(
  descriptor: InputDescriptor,
  draft: SearchDraft | undefined,
  current: LiteralValue | undefined,
): SearchRow {
  if (!searchable(descriptor)) {
    const values = descriptor.fixed || current === undefined ? [] : [current];
    return {
      descriptor,
      draft: null,
      choices: [],
      values,
      status: 'excluded',
      error: null,
      excluded: descriptor.fixed
        ? fixedInputReason(descriptor)
        : workflowMessage('optimize.inputNotSearchable', {
            title: descriptor.title,
            type: descriptor.type,
          }),
    };
  }
  const settled = draft ?? defaultSearchDraft(descriptor);
  const list = settled.values.kind === 'list' ? settled.values.values : null;
  const choices = list
    ? choicesOf(descriptor).map((value) => ({
        value,
        kept: list.some((kept) => key(kept) === key(value)),
      }))
    : [];
  const base = { descriptor, draft: settled, choices, excluded: null };
  if (!settled.searched) {
    const value = settled.fixed ?? current ?? descriptor.defaultValue;
    const error = value === undefined ? null : fixedValueError(descriptor, value);
    return {
      ...base,
      values: error || value === undefined ? [] : [value],
      status: 'fixed',
      error,
    };
  }
  const { values, error } = valuesOf(descriptor, settled);
  return { ...base, values, status: values.length === 1 ? 'fixed' : 'searched', error };
}

function samplingOf(gridCombinations: number, settings: SamplingSettings): Sampling {
  const switched = settings.method === 'grid' && gridCombinations > gridLimit;
  const method = switched ? 'random' : settings.method;
  let error: Text | null = null;
  if (method === 'random') {
    try {
      // An empty space makes @pine/optimizer check the count and seed without drawing samples.
      sampleRandom(
        { axes: [], activeAxes: [], combinationCount: 0 },
        settings.count,
        settings.seed,
      );
      if (settings.count < 1) error = workflowMessage('optimize.sampleCountPositive');
    } catch (failure) {
      error = errorText(failure);
    }
  }
  return {
    method,
    switched,
    gridCombinations,
    combinations:
      method === 'grid'
        ? gridCombinations
        : Math.min(Math.max(0, settings.count), gridCombinations),
    count: settings.count,
    seed: settings.seed,
    notice: switched
      ? workflowMessage('optimize.gridSwitchedToRandom', {
          count: gridCombinations,
          limit: gridLimit,
        })
      : null,
    error,
  };
}

/**
 * The Search ranges section: one row per input, the space @pine/optimizer builds from them, and
 * how the run samples it. `drafts` and `current` are keyed by input title; `current` holds the
 * Backtest page's values, which inputs that are fixed without a value of their own take.
 */
export function searchSetup(
  descriptors: readonly InputDescriptor[],
  drafts: ReadonlyMap<string, SearchDraft>,
  current: Readonly<Record<string, LiteralValue>>,
  settings: SamplingSettings,
): SearchSetup {
  const rows = descriptors.map((descriptor) =>
    searchRow(
      descriptor,
      drafts.get(descriptor.title),
      Object.hasOwn(current, descriptor.title) ? current[descriptor.title] : undefined,
    ),
  );
  const rowErrors = rows.filter((row) => row.error).length;
  const searchKey = key(
    rows.map((row) => [
      row.descriptor.title,
      row.status !== 'searched'
        ? row.values
        : row.draft!.values.kind === 'range'
          ? row.draft!.values
          : row.choices.filter((choice) => choice.kept).map((choice) => choice.value),
    ]),
  );
  if (rowErrors)
    return {
      rows,
      space: null,
      error: null,
      sampling: null,
      errorCount: rowErrors,
      key: searchKey,
    };
  const active: Record<string, boolean> = {};
  const ranges: Record<string, SearchRange> = {};
  const fixed: Record<string, LiteralValue> = {};
  for (const row of rows) {
    if (row.descriptor.fixed) continue;
    const id = row.descriptor.id;
    active[id] = row.status === 'searched';
    if (row.status === 'searched') ranges[id] = rangeOf(row.draft!.values);
    else if (row.values.length) fixed[id] = row.values[0];
  }
  let space: SearchSpace;
  try {
    space = generateSearchSpace(descriptors, { active, ranges, currentValues: fixed });
  } catch (error) {
    return {
      rows,
      space: null,
      error: errorText(error),
      sampling: null,
      errorCount: 1,
      key: searchKey,
    };
  }
  const sampling = samplingOf(space.combinationCount, settings);
  return {
    rows,
    space,
    error: null,
    sampling,
    errorCount: sampling.error ? 1 : 0,
    key: key([searchKey, sampling.method, sampling.method === 'random' && settings]),
  };
}

export interface WalkForwardSettings {
  readonly inSampleMonths: number;
  readonly outOfSampleMonths: number;
  readonly stepMonths: number;
  /** Every window's IS range starts at the first month instead of rolling forward (W6). */
  readonly anchored: boolean;
}

export type ValidationMode = 'none' | 'in-out' | 'walk-forward';

export interface ValidationSettings {
  readonly mode: ValidationMode;
  /** The OOS share of the bars for IS / OOS, in percent. */
  readonly outOfSamplePercent: number;
  readonly walkForward: WalkForwardSettings;
}

export const defaultValidation: ValidationSettings = {
  mode: 'in-out',
  outOfSamplePercent: 30,
  walkForward: { inSampleMonths: 12, outOfSampleMonths: 3, stepMonths: 3, anchored: false },
};

/** The IS share @pine/optimizer's `splitBars` takes. */
export function splitRatio(validation: ValidationSettings): number {
  return 1 - validation.outOfSamplePercent / 100;
}

export function walkForwardConfig(settings: WalkForwardSettings): WalkForwardConfig {
  return {
    inSampleLength: settings.inSampleMonths,
    outOfSampleLength: settings.outOfSampleMonths,
    step: settings.stepMonths,
    mode: settings.anchored ? 'anchored' : 'rolling',
  };
}

/** A stretch of bars: open times of its first and last bar, in Unix seconds. */
export interface BarSpan {
  readonly start: number;
  readonly end: number;
  readonly bars: number;
}

const span = (bars: readonly MarketBar[]): BarSpan | null =>
  bars.length ? { start: bars[0].time, end: bars.at(-1)!.time, bars: bars.length } : null;

/** The Data range bar for None and IS / OOS (O1, O2); walk-forward windows come from a plan. */
export interface DataRange {
  readonly all: BarSpan | null;
  readonly inSample: BarSpan | null;
  readonly outOfSample: BarSpan | null;
  /** The IS / OOS split cannot be made, from @pine/optimizer's `splitBars`. */
  readonly error: Text | null;
}

export function dataRange(bars: readonly MarketBar[], validation: ValidationSettings): DataRange {
  const all = span(bars);
  if (validation.mode !== 'in-out') return { all, inSample: null, outOfSample: null, error: null };
  try {
    const split = splitBars(bars, { mode: 'in-out', splitRatio: splitRatio(validation) });
    return {
      all,
      inSample: span(split.inSample),
      outOfSample: span(split.outOfSample),
      error: null,
    };
  } catch (error) {
    return { all, inSample: null, outOfSample: null, error: errorText(error) };
  }
}

/**
 * Expected run time from a measured cost per bar: every combination runs over `bars` bars (the
 * IS and OOS ranges together cover the data once), spread over `threads` Workers.
 */
export function estimateDurationMs(
  perBarMs: number | null,
  bars: number,
  combinations: number,
  threads: number,
): number | null {
  return perBarMs === null || !bars || !combinations
    ? null
    : Math.round((perBarMs * bars * combinations) / Math.max(1, threads));
}

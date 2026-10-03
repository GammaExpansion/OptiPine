import type { InputDescriptor, LiteralValue } from '@pine/engine';
import { CodedError, type MessageValues } from '@pine/messages';
import type { OptimizerMessageId } from './text.ts';
import { trialIdForParameters } from './trial-id.ts';

export interface SearchAxis {
  id: string;
  title: string;
  type: string;
  values: LiteralValue[];
  active: boolean;
  descriptor: InputDescriptor;
}
export interface SearchRange {
  values?: LiteralValue[];
  from?: number;
  to?: number;
  step?: number;
}
export interface SearchSpace {
  axes: SearchAxis[];
  activeAxes: SearchAxis[];
  combinationCount: number;
  /** Inputs disabled for the search retain their explicitly selected value. */
  fixedParameters?: Record<string, LiteralValue>;
}
export interface SearchSpaceOptions {
  active?: Record<string, boolean>;
  ranges?: Record<string, SearchRange>;
  currentValues?: Record<string, LiteralValue>;
  maxValuesPerAxis?: number;
}
/** Raised for an invalid search configuration; `code` names the rule that failed. */
export class SearchSpaceError extends CodedError<OptimizerMessageId> {
  constructor(code: OptimizerMessageId, values: MessageValues = {}) {
    super(code, values);
    this.name = 'SearchSpaceError';
  }
}
const numericTypes = new Set(['int', 'float', 'number', 'price', 'time']);
const integerTypes = new Set(['int', 'time']);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const key = (value: LiteralValue): string => JSON.stringify(value);
const own = (object: object | undefined, name: string): boolean =>
  !!object && Object.prototype.hasOwnProperty.call(object, name);
function lookup<T>(
  values: Record<string, T> | undefined,
  descriptor: InputDescriptor,
): T | undefined {
  return own(values, descriptor.id)
    ? values![descriptor.id]
    : own(values, descriptor.title)
      ? values![descriptor.title]
      : undefined;
}
function validateValue(descriptor: InputDescriptor, value: LiteralValue): void {
  if (numericTypes.has(descriptor.type)) {
    if (!finite(value) || (integerTypes.has(descriptor.type) && !Number.isSafeInteger(value)))
      throw new SearchSpaceError(
        integerTypes.has(descriptor.type) ? 'searchIntegerRequired' : 'searchNumberRequired',
        { title: descriptor.title },
      );
    if (descriptor.min !== undefined && value < descriptor.min)
      throw new SearchSpaceError('searchMin', { title: descriptor.title, min: descriptor.min });
    if (descriptor.max !== undefined && value > descriptor.max)
      throw new SearchSpaceError('searchMax', { title: descriptor.title, max: descriptor.max });
  } else if (
    (descriptor.type === 'bool' || descriptor.type === 'boolean') &&
    typeof value !== 'boolean'
  ) {
    throw new SearchSpaceError('searchBooleanRequired', { title: descriptor.title });
  } else if (value !== null && !['number', 'string', 'boolean'].includes(typeof value)) {
    throw new SearchSpaceError('searchValueInvalid', { title: descriptor.title });
  }
  if (typeof value === 'number' && !finite(value))
    throw new SearchSpaceError('searchValueFinite', { title: descriptor.title });
  if (descriptor.options && !descriptor.options.some((option) => key(option) === key(value)))
    throw new SearchSpaceError('searchValueNotOption', { title: descriptor.title });
}
/** Decimal coordinates avoid both a spurious off-grid endpoint and binary step drift. */
function decimal(value: number): { units: bigint; exponent: number } {
  const [mantissa, power = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return { units: BigInt(whole + fraction), exponent: Number(power) - fraction.length };
}
function numericValues(
  descriptor: InputDescriptor,
  override: SearchRange | undefined,
  limit: number,
): LiteralValue[] {
  const fallback = typeof descriptor.defaultValue === 'number' ? descriptor.defaultValue : 0;
  const from = override?.from ?? descriptor.min ?? fallback;
  const to = override?.to ?? descriptor.max ?? Math.max(from, fallback);
  const step = override?.step ?? descriptor.step ?? (descriptor.type === 'price' ? 0.01 : 1);
  if (!finite(from) || !finite(to) || !finite(step) || step <= 0)
    throw new SearchSpaceError('searchRangeFinite', { title: descriptor.title });
  if (to < from) throw new SearchSpaceError('searchRangeReversed', { title: descriptor.title });
  validateValue(descriptor, from);
  validateValue(descriptor, to);
  if (integerTypes.has(descriptor.type) && !Number.isSafeInteger(step))
    throw new SearchSpaceError('searchIntegerStep', { title: descriptor.title });
  const parts = [from, to, step].map(decimal);
  const exponent = Math.min(...parts.map((part) => part.exponent));
  const [start, end, stride] = parts.map(
    (part) => part.units * 10n ** BigInt(part.exponent - exponent),
  );
  const count = (end - start) / stride + 1n;
  if (count > BigInt(limit))
    throw new SearchSpaceError('searchValueCountLimit', {
      title: descriptor.title,
      count: String(count),
      limit,
    });
  const values = Array.from({ length: Number(count) }, (_, index) =>
    Number(String(start + BigInt(index) * stride) + 'e' + exponent),
  );
  if (new Set(values).size !== values.length)
    throw new SearchSpaceError('searchStepPrecision', { title: descriptor.title });
  return values;
}
export function generateSearchSpace(
  descriptors: readonly InputDescriptor[],
  options: SearchSpaceOptions = {},
): SearchSpace {
  const limit = options.maxValuesPerAxis ?? 100000;
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new SearchSpaceError('searchAxisLimitPositive');
  // Titles are script-chosen keys: collect them in a Map so "__proto__" is an ordinary entry.
  const fixedParameters = new Map<string, LiteralValue>();
  const axes = descriptors.map((descriptor) => {
    const range = lookup(options.ranges, descriptor);
    const configuredActive = lookup(options.active, descriptor) ?? true;
    let values: LiteralValue[];
    if (descriptor.fixed)
      values = descriptor.defaultValue === undefined ? [] : [descriptor.defaultValue];
    else if (!configuredActive) {
      // A disabled axis executes only its current value. Saved search drafts are
      // left intact and validated when the axis is enabled again.
      const current = own(options.currentValues, descriptor.id)
        ? options.currentValues![descriptor.id]
        : own(options.currentValues, descriptor.title)
          ? options.currentValues![descriptor.title]
          : descriptor.defaultValue;
      if (current !== undefined) {
        validateValue(descriptor, current);
        fixedParameters.set(descriptor.title, current);
      }
      return {
        id: descriptor.id,
        title: descriptor.title,
        type: descriptor.type,
        values: current === undefined ? [] : [current],
        active: false,
        descriptor,
      };
    } else if (range?.values !== undefined) {
      if (!range.values.length)
        throw new SearchSpaceError('searchValueRequired', { title: descriptor.title });
      range.values.forEach((value) => validateValue(descriptor, value));
      values = [...new Map(range.values.map((value) => [key(value), value])).values()];
    } else if (descriptor.type === 'source' && descriptor.options?.length)
      values = ['close', 'hl2', 'ohlc4'].filter((value) => descriptor.options!.includes(value));
    else if (descriptor.options?.length) values = [...descriptor.options];
    else if (descriptor.type === 'bool' || descriptor.type === 'boolean') values = [false, true];
    else if (numericTypes.has(descriptor.type)) values = numericValues(descriptor, range, limit);
    else values = descriptor.defaultValue === undefined ? [] : [descriptor.defaultValue];
    if (values.length > limit)
      throw new SearchSpaceError('searchAxisValueLimit', { title: descriptor.title, limit });
    const active = !descriptor.fixed && values.length > 0 && configuredActive;
    if (!descriptor.fixed && !active) {
      const current = own(options.currentValues, descriptor.id)
        ? options.currentValues![descriptor.id]
        : own(options.currentValues, descriptor.title)
          ? options.currentValues![descriptor.title]
          : descriptor.defaultValue;
      if (current !== undefined) {
        validateValue(descriptor, current);
        fixedParameters.set(descriptor.title, current);
      }
    }
    return {
      id: descriptor.id,
      title: descriptor.title,
      type: descriptor.type,
      values,
      active,
      descriptor,
    };
  });
  const activeAxes = axes.filter((axis) => axis.active);
  if (
    new Set(axes.filter((axis) => !axis.descriptor.fixed).map((axis) => axis.title)).size !==
    axes.filter((axis) => !axis.descriptor.fixed).length
  )
    throw new SearchSpaceError('searchUniqueTitles');
  const exactCount = activeAxes.reduce((total, axis) => total * BigInt(axis.values.length), 1n);
  if (exactCount > BigInt(Number.MAX_SAFE_INTEGER))
    throw new SearchSpaceError('searchUnsafeCombinationCount', { count: String(exactCount) });
  return {
    axes,
    activeAxes,
    combinationCount: Number(exactCount),
    fixedParameters: Object.fromEntries(fixedParameters),
  };
}
function parametersAt(space: SearchSpace, index: number): Record<string, LiteralValue> {
  const chosen = new Map<string, LiteralValue>();
  for (let i = space.activeAxes.length - 1; i >= 0; i--) {
    const axis = space.activeAxes[i];
    chosen.set(axis.title, axis.values[index % axis.values.length]);
    index = Math.floor(index / axis.values.length);
  }
  // Preserve the displayed axis order in serialized parameter sets. Object.fromEntries defines
  // own properties, so a title such as "__proto__" stays a plain parameter key.
  return Object.fromEntries([
    ...Object.entries(space.fixedParameters ?? {}),
    ...space.activeAxes.map((axis) => [axis.title, chosen.get(axis.title)!] as const),
  ]);
}
export function enumerateGrid(space: SearchSpace, limit = 100000): Record<string, LiteralValue>[] {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new SearchSpaceError('searchGridLimitPositive');
  if (space.combinationCount > limit)
    throw new SearchSpaceError('searchGridLimit', { count: space.combinationCount, limit });
  return Array.from({ length: space.combinationCount }, (_, index) => parametersAt(space, index));
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function sampleRandom(
  space: SearchSpace,
  count: number,
  seed = 1,
): Record<string, LiteralValue>[] {
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(seed))
    throw new SearchSpaceError('searchRandomIntegers');
  const n = Math.min(count, space.combinationCount),
    random = mulberry32(seed);
  // Floyd sampling chooses exactly N unique indices without rejection loops near saturation.
  const indices = new Set<number>();
  for (let j = space.combinationCount - n; j < space.combinationCount; j++) {
    const random53 = Math.floor(random() * 67108864) * 134217728 + Math.floor(random() * 134217728);
    const candidate = Math.floor((random53 / 9007199254740992) * (j + 1));
    indices.add(indices.has(candidate) ? j : candidate);
  }
  return [...indices].map((index) => parametersAt(space, index));
}
/** Matches the worker's namespaced ParameterSet identity for these flat input values. */
export function stableTrialId(parameters: Record<string, unknown>): string {
  return trialIdForParameters({ inputs: parameters });
}

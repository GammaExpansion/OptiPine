import { compile } from './compiler/index.ts';
import type { Diagnostic } from './types.ts';

export type LiteralValue = number | string | boolean | null;

/** Built-in series an `input.source` may select. */
export const sourceSeries = [
  'open',
  'high',
  'low',
  'close',
  'hl2',
  'hlc3',
  'ohlc4',
  'hlcc4',
] as const;

/**
 * Why an input cannot be overridden by a caller. Values are stable codes for a UI to translate.
 * - `computed-default`: the default is an expression, not a literal.
 * - `computed-title`: the title is not a string literal, so no input key addresses it.
 * - `unsupported-type`: an input kind such as `input.color` or `input.enum`.
 * - `computed-options`: the options list is not made of literals.
 * - `duplicate-title`: another input shares the title, so a keyed override would be ambiguous.
 */
export type InputFixedReason =
  | 'computed-default'
  | 'computed-title'
  | 'unsupported-type'
  | 'computed-options'
  | 'duplicate-title';

export interface InputDescriptor {
  /** `input-<node id>`: unique within one compilation. */
  id: string;
  /** The literal title; `id` stands in when the title is computed. */
  title: string;
  /** True when the title argument is not a string literal; `describe` always sets it. */
  computedTitle?: boolean;
  /** `int`, `float`, `bool`, `string`, `source`, … from `input.<type>` or the plain `input` default. */
  type: string;
  /** Undefined when the default is computed; the engine then keeps its runtime value. */
  defaultValue?: LiteralValue;
  min?: number;
  max?: number;
  step?: number;
  options?: LiteralValue[];
  /** A fixed input keeps the script's own value; `reason` says why. */
  fixed: boolean;
  reason?: InputFixedReason;
  line: number;
  group?: string;
  tooltip?: string;
}

export interface PlotDescriptor {
  title: string;
  line: number;
  /** `plot(strategy.equity)`, which carries the account value as a plot. */
  isEquity: boolean;
}

/** The script's declaration call. */
export type ScriptKind = 'strategy' | 'indicator' | 'library';
const scriptKinds: readonly string[] = ['strategy', 'indicator', 'library'] satisfies ScriptKind[];

export interface ScriptDescription {
  success: boolean;
  /** `strategy()`, `indicator()` or `library()`; absent when the compile failed. */
  kind?: ScriptKind;
  /** The literal `strategy()` title, when one is given. */
  title?: string;
  version?: 5 | 6;
  inputs: InputDescriptor[];
  /** Literal `strategy()` arguments; strategy and currency constants as qualified names. */
  settings: Record<string, LiteralValue>;
  /** `strategy()` arguments given as expressions, by name, with their source line. */
  computedSettings?: Record<string, number>;
  plots: PlotDescriptor[];
  diagnostics: Diagnostic[];
}

const typedInputs = new Set([
  'int',
  'float',
  'bool',
  'string',
  'time',
  'timeframe',
  'session',
  'symbol',
  'price',
  'text_area',
  'source',
]);

type Ast = Record<string, unknown>;
const node = (value: unknown): Ast | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Ast) : undefined;
function qualifiedName(value: unknown): string | undefined {
  const current = node(value);
  if (current?.kind === 'identifier') return String(current.name);
  if (current?.kind !== 'member') return undefined;
  const parent = qualifiedName(current.object);
  return parent ? `${parent}.${String(current.property)}` : undefined;
}
function literal(value: unknown): LiteralValue | undefined {
  const current = node(value);
  if (current?.kind === 'literal') return current.value as LiteralValue;
  // A sign is part of a numeric literal, not evaluation of a computed default.
  if (current?.kind === 'unary' && (current.operator === '-' || current.operator === '+')) {
    const argument = node(current.argument);
    if (argument?.kind === 'literal' && typeof argument.value === 'number')
      return current.operator === '-' ? -argument.value : argument.value;
  }
  return undefined;
}
function literalType(value: unknown): string {
  const current = node(value);
  if (current?.kind === 'unary' && (current.operator === '-' || current.operator === '+'))
    return literalType(current.argument);
  if (current?.kind !== 'literal') return 'unknown';
  // JavaScript represents 1 and 1.0 identically; the checked AST retains Pine's type.
  return typeof current.valueType === 'string'
    ? current.valueType
    : typeof current.value === 'boolean'
      ? 'bool'
      : typeof current.value;
}
function argument(call: Ast, name: string, position?: number): unknown {
  const args = (call.args as Ast[]) ?? [];
  const named = args.find((arg) => arg.name === name);
  return named
    ? named.value
    : position === undefined
      ? undefined
      : args.filter((arg) => arg.name === undefined)[position]?.value;
}
const numericLiteral = (value: unknown): number | undefined =>
  typeof literal(value) === 'number' ? (literal(value) as number) : undefined;
const stringLiteral = (value: unknown): string | undefined =>
  typeof literal(value) === 'string' ? (literal(value) as string) : undefined;

/**
 * Compile a script and read its strategy settings, inputs and plots from the checked AST.
 * Nothing is executed: a computed default is never evaluated or overridden here.
 */
export function describe(source: string): ScriptDescription {
  const compilation = compile(source);
  const description: ScriptDescription = {
    success: compilation.success,
    inputs: [],
    settings: {},
    plots: [],
    diagnostics: compilation.diagnostics,
  };
  if (!compilation.program) return description;
  description.version = compilation.program.version;
  // A successful compile has exactly one declaration, a top-level call.
  for (const statement of compilation.program.body as unknown[]) {
    const call = node(node(statement)?.expression);
    const name = call?.kind === 'call' ? qualifiedName(call.callee) : undefined;
    if (name && scriptKinds.includes(name)) {
      description.kind = name as ScriptKind;
      break;
    }
  }
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const current = node(value);
    if (!current) return;
    if (current.kind === 'call') {
      const name = qualifiedName(current.callee);
      if (name === 'strategy') {
        description.title = stringLiteral(argument(current, 'title', 0)) ?? description.title;
        for (const arg of current.args as Ast[]) {
          if (typeof arg.name !== 'string' || arg.name === 'title' || arg.name === 'shorttitle')
            continue;
          const constant = literal(arg.value);
          // Engine strategy/currency enum constants are represented by qualified strings.
          const symbol = qualifiedName(arg.value);
          if (constant !== undefined) description.settings[arg.name] = constant;
          else if (
            symbol &&
            /^(strategy\.(fixed|cash|percent_of_equity|commission\.(percent|cash_per_contract|cash_per_order))|currency\.[A-Z]+)$/.test(
              symbol,
            )
          )
            description.settings[arg.name] = symbol;
          else (description.computedSettings ??= {})[arg.name] = Number(current.line);
        }
      }
      if (name === 'input' || name?.startsWith('input.')) {
        const defaultArgument = argument(current, 'defval', 0);
        const sourceDefault = name === 'input.source' ? qualifiedName(defaultArgument) : undefined;
        const literalDefault = literal(defaultArgument);
        const defaultValue =
          literalDefault !== undefined
            ? literalDefault
            : sourceDefault && sourceSeries.includes(sourceDefault as (typeof sourceSeries)[number])
              ? sourceDefault
              : undefined;
        const literalTitle = stringLiteral(argument(current, 'title', 1));
        const type = name === 'input' ? literalType(defaultArgument) : name.slice(6);
        const numericCall = name === 'input.int' || name === 'input.float';
        const optionCall = ['input.string', 'input.timeframe', 'input.session'].includes(name);
        const namedOptions = argument(current, 'options');
        // Numeric calls have a range overload and an options overload. The third
        // positional AST argument distinguishes them without inspecting Pine text.
        const optionsOverload =
          numericCall &&
          (namedOptions !== undefined || node(argument(current, 'options', 2))?.kind === 'tuple');
        const optionsArgument = argument(
          current,
          'options',
          optionsOverload || optionCall ? 2 : undefined,
        );
        const optionsNode = node(optionsArgument);
        const options =
          optionsNode?.kind === 'tuple'
            ? (optionsNode.elements as unknown[]).map(literal)
            : undefined;
        const tooltipPosition = numericCall ? (optionsOverload ? 3 : 5) : optionCall ? 3 : 2;
        const groupPosition = type === 'text_area' ? 3 : tooltipPosition + 2;
        const reason: InputFixedReason | undefined =
          defaultValue === undefined
            ? 'computed-default'
            : literalTitle === undefined
              ? 'computed-title'
              : !typedInputs.has(type)
                ? 'unsupported-type'
                : options?.includes(undefined) || (optionsArgument !== undefined && !options)
                  ? 'computed-options'
                  : undefined;
        description.inputs.push({
          id: `input-${current.id}`,
          title: literalTitle ?? `input-${current.id}`,
          computedTitle: literalTitle === undefined,
          type,
          defaultValue,
          min: numericLiteral(
            argument(current, 'minval', numericCall && !optionsOverload ? 2 : undefined),
          ),
          max: numericLiteral(
            argument(current, 'maxval', numericCall && !optionsOverload ? 3 : undefined),
          ),
          step: numericLiteral(
            argument(current, 'step', numericCall && !optionsOverload ? 4 : undefined),
          ),
          options:
            name === 'input.source'
              ? [...sourceSeries]
              : options && !options.includes(undefined)
                ? (options as LiteralValue[])
                : undefined,
          fixed: reason !== undefined,
          reason,
          line: Number(current.line),
          group: stringLiteral(argument(current, 'group', groupPosition)),
          tooltip: stringLiteral(argument(current, 'tooltip', tooltipPosition)),
        });
      }
      if (name === 'plot' || name === 'plotchar' || name === 'plotshape') {
        description.plots.push({
          title: stringLiteral(argument(current, 'title', 1)) ?? 'Plot',
          line: Number(current.line),
          isEquity:
            name === 'plot' && qualifiedName(argument(current, 'series', 0)) === 'strategy.equity',
        });
      }
    }
    Object.values(current).forEach(visit);
  }
  visit(compilation.program);
  for (const input of description.inputs) {
    if (description.inputs.filter((item) => item.title === input.title).length > 1) {
      input.fixed = true;
      input.reason = 'duplicate-title';
    }
  }
  return description;
}

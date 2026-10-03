import { compile } from './compiler/index.ts';
import { execute, executeWithEquity } from './runtime/interpreter.ts';
import type { EquityRunResult, RunInput, RunResult } from './types.ts';

export { compile };
export { sweep } from './optimizer.ts';
export { describe, sourceSeries } from './describe.ts';
export type {
  InputDescriptor,
  InputFixedReason,
  LiteralValue,
  PlotDescriptor,
  ScriptDescription,
} from './describe.ts';
export type { ParameterSet, SweepRun, SweepResult } from './optimizer.ts';
export type { CompileResult, Program } from './compiler/index.ts';
export type {
  Diagnostic,
  MarketBar,
  PlotOutput,
  PlotStyle,
  PlotLineStyle,
  PlotShape,
  PlotLocation,
  PlotSize,
  RunInput,
  RunResult,
  RunWarning,
  EquityRunResult,
  SymbolInfo,
  StrategySettings,
  Trade,
  TradingSession,
  SessionCalendar,
  CalendarPeriod,
} from './types.ts';

/** Compile and execute without retaining mutable state between independent runs. */
export function run(source: string, input: RunInput): RunResult {
  const compiled = compile(source);
  if (!compiled.success || !compiled.program) {
    return { plots: [], trades: [], metrics: {}, diagnostics: compiled.diagnostics, warnings: [] };
  }
  return execute(compiled.program, input);
}

/** Run a strategy with the exact bar-close equity history used by its report. */
export function runWithEquity(source: string, input: RunInput): EquityRunResult {
  const compiled = compile(source);
  if (!compiled.success || !compiled.program) {
    return {
      plots: [],
      trades: [],
      metrics: {},
      diagnostics: compiled.diagnostics,
      warnings: [],
      equity: [],
    };
  }
  return executeWithEquity(compiled.program, input);
}

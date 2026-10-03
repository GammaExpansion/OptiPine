import { compile } from './compiler/index.ts';
import { execute } from './runtime/interpreter.ts';
import type { Diagnostic, RunInput, RunResult } from './types.ts';

/** Each parameter set overrides the common run's input and strategy settings. */
export interface ParameterSet {
  inputs?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface SweepRun {
  parameters: ParameterSet;
  result: RunResult;
}

export interface SweepResult {
  compilation: { success: boolean; diagnostics: Diagnostic[] };
  runs: SweepRun[];
}

/**
 * Evaluate caller-supplied parameter sets in order using one compiled program.
 * Every execution owns fresh runtime and broker state. Runtime failures remain
 * attached to their run and do not prevent the next parameter set from running.
 * Compilation failure produces diagnostics and no runs.
 */
export function sweep(
  source: string,
  common: RunInput,
  parameters: readonly ParameterSet[],
): SweepResult {
  const compiled = compile(source);
  const compilation = { success: compiled.success, diagnostics: compiled.diagnostics };
  if (!compiled.success || !compiled.program) return { compilation, runs: [] };

  const program = compiled.program;
  const runs = parameters.map((parameter): SweepRun => {
    const inputs = { ...common.inputs, ...parameter.inputs };
    const settings = { ...common.settings, ...parameter.settings };
    return {
      parameters: {
        ...(parameter.inputs ? { inputs: { ...parameter.inputs } } : {}),
        ...(parameter.settings ? { settings: { ...parameter.settings } } : {}),
      },
      result: execute(program, { ...common, inputs, settings }),
    };
  });
  return { compilation, runs };
}

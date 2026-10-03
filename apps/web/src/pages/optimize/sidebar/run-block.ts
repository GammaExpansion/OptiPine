import { message, type Message, type Text } from '@pine/messages';
import { disabledReason } from '../../../shell/run-status.ts';
import type { OptimizationState } from '../../../workflows/optimize-session.ts';

type BlockState = Pick<
  OptimizationState,
  'runBlock' | 'readiness' | 'run' | 'results' | 'outdated' | 'validation'
>;

/** The line under the count in the run block before a run (O1, O3, O5, O6, R1, R5). */
export type RunCaption =
  /** Search ranges, the split or the walk-forward settings have errors (O6). */
  | { readonly kind: 'errors'; readonly reason: Message }
  /** The latest run failed: why, from the Workers. */
  | { readonly kind: 'failed'; readonly reason: Text }
  /** Something else keeps Start disabled, such as missing data. */
  | { readonly kind: 'blocked'; readonly reason: Message }
  /** Walk-forward: windows × combinations, and the estimate when there is one (O3). */
  | {
      readonly kind: 'windows';
      /** Null while the windows are being planned. */
      readonly windows: number | null;
      readonly combinations: number;
      readonly estimatedMs: number | null;
    }
  /** The results no longer match the settings (R5). */
  | { readonly kind: 'outdated' }
  | { readonly kind: 'lastRun'; readonly durationMs: number; readonly threads: number }
  /** The estimate is null until a backtest or an optimization of the script measured one. */
  | { readonly kind: 'estimate'; readonly estimatedMs: number | null; readonly threads: number };

export interface RunBlockView {
  /** Combinations, or backtests for walk-forward; null while the ranges have errors. */
  readonly count: number | null;
  readonly unit: 'combos' | 'backtests';
  readonly caption: RunCaption;
  /** Start becomes Re-optimize once there are results. */
  readonly rerun: boolean;
  /** Why Start is disabled; null when it can start. */
  readonly disabled: Message | null;
}

const errorsId = 'optimize.fixErrors';

/** The run block while no run is going: what Start would run, and whether it can (O1, O8). */
export function runBlockView(state: BlockState): RunBlockView {
  const { runBlock, readiness, run, results, outdated, validation } = state;
  const walkForward = validation.mode === 'walk-forward';
  const errors = readiness.reasons.find((reason) => reason.id === errorsId);
  // Walk-forward's own reason is the plan's caption; Start's tooltip still gives it.
  const blocking = readiness.reasons.filter(
    (reason) => reason.id !== errorsId && reason.id !== 'optimize.walkForwardUnavailable',
  );
  let caption: RunCaption;
  if (errors) caption = { kind: 'errors', reason: errors };
  else if (blocking.length)
    caption = { kind: 'blocked', reason: disabledReason({ ok: false, reasons: blocking })! };
  else if (run.status === 'failed')
    caption = {
      kind: 'failed',
      reason:
        run.failure.error ??
        message('optimize.run.compileFailed', { line: run.failure.diagnostics[0]?.line ?? 0 }),
    };
  else if (walkForward)
    caption = {
      kind: 'windows',
      windows: runBlock.windows,
      combinations: runBlock.combinations ?? 0,
      estimatedMs: runBlock.estimatedMs,
    };
  else if (results && outdated?.reasons.length) caption = { kind: 'outdated' };
  else if (results)
    caption = { kind: 'lastRun', durationMs: results.durationMs, threads: results.workers };
  else caption = { kind: 'estimate', estimatedMs: runBlock.estimatedMs, threads: runBlock.threads };
  return {
    count: walkForward ? runBlock.backtests : runBlock.combinations,
    unit: walkForward ? 'backtests' : 'combos',
    caption,
    rerun: runBlock.rerun,
    disabled: disabledReason(readiness),
  };
}

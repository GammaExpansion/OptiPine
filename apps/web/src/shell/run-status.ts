import { message, type Message } from '@pine/messages';
import type { BacktestState, Readiness } from '../workflows/backtest.ts';

/** What the header says about the Backtest page's run, beside its main action (G5 run status). */
export type RunStatus =
  | { readonly kind: 'running'; readonly startedAt: number }
  /** `errors` excludes unsupported features, which are missing engine support (B10). */
  | { readonly kind: 'compileFailed'; readonly errors: number; readonly unsupported: number }
  | { readonly kind: 'runFailed' }
  | { readonly kind: 'outdated' }
  /** `kept`: a previous result is still shown. */
  | { readonly kind: 'cancelled'; readonly kept: boolean }
  | { readonly kind: 'done'; readonly bars: number; readonly durationMs: number }
  /** Nothing has run yet and the run action is disabled for `reason`. */
  | { readonly kind: 'blocked'; readonly reason: Message }
  | { readonly kind: 'ready' };

/**
 * The status of the displayed run: the open preview's while there is one (B16), otherwise the
 * page's own. A compile failure outranks the run, whose result no longer matches the script.
 */
export function runStatus(
  state: Pick<BacktestState, 'compile' | 'run' | 'result' | 'outdated' | 'readiness' | 'preview'>,
): RunStatus {
  const shown = state.preview ?? state;
  const { run, result } = shown;
  if (run.status === 'running') return { kind: 'running', startedAt: run.startedAt };
  if (state.compile.status === 'failed') {
    const unsupported = state.compile.diagnostics.filter(
      (diagnostic) => diagnostic.kind === 'unsupported',
    ).length;
    return {
      kind: 'compileFailed',
      errors: state.compile.diagnostics.length - unsupported,
      unsupported,
    };
  }
  if (run.status === 'failed') return { kind: 'runFailed' };
  if (!state.preview && result && state.outdated?.reasons.length) return { kind: 'outdated' };
  if (run.status === 'cancelled' && run.cause === 'user')
    return { kind: 'cancelled', kept: result !== null };
  if (result)
    return {
      kind: 'done',
      bars: result.computedWith.dataset.input.bars.length,
      durationMs: result.durationMs,
    };
  const reason = disabledReason(shown.readiness);
  return reason ? { kind: 'blocked', reason } : { kind: 'ready' };
}

/**
 * Why Run backtest is disabled: the most fundamental reason, with the empty workspace's two
 * reasons stated together as S1 does. Null when the run can start.
 */
export function disabledReason(readiness: Readiness): Message | null {
  if (readiness.ok) return null;
  const ids = readiness.reasons.map((reason) => reason.id);
  if (ids.includes('backtest.noScript') && ids.includes('backtest.noData'))
    return message('shell.runMissing');
  return readiness.reasons[0];
}

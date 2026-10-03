import { message, type Message } from '@pine/messages';
import type {
  OptimizationPhase,
  OptimizationState,
  RunProgress,
} from '../workflows/optimize-session.ts';

type StatusState = Pick<OptimizationState, 'run' | 'results' | 'outdated'>;

/**
 * How far a run has come (O8): the sets done in the range running, of `combinations`. For
 * walk-forward, the window running and its sets (W4).
 */
export interface ProgressView {
  readonly phase: OptimizationPhase;
  readonly done: number;
  readonly combinations: number;
  /** Of every backtest the run takes, both ranges counted, from 0 to 100; of the window's. */
  readonly percent: number;
  readonly window: RunProgress['window'];
}

export function progressView(progress: RunProgress): ProgressView {
  const { phase, combinations, completed, total, window } = progress;
  const done =
    phase === 'preparing'
      ? 0
      : phase === 'analyzing'
        ? combinations
        : phase === 'out'
          ? completed - combinations
          : completed;
  return {
    phase,
    done: Math.min(combinations, Math.max(0, done)),
    combinations,
    percent:
      phase === 'analyzing'
        ? 100
        : total
          ? Math.min(100, Math.floor((completed / total) * 100))
          : 0,
    window,
  };
}

/** What the header says about the Optimize page's run (R1, O8, R5, G5 run status). */
export type OptimizeStatus =
  | ({ readonly kind: 'running' } & ProgressView)
  /** `kept`: the last complete results are still shown. */
  | { readonly kind: 'failed'; readonly kept: boolean }
  | { readonly kind: 'outdated' }
  | { readonly kind: 'cancelled'; readonly kept: boolean }
  | {
      readonly kind: 'done';
      readonly combinations: number;
      readonly durationMs: number;
      readonly failed: number;
      /** The sets were sampled at random rather than taken from the grid (R4). */
      readonly random: boolean;
      /** Walk-forward: the windows the run took (W1); null otherwise. */
      readonly windows: number | null;
    }
  | { readonly kind: 'idle' };

/**
 * The run in progress first, then a failed run, then results the settings have moved away from,
 * then a cancelled run; otherwise the results' facts.
 */
export function optimizeStatus({ run, results, outdated }: StatusState): OptimizeStatus {
  if (run.status === 'running') return { kind: 'running', ...progressView(run.progress) };
  if (run.status === 'failed') return { kind: 'failed', kept: results !== null };
  if (results && outdated?.reasons.length) return { kind: 'outdated' };
  if (run.status === 'cancelled') return { kind: 'cancelled', kept: results !== null };
  if (!results) return { kind: 'idle' };
  return {
    kind: 'done',
    combinations: results.combinations,
    durationMs: results.durationMs,
    failed: results.failures.length,
    random: results.computedWith.search.sampling?.method === 'random',
    windows: results.windows,
  };
}

/** "6 windows", or "1 window". */
export function windowCount(count: number): Message {
  return count === 1
    ? message('optimize.setup.window')
    : message('optimize.setup.windows', { count });
}

/** A run's length as the header and the run block state it: 2:31, 10:09 or 1:02:05. */
export function clockText(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** An estimate, rounded as far as it deserves: ~40 s, ~10 min, ~2 h 5 min. */
export function estimateText(milliseconds: number): Message {
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  if (seconds < 60) return message('optimize.run.aboutSeconds', { seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return message('optimize.run.aboutMinutes', { minutes });
  return message('optimize.run.aboutHours', {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  });
}

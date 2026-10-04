import { expect, test } from 'vitest';
import { translate } from '../i18n/translate.ts';
import type { OptimizationState, RunProgress } from '../workflows/optimize-session.ts';
import {
  clockText,
  estimateText,
  optimizeStatus,
  progressView,
  windowCount,
} from './optimize-status.ts';

const progress = (change: Partial<RunProgress>): RunProgress => ({
  phase: 'in',
  combinations: 2_214,
  completed: 0,
  total: 4_428,
  failed: 0,
  elapsedMs: 0,
  remainingMs: null,
  workers: 7,
  window: null,
  ...change,
});

test('progress counts the sets of the range running and the share of every backtest (O8)', () => {
  expect(progressView(progress({ phase: 'preparing' }))).toEqual({
    phase: 'preparing',
    done: 0,
    combinations: 2_214,
    percent: 0,
    window: null,
  });
  expect(progressView(progress({ completed: 1_373 }))).toMatchObject({ done: 1_373, percent: 31 });
  expect(progressView(progress({ phase: 'out', completed: 3_587 }))).toMatchObject({
    done: 1_373,
    percent: 81,
  });
  expect(progressView(progress({ phase: 'all', completed: 1_373, total: 2_214 }))).toMatchObject({
    done: 1_373,
    percent: 62,
  });
  expect(progressView(progress({ phase: 'analyzing', completed: 4_428 }))).toMatchObject({
    done: 2_214,
    percent: 100,
  });
});

test('a walk-forward run counts the sets of the window running (W4)', () => {
  const window = { index: 2, count: 6 };
  expect(progressView(progress({ completed: 908, total: 2_214, window }))).toEqual({
    phase: 'in',
    done: 908,
    combinations: 2_214,
    percent: 41,
    window,
  });
});

const results = {
  combinations: 2_214,
  windows: null,
  durationMs: 609_000,
  failures: [{}, {}],
  computedWith: { search: { sampling: { method: 'grid' } } },
} as unknown as NonNullable<OptimizationState['results']>;
const done = { status: 'done', startedAt: 0, finishedAt: 1 } as const;
const state = (change: Partial<Pick<OptimizationState, 'run' | 'results' | 'outdated'>>) => ({
  run: { status: 'idle' } as OptimizationState['run'],
  results: null,
  outdated: null,
  ...change,
});

test('the header puts a run first, then a failure, outdated results, a cancel, then facts', () => {
  expect(optimizeStatus(state({}))).toEqual({ kind: 'idle' });
  expect(
    optimizeStatus(
      state({
        run: { status: 'running', startedAt: 0, progress: progress({ completed: 10 }) },
        results,
        outdated: { reasons: ['ranges'] },
      }),
    ),
  ).toMatchObject({ kind: 'running', done: 10, combinations: 2_214 });
  const failure = { diagnostics: [], error: 'Worker crashed' };
  expect(
    optimizeStatus(
      state({
        run: { ...done, status: 'failed', failure },
        results,
        outdated: { reasons: ['data'] },
      }),
    ),
  ).toEqual({ kind: 'failed', kept: true });
  expect(optimizeStatus(state({ run: done, results, outdated: { reasons: ['ranges'] } }))).toEqual({
    kind: 'outdated',
  });
  expect(optimizeStatus(state({ run: { ...done, status: 'cancelled' } }))).toEqual({
    kind: 'cancelled',
    kept: false,
  });
  expect(optimizeStatus(state({ run: done, results, outdated: { reasons: [] } }))).toEqual({
    kind: 'done',
    combinations: 2_214,
    durationMs: 609_000,
    failed: 2,
    random: false,
    windows: null,
  });
  expect(
    optimizeStatus(state({ run: done, results: { ...results, windows: 6 }, outdated: null })),
  ).toMatchObject({ kind: 'done', windows: 6 });
});

test('durations read as a clock, estimates rounded to what they deserve', () => {
  expect(clockText(151_000)).toBe('2:31');
  expect(clockText(609_400)).toBe('10:09');
  expect(clockText(3_725_000)).toBe('1:02:05');
  expect(clockText(-5)).toBe('0:00');
  expect(translate(estimateText(41_000), 'en')).toBe('~41 s');
  expect(translate(estimateText(600_000), 'en')).toBe('~10 min');
  expect(translate(estimateText(7_500_000), 'en')).toBe('~2 h 5 min');
  expect(translate(estimateText(600_000), 'zh')).toBe('约 10 分钟');
  expect(translate(windowCount(6), 'en')).toBe('6 windows');
  expect(translate(windowCount(1), 'en')).toBe('1 window');
});

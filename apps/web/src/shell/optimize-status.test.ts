import { expect, test } from 'vitest';
import { translate } from '../i18n/translate.ts';
import type { OptimizationState, RunProgress } from '../workflows/optimize-session.ts';
import {
  clockText,
  estimateText,
  optimizeNeedsAttention,
  optimizeStatus,
  progressView,
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
  ...change,
});

test('progress counts the sets of the range running and the share of every backtest (O8)', () => {
  expect(progressView(progress({ phase: 'preparing' }))).toEqual({
    phase: 'preparing',
    done: 0,
    combinations: 2_214,
    percent: 0,
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

const results = {
  combinations: 2_214,
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
  });
});

test('the Optimize switch is marked while a run goes or the results are outdated', () => {
  expect(optimizeNeedsAttention(state({ run: done, results, outdated: { reasons: [] } }))).toBe(
    false,
  );
  expect(
    optimizeNeedsAttention(state({ run: done, results, outdated: { reasons: ['properties'] } })),
  ).toBe(true);
  expect(
    optimizeNeedsAttention(
      state({ run: { status: 'running', startedAt: 0, progress: progress({}) } }),
    ),
  ).toBe(true);
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
});

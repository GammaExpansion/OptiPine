import { message } from '@pine/messages';
import { expect, test } from 'vitest';
import type { OptimizationState } from '../../../workflows/optimize-session.ts';
import { defaultValidation } from '../../../workflows/optimize-setup.ts';
import { runBlockView } from './run-block.ts';

const runBlock = {
  combinations: 2_214,
  backtests: 4_428,
  windows: null,
  estimatedMs: 600_000,
  threads: 7,
  rerun: false,
};
const base = {
  runBlock,
  readiness: { ok: true, reasons: [] },
  run: { status: 'idle' },
  results: null,
  outdated: null,
  validation: defaultValidation,
} as unknown as OptimizationState;
const state = (change: Partial<Record<keyof OptimizationState, unknown>>) =>
  ({ ...base, ...change }) as OptimizationState;
const results = { durationMs: 609_000, workers: 7 } as OptimizationState['results'];
const errors = message('optimize.fixErrors', { count: 2 });

test('before a run the block counts the combinations and estimates the run (O1)', () => {
  expect(runBlockView(base)).toEqual({
    count: 2_214,
    unit: 'combos',
    caption: { kind: 'estimate', estimatedMs: 600_000, threads: 7 },
    rerun: false,
    disabled: null,
  });
});

test('errors outrank everything else and disable Start (O6)', () => {
  const view = runBlockView(
    state({
      runBlock: { ...runBlock, combinations: null, backtests: null },
      readiness: { ok: false, reasons: [message('backtest.noData'), errors] },
      results,
    }),
  );
  expect(view.count).toBeNull();
  expect(view.caption).toEqual({ kind: 'errors', reason: errors });
  expect(view.disabled).toEqual(message('backtest.noData'));
});

test('a missing script and data read as one reason, as on the Backtest page', () => {
  const view = runBlockView(
    state({
      readiness: { ok: false, reasons: [message('backtest.noScript'), message('backtest.noData')] },
    }),
  );
  expect(view.caption).toEqual({ kind: 'blocked', reason: message('shell.runMissing') });
});

test('after a run: the last run, then outdated results; a failed run says why', () => {
  const after = { runBlock: { ...runBlock, rerun: true }, results };
  expect(runBlockView(state({ ...after, outdated: { reasons: [] } }))).toMatchObject({
    caption: { kind: 'lastRun', durationMs: 609_000, threads: 7 },
    rerun: true,
  });
  expect(runBlockView(state({ ...after, outdated: { reasons: ['ranges'] } })).caption).toEqual({
    kind: 'outdated',
  });
  const failed = (failure: object) =>
    runBlockView(state({ run: { status: 'failed', startedAt: 0, finishedAt: 1, failure } }))
      .caption;
  expect(failed({ diagnostics: [], error: 'Worker crashed' })).toEqual({
    kind: 'failed',
    reason: 'Worker crashed',
  });
  expect(failed({ diagnostics: [{ line: 12 }], error: null })).toEqual({
    kind: 'failed',
    reason: message('optimize.run.compileFailed', { line: 12 }),
  });
});

test('walk-forward counts backtests over the planned windows, and Start says why it waits (O3)', () => {
  const wait = message('optimize.walkForwardUnavailable');
  const view = runBlockView(
    state({
      validation: { ...defaultValidation, mode: 'walk-forward' },
      runBlock: { ...runBlock, windows: 6, backtests: 13_284, estimatedMs: 1_740_000 },
      readiness: { ok: false, reasons: [wait] },
    }),
  );
  expect(view).toMatchObject({
    count: 13_284,
    unit: 'backtests',
    caption: { kind: 'windows', windows: 6, combinations: 2_214, estimatedMs: 1_740_000 },
    disabled: wait,
  });
});

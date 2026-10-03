import { message } from '@pine/messages';
import { expect, test } from 'vitest';
import type { BacktestResult, BacktestState, RunState } from '../workflows/backtest.ts';
import { disabledReason, runStatus } from './run-status.ts';

const ready = { ok: true, reasons: [] };
const result = {
  computedWith: { dataset: { revision: 1, input: { bars: new Array(20_488) } } },
  durationMs: 1_900,
} as unknown as BacktestResult;
const base = {
  compile: { status: 'compiled' },
  run: { status: 'idle' },
  result: null,
  outdated: null,
  readiness: ready,
  preview: null,
} as unknown as BacktestState;
const state = (change: Partial<Record<keyof BacktestState, unknown>>) =>
  ({ ...base, ...change }) as BacktestState;

test('a run in progress outranks everything, then a failed compile, then a failed run', () => {
  const running: RunState = { status: 'running', startedAt: 5 };
  expect(runStatus(state({ run: running, result }))).toEqual({ kind: 'running', startedAt: 5 });
  const compile = {
    status: 'failed',
    error: null,
    diagnostics: [
      { kind: 'undeclared', line: 15, message: 'a' },
      { kind: 'undeclared', line: 16, message: 'b' },
      { kind: 'unsupported', line: 19, message: 'c' },
    ],
  };
  const failedRun = {
    status: 'failed',
    startedAt: 1,
    finishedAt: 2,
    failure: { diagnostics: [], bar: null, error: null },
  };
  expect(runStatus(state({ compile, run: failedRun }))).toEqual({
    kind: 'compileFailed',
    errors: 2,
    unsupported: 1,
  });
  expect(runStatus(state({ run: failedRun, result }))).toEqual({ kind: 'runFailed' });
});

test('a result reports its facts until settings change or a run is cancelled', () => {
  expect(runStatus(state({ result, run: { status: 'done' } }))).toEqual({
    kind: 'done',
    bars: 20_488,
    durationMs: 1_900,
  });
  const outdated = { reasons: ['inputs'], inputs: [] };
  expect(runStatus(state({ result, outdated }))).toEqual({ kind: 'outdated' });
  const cancelled = { status: 'cancelled', startedAt: 1, finishedAt: 2, cause: 'user' };
  expect(runStatus(state({ result, run: cancelled }))).toEqual({ kind: 'cancelled', kept: true });
  expect(runStatus(state({ run: cancelled }))).toEqual({ kind: 'cancelled', kept: false });
  // Editing the script discards a run; the result is then simply outdated or current.
  expect(runStatus(state({ result, run: { ...cancelled, cause: 'source' } }))).toMatchObject({
    kind: 'done',
  });
});

test('the open preview supplies the run, result and readiness', () => {
  const preview = {
    run: { status: 'done', startedAt: 1, finishedAt: 2 },
    result,
    readiness: ready,
  };
  const outdated = { reasons: ['inputs'], inputs: [] };
  expect(runStatus(state({ preview, outdated }))).toMatchObject({ kind: 'done' });
});

test('without a result, the run action explains why it is disabled', () => {
  const noScript = message('backtest.noScript');
  const noData = message('backtest.noData');
  expect(disabledReason({ ok: false, reasons: [noScript, noData] })).toEqual(
    message('shell.runMissing'),
  );
  expect(disabledReason({ ok: false, reasons: [noData] })).toBe(noData);
  expect(disabledReason(ready)).toBeNull();
  expect(runStatus(state({ readiness: { ok: false, reasons: [noData] } }))).toEqual({
    kind: 'blocked',
    reason: noData,
  });
  expect(runStatus(base)).toEqual({ kind: 'ready' });
});

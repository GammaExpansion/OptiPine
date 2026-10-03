import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkValues, comparePlots, compareTrades, unavailable } from './compare.ts';
import type { Check } from './compare.ts';
import type { Trade } from '@pine/engine';
import { acceptBaseline, regressions } from './baseline.ts';
import { summarize } from './run.ts';
import type { CaseResult, SuiteResult } from './run.ts';

function caseResult(checks: Check[], overrides: Partial<CaseResult> = {}): CaseResult {
  return {
    key: 'indicator/v6/probe',
    kind: 'indicator',
    version: 6,
    verified: true,
    fingerprint: 'fixture-v1',
    status: checks.every((c) => c.status === 'match') ? 'match' : 'mismatch',
    checks,
    diagnostics: [],
    warnings: [],
    settingsProvenance: {},
    marketProvenance: {},
    milliseconds: 0,
    ...overrides,
  };
}

function suite(cases: CaseResult[], overrides: Partial<SuiteResult> = {}): SuiteResult {
  return {
    schemaVersion: 1,
    comparisonFingerprint: 'rules-v1',
    generatedAt: '',
    fullRun: true,
    cases,
    summary: summarize(cases),
    ...overrides,
  };
}

test('regression gate preserves scores and individual cells independently', () => {
  const before = suite([
    caseResult([checkValues('a', 'series', [1, 2], [1, 9]), checkValues('b', 'series', [1], [1])]),
  ]);
  const after = suite([
    caseResult([checkValues('a', 'series', [1, 2], [9, 2]), checkValues('b', 'series', [1], [9])]),
  ]);
  const failures = regressions(before, after);
  assert.ok(failures.some((f) => f.includes('a: previously matching assertion')));
  assert.ok(failures.some((f) => f.includes('b: score decreased')));
});

test('measurement acceptance resets only changed observations, retaining unrelated gates', () => {
  const original = caseResult([
    checkValues('a', 'series', [1], [1]),
    checkValues('b', 'series', [2], [2]),
  ]);
  const changed = caseResult(
    [checkValues('a', 'series', [9], [1]), checkValues('b', 'series', [2], [3])],
    { fingerprint: 'fixture-v2' },
  );
  const before = suite([original]),
    after = suite([changed], { comparisonFingerprint: 'rules-v2' });
  assert.ok(regressions(before, after).some((f) => f.includes('explicit measurement')));
  const failures = regressions(before, after, true);
  assert.ok(!failures.some((f) => f.includes(' a:')));
  assert.ok(failures.some((f) => f.includes(' b: score decreased')));
  changed.checks[1] = original.checks[1];
  assert.deepEqual(
    regressions(before, suite([changed], { comparisonFingerprint: 'rules-v2' }), true),
    [],
  );
});

test('measurement updates cannot remove cases, verified status, checks or execution support', () => {
  const before = suite([caseResult([checkValues('a', 'series', [1], [1])])]);
  assert.match(regressions(before, suite([]), true).join('\n'), /tracked fixture not run/);
  assert.match(
    regressions(
      before,
      suite([caseResult(before.cases[0].checks, { verified: false })]),
      true,
    ).join('\n'),
    /verified fixture removed/,
  );
  assert.match(
    regressions(before, suite([caseResult([])]), true).join('\n'),
    /tracked check missing/,
  );
  assert.match(
    regressions(
      before,
      suite([caseResult([unavailable('a', 'series', 1, 'unsupported', 'missing')])]),
      true,
    ).join('\n'),
    /previously executable/,
  );
});

test('extra erroneous rows cannot hide behind an unchanged matching prefix', () => {
  const prior = {
    ...checkValues('trades/rows', 'trades', [true, true], [true, true]),
    matchingPrefix: 2,
  };
  const next = {
    ...checkValues('trades/rows', 'trades', [true, true], [true, true, false]),
    matchingPrefix: 2,
  };
  assert.match(
    regressions(suite([caseResult([prior])]), suite([caseResult([next])])).join('\n'),
    /score decreased/,
  );
});

test('removing extra plot columns is progress while adding extra columns is a regression', () => {
  for (const expected of [[], [{ title: 'value', values: [1, 2] }]]) {
    const extra = { title: 'unexpected', values: [9, 10] };
    const baseline = suite([caseResult(comparePlots(expected, [...expected, extra]))]);
    const fixed = suite([caseResult(comparePlots(expected, expected))]);
    assert.deepEqual(regressions(baseline, fixed), []);
    const worse = suite([caseResult(comparePlots(expected, [...expected, extra, extra]))]);
    assert.match(regressions(baseline, worse).join('\n'), /plots\/count: score decreased/);
    assert.deepEqual(
      baseline.cases[0].checks.map((check) => check.id),
      fixed.cases[0].checks.map((check) => check.id),
    );
    assert.deepEqual(
      baseline.cases[0].checks.map((check) => check.measurementFingerprint),
      worse.cases[0].checks.map((check) => check.measurementFingerprint),
    );
  }
});

test('verified crashes fail the gate even without previously supported execution', () => {
  const compile = checkValues('compile', 'compilation', [true], [true]);
  const plot = checkValues('plot/0/value', 'series', [1], []);
  const failed = (status: 'unsupported' | 'crash') =>
    caseResult(
      [compile, { ...plot, ...unavailable(plot.id, plot.tier, plot.total, status, 'unavailable') }],
      { status },
    );
  const baseline = suite([failed('unsupported')]);
  assert.match(regressions(baseline, suite([failed('crash')])).join('\n'), /verified case crashed/);
  const newCase = { ...failed('crash'), key: 'indicator/v6/new' };
  assert.match(
    regressions(baseline, suite([failed('unsupported'), newCase])).join('\n'),
    /indicator\/v6\/new: verified case crashed/,
  );
  assert.deepEqual(
    regressions(baseline, suite([failed('unsupported'), { ...newCase, verified: false }])),
    [],
  );
});

test('extra trades can be removed from an empty report without losing tracked checks', () => {
  const trade: Trade = {
    direction: 'long',
    entryId: 'entry',
    exitId: 'exit',
    entryComment: '',
    exitComment: '',
    quantity: 1,
    entryBar: 0,
    exitBar: 1,
    entryTime: 100,
    exitTime: 200,
    entryPrice: 10,
    exitPrice: 11,
    profit: 1,
    commission: 0,
    entryCommission: 0,
    maxRunup: 1,
    maxDrawdown: 0,
  };
  const settings = { currency: 'USD', pointvalue: 1, initialCapital: 100 };
  const before = suite([caseResult(compareTrades([], [trade], settings))]);
  const fixed = suite([caseResult(compareTrades([], [], settings))]);
  assert.deepEqual(regressions(before, fixed), []);
  assert.deepEqual(
    before.cases[0].checks.map((check) => check.id),
    fixed.cases[0].checks.map((check) => check.id),
  );
  const worse = suite([caseResult(compareTrades([], [trade, trade], settings))]);
  assert.match(regressions(before, worse).join('\n'), /trades\/count: score decreased/);
});

test('acceptance requires full run, explanation and preserved baseline, without overwriting on failure', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'pine-baseline-'));
  const path = join(folder, 'baseline.json');
  try {
    const before = suite([caseResult([checkValues('a', 'series', [1], [1])])]);
    await assert.rejects(
      acceptBaseline(path, { ...before, fullRun: false }, 'partial'),
      /unfiltered/,
    );
    await assert.rejects(acceptBaseline(path, before, ''), /reason/);
    await acceptBaseline(path, before, 'Initial observed support');
    const saved = await readFile(path, 'utf8');
    const after = suite([caseResult([checkValues('a', 'series', [1], [2])])]);
    await assert.rejects(
      acceptBaseline(path, after, 'An unrelated improvement', true),
      /regression/,
    );
    assert.equal(await readFile(path, 'utf8'), saved);
    await assert.rejects(
      acceptBaseline(path, suite([caseResult([], { status: 'crash' })]), 'crash'),
      /crashes/,
    );
  } finally {
    await rm(folder, { recursive: true });
  }
});

test('accepted baselines omit timing fields so unchanged results re-accept without a diff', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pine-baseline-'));
  try {
    const path = join(directory, 'golden-baseline.json');
    const checks = () => [checkValues('a', 'series', [1], [1])];
    await acceptBaseline(
      path,
      suite([caseResult(checks(), { milliseconds: 12 })], { generatedAt: '2026-01-01T00:00:00Z' }),
      'first',
    );
    const written = await readFile(path, 'utf8');
    const parsed = JSON.parse(written);
    assert.equal(parsed.reason, 'first');
    assert.equal('generatedAt' in parsed, false);
    assert.equal('acceptedAt' in parsed, false);
    assert.equal('milliseconds' in parsed.cases[0], false);
    await acceptBaseline(
      path,
      suite([caseResult(checks(), { milliseconds: 99 })], { generatedAt: '2026-02-02T00:00:00Z' }),
      'first',
    );
    assert.equal(await readFile(path, 'utf8'), written);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

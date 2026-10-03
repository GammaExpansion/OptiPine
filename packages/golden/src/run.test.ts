import test from 'node:test';
import assert from 'node:assert/strict';
import { runFixture, selected, summarize } from './run.ts';
import type { CaseResult, Engine } from './run.ts';
import type { Fixture } from './load.ts';

test('execution failures retain expected checks and denominators without matching empty output', () => {
  const fixture: Fixture = {
    key: 'indicator/v6/probe',
    path: '',
    fingerprint: 'fixture',
    source: 'source',
    meta: { schema_version: 2, id: 'probe', kind: 'indicator', pine_version: 6, verified: true },
    input: {
      bars: [{ time: 100, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      syminfo: {},
      timeframe: '1',
    },
    plots: [{ title: 'x', values: [1, null] }],
    warnings: [],
    settingsProvenance: {},
    marketProvenance: {},
  };
  const engine: Engine = {
    compile: () => ({ success: true, diagnostics: [] }),
    run: () => ({
      plots: [],
      trades: [],
      metrics: {},
      diagnostics: [{ kind: 'unsupported', line: 2, message: 'pending' }],
    }),
  };
  const result = runFixture(fixture, engine);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.checks.find((c) => c.id === 'plot/0/x')?.total, 2);
  assert.equal(result.checks.find((c) => c.id === 'plot/0/x')?.matched, 0);
  assert.equal(result.checks.find((c) => c.id === 'compile')?.status, 'match');
  assert.ok(result.checks.every((c) => c.measurementFingerprint));
});

test('selection escapes regex syntax and unverified cases remain visible outside the gate', () => {
  assert.equal(selected('indicator/v6/a.b', { case: 'a.b' }), true);
  assert.equal(selected('indicator/v6/axb', { case: 'a.b' }), false);
  assert.equal(selected('indicator/v6/a.b', { case: 'a*', version: 5 }), false);
  const matched: CaseResult = {
    key: 'indicator/v6/probe',
    kind: 'indicator',
    version: 6,
    verified: true,
    fingerprint: 'fixture-v1',
    status: 'match',
    checks: [],
    diagnostics: [],
    warnings: [],
    settingsProvenance: {},
    marketProvenance: {},
    milliseconds: 0,
  };
  const result = summarize([{ ...matched, verified: false, status: 'crash' }, matched]);
  assert.equal(result.cases, 2);
  assert.equal(result.unverified, 1);
  assert.equal(result.statuses.crash, 0);
});

test('nonfatal engine warnings stay visible without invalidating golden comparisons', () => {
  const fixture: Fixture = {
    key: 'indicator/v6/warnings',
    path: '',
    fingerprint: 'fixture',
    source: 'source',
    meta: { schema_version: 2, id: 'warnings', kind: 'indicator', pine_version: 6, verified: true },
    input: {
      bars: [{ time: 100, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      syminfo: {},
      timeframe: '1',
    },
    plots: [{ title: 'x', values: [1] }],
    warnings: ['Fixture metadata warning'],
    settingsProvenance: {},
    marketProvenance: {},
  };
  const result = runFixture(fixture, {
    compile: () => ({ success: true, diagnostics: [] }),
    run: () => ({
      plots: fixture.plots,
      trades: [],
      metrics: {},
      diagnostics: [],
      warnings: [
        { code: 'ignored-effect', line: 3, function: 'label.new', message: 'Drawing omitted' },
      ],
    }),
  });
  assert.equal(result.status, 'match');
  assert.ok(result.checks.every((check) => check.status === 'match'));
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.warnings, ['Fixture metadata warning', 'L3 label.new: Drawing omitted']);
  assert.deepEqual(fixture.warnings, ['Fixture metadata warning']);
});

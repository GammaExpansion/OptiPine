import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runWithEquity as runStrategy } from '@pine/engine';
import { parseBars, raises } from '../test/fixtures.ts';
import { leaderboard, optimizeParameters, splitBars, viewTrials } from './validation.ts';

const directory = new URL(
  '../../golden/fixtures/strategy/v6/B_orders_strings__none/',
  import.meta.url,
);
const source = await readFile(new URL('source.pine', directory), 'utf8');
const bars = parseBars(await readFile(new URL('data.csv', directory), 'utf8')).slice(0, 960);
const meta = JSON.parse(await readFile(new URL('meta.json', directory), 'utf8'));
const parameters = [0.05, 0.3, 0.5].map((value) => ({ 'stop / limit distance %': value }));
const evaluate = (inputs: Record<string, unknown>, selected: typeof bars) =>
  runStrategy(source, { bars: selected, inputs, syminfo: meta.syminfo, timeframe: meta.timeframe });

test('sample split runs every real parameter on disjoint actual bar partitions', () => {
  const split = splitBars(bars, { mode: 'in-out', splitRatio: 0.6 });
  assert.equal(split.inSample.length, 576);
  assert.equal(split.outOfSample.length, 384);
  assert.ok(split.inSample.at(-1)!.time < split.outOfSample[0].time);
  const summary = optimizeParameters(parameters, bars, (p, b) => evaluate(p, [...b]), {
    validation: { mode: 'in-out', splitRatio: 0.6 },
    objective: { name: 'Net profit' },
  });
  assert.equal(summary.trials.length, 3);
  for (const trial of summary.trials) {
    assert.ok(trial.valid);
    assert.deepEqual(
      trial.inSampleMetrics,
      evaluate(trial.parameters, [...split.inSample]).metrics,
    );
    assert.deepEqual(
      trial.outOfSampleMetrics,
      evaluate(trial.parameters, [...split.outOfSample]).metrics,
    );
  }
  assert.throws(
    () => splitBars(bars, { mode: 'in-out', splitRatio: 1 }),
    raises('splitRatioRange'),
  );
  assert.throws(() => splitBars(bars.slice(0, 1), { mode: 'in-out' }), raises('splitNeedsBars'));
});

test('objectives and constraints reorder real metrics without mutating or reevaluating results', () => {
  let calls = 0;
  const summary = optimizeParameters(
    parameters,
    bars,
    (p, b) => {
      calls++;
      return evaluate(p, [...b]);
    },
    { validation: { mode: 'none' }, objective: { name: 'Net profit' } },
  );
  const original = structuredClone(summary.trials);
  const rows = viewTrials(summary.trials, 'Performance/Gross profit/All USD', [
    { metric: 'Performance/Net profit/All USD', operator: '>=', value: 0 },
  ]);
  const ranked = leaderboard(rows);
  assert.ok(ranked.length);
  for (const trial of ranked)
    assert.ok(Number(trial.inSampleMetrics!['Performance/Net profit/All USD']) >= 0);
  assert.deepEqual(
    ranked.map((t) => t.objectiveValue),
    ranked.map((t) => t.objectiveValue).sort((a, b) => b! - a!),
  );
  assert.equal(calls, 3);
  assert.deepEqual(summary.trials, original);
  const tie = rows[0];
  assert.deepEqual(
    leaderboard([
      { ...tie, valid: true, excluded: false, trialId: 'z' },
      { ...tie, valid: true, excluded: false, trialId: 'a' },
    ]).map((t) => t.trialId),
    ['a', 'z'],
  );
});

test('real unsupported and runtime diagnostics exclude trials from the leaderboard', () => {
  for (const pine of [
    '//@version=6\nstrategy("Unsupported")\nplot(request.security("AAPL","D",close))',
    '//@version=6\nstrategy("Runtime")\na=array.new_int(0)\narray.get(a,0)',
  ]) {
    const summary = optimizeParameters(
      [{}],
      bars,
      () => runStrategy(pine, { bars, syminfo: meta.syminfo, timeframe: meta.timeframe }),
      { validation: { mode: 'none' }, objective: { name: 'Net profit' } },
    );
    assert.equal(summary.trials[0].valid, false);
    assert.ok(summary.trials[0].inSampleDiagnostics!.length);
    assert.deepEqual(leaderboard(summary.trials), []);
  }
});

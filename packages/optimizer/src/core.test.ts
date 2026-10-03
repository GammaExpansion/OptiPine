import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSearchSpace, enumerateGrid, sampleRandom, stableTrialId } from './search-space.ts';
import { splitBars, optimizeParameters, leaderboard } from './validation.ts';
import { heatmap, sensitivity } from './analysis.ts';
import type { InputDescriptor } from '@pine/engine';

const descriptors: InputDescriptor[] = [
  {
    id: 'input-1',
    title: 'Length',
    type: 'int',
    defaultValue: 2,
    min: 1,
    max: 3,
    step: 1,
    fixed: false,
    line: 1,
  },
  {
    id: 'input-2',
    title: 'Mode',
    type: 'string',
    options: ['A', 'B'],
    defaultValue: 'A',
    fixed: false,
    line: 2,
  },
  { id: 'input-3', title: 'Fixed', type: 'int', defaultValue: 9, fixed: true, line: 3 },
];
test('search space derives numeric and option axes', () => {
  const s = generateSearchSpace(descriptors);
  assert.equal(s.combinationCount, 6);
  assert.equal(enumerateGrid(s).length, 6);
  assert.deepEqual(enumerateGrid(s)[0], { Length: 1, Mode: 'A' });
  assert.equal(sampleRandom(s, 3, 7).length, 3);
  assert.equal(stableTrialId({ b: 2, a: 1 }), stableTrialId({ a: 1, b: 2 }));
});
test('split and optimize none/in-out', () => {
  const bars = Array.from({ length: 10 }, (_, i) => ({
    time: i,
    open: 1,
    high: 1,
    low: 1,
    close: i,
    volume: 1,
  }));
  assert.equal(splitBars(bars, { mode: 'in-out', splitRatio: 0.6 }).inSample.length, 6);
  const evaluate = (p: any, _b: any, part: any) =>
    ({
      plots: [],
      trades: [],
      diagnostics: [],
      metrics: { 'Performance/Net profit/All': Number(p.Length) + (part === 'out' ? 1 : 0) },
    }) as any;
  const out = optimizeParameters([{ Length: 1 }, { Length: 2 }], bars, evaluate, {
    validation: { mode: 'in-out' },
    objective: { name: 'Net profit' },
  });
  assert.equal(out.trials.length, 2);
  assert.equal(leaderboard(out.trials)[0].parameters.Length, 2);
  assert.equal(out.trials[0].outOfSampleValue, 2);
});
test('analysis aggregates objective values by parameter', () => {
  const ts: any = [1, 2, 3].map((x) => ({
    parameters: { X: x },
    objectiveValue: x,
    valid: true,
    excluded: false,
  }));
  assert.equal(heatmap(ts, 'X').cells.length, 3);
  assert.equal(sensitivity(ts, 'X')[2].mean, 3);
});

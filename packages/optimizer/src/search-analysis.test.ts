import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  describe,
  runWithEquity as runStrategy,
  sweep as sweepStrategy,
  type RunInput,
} from '@pine/engine';
import { parseBars, raises } from '../test/fixtures.ts';
import { metricValue } from './metrics.ts';
import {
  generateSearchSpace,
  enumerateGrid,
  sampleRandom,
  stableTrialId,
  SearchSpaceError,
} from './search-space.ts';
import {
  heatmap,
  sensitivity,
  buildSensitivitySummary,
  defaultHeatmapAxes,
  neighborhoodValues,
  stabilityBands,
  type Slice,
} from './analysis.ts';
import type { TrialRecord } from './validation.ts';
import { trialIdForParameters } from './trial-id.ts';

const directory = new URL(
  '../../golden/fixtures/strategy/v6/B_orders_strings__none/',
  import.meta.url,
);
const [source, csv, metaText] = await Promise.all([
  readFile(new URL('source.pine', directory), 'utf8'),
  readFile(new URL('data.csv', directory), 'utf8'),
  readFile(new URL('meta.json', directory), 'utf8'),
]);
const meta = JSON.parse(metaText),
  bars = parseBars(csv);
const common: RunInput = {
  bars: bars.slice(0, 480),
  syminfo: meta.syminfo,
  timeframe: meta.timeframe,
};
const distance = 'stop / limit distance %';
const description = describe(source);
assert.equal(description.success, true, JSON.stringify(description.diagnostics));
const distanceDescriptor = description.inputs.find((input) => input.title === distance)!;
const inputValues = [0.05, 0.3, 0.5];
const baseSpace = generateSearchSpace(description.inputs, {
  ranges: { [distance]: { values: inputValues } },
});
function evaluate(
  parameters: Record<string, unknown>[],
  code = source,
  input = common,
): TrialRecord[] {
  const output = sweepStrategy(
    code,
    input,
    parameters.map((inputs) => ({ inputs })),
  );
  assert.equal(output.compilation.success, true, JSON.stringify(output.compilation.diagnostics));
  return output.runs.map((run) => {
    assert.deepEqual(run.result.diagnostics, []);
    const objectiveValue = metricValue(run.result.metrics, 'Net profit');
    return {
      trialId: stableTrialId(run.parameters.inputs!),
      parameters: run.parameters.inputs!,
      result: run.result,
      objectiveValue,
      inSampleValue: objectiveValue,
      outOfSampleValue: null,
      valid: true,
      excluded: false,
    };
  });
}
const baseTrials = evaluate(enumerateGrid(baseSpace));
const derivative = source
  .replace(
    'float pct =',
    'enabled=input.bool(true,"Enabled")\nside=input.string("Both","Side",options=["Both","Long","Short"])\nsize=input.int(1,"Size",minval=1,maxval=2)\nfloat pct =',
  )
  .replace('if phase == 0', 'if phase == 0 and enabled and side != "Short"')
  .replace('if phase == 12', 'if phase == 12 and enabled and side != "Long"')
  .replace(
    'strategy.entry(idLongEntry, strategy.long)',
    'strategy.entry(idLongEntry, strategy.long, qty=size)',
  )
  .replace(
    'strategy.entry(idShortEntry, strategy.short)',
    'strategy.entry(idShortEntry, strategy.short, qty=size)',
  );
const derivativeDescription = describe(derivative);
assert.equal(
  derivativeDescription.success,
  true,
  JSON.stringify(derivativeDescription.diagnostics),
);
const space = generateSearchSpace(derivativeDescription.inputs, {
  ranges: { [distance]: { values: inputValues } },
});
const trials = evaluate(enumerateGrid(space), derivative);
const score = (trial: TrialRecord) => trial.objectiveValue!;
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const near = (actual: number | null | undefined, expected: number, tolerance = 1e-10) => {
  assert.ok(actual !== null && actual !== undefined);
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + ' differs from ' + expected);
};

test('real B_orders nested input sweep changes metrics and has stable reproducible trial IDs', () => {
  assert.deepEqual(
    baseTrials.map((trial) => trial.parameters[distance]),
    inputValues,
  );
  near(baseTrials[0].objectiveValue, -0.12);
  near(baseTrials[1].objectiveValue, 0.17);
  near(baseTrials[2].objectiveValue, 0.06);
  assert.equal(new Set(baseTrials.map((trial) => trial.trialId)).size, 3);
  for (const trial of baseTrials)
    assert.equal(trial.trialId, trialIdForParameters({ inputs: trial.parameters }));
  for (const trial of baseTrials)
    assert.deepEqual(
      runStrategy(source, { ...common, inputs: trial.parameters }).metrics,
      trial.result!.metrics,
    );
  assert.equal(
    stableTrialId({ inputs: { z: true, a: 0.3 }, settings: { b: 2, a: 1 } }),
    stableTrialId({ settings: { a: 1, b: 2 }, inputs: { a: 0.3, z: true } }),
  );
});

test('decimal numeric ranges stay on grid, validate bounds and reject truncation', () => {
  const ranged = generateSearchSpace([distanceDescriptor], {
    ranges: { [distance]: { from: 0.05, to: 0.3, step: 0.1 } },
  });
  assert.deepEqual(ranged.activeAxes[0].values, [0.05, 0.15, 0.25]);
  assert.equal(ranged.combinationCount, 3);
  const exact = generateSearchSpace([distanceDescriptor], {
    ranges: { [distance]: { from: 0.05, to: 0.3, step: 0.05 } },
  });
  assert.deepEqual(exact.activeAxes[0].values, [0.05, 0.1, 0.15, 0.2, 0.25, 0.3]);
  for (const range of [
    { from: 0.3, to: 0.05, step: 0.05 },
    { from: 0.05, to: 0.3, step: 0 },
    { from: 0.05, to: 0.3, step: -0.1 },
    { from: NaN, to: 0.3 },
    { from: 0.01, to: 0.3 },
  ]) {
    assert.throws(
      () => generateSearchSpace([distanceDescriptor], { ranges: { [distance]: range } }),
      SearchSpaceError,
    );
  }
  assert.throws(
    () =>
      generateSearchSpace([distanceDescriptor], {
        ranges: { [distance]: { from: 0.05, to: 1, step: 0.000001 } },
      }),
    raises('searchValueCountLimit'),
  );
  assert.throws(
    () => enumerateGrid(baseSpace, 2),
    raises('searchGridLimit', { count: 3, limit: 2 }),
  );
  const integers = derivativeDescription.inputs.filter((input) => input.title === 'Size');
  assert.throws(
    () => generateSearchSpace(integers, { ranges: { Size: { from: 1, to: 2, step: 0.5 } } }),
    raises('searchIntegerStep'),
  );
  assert.throws(
    () =>
      generateSearchSpace(derivativeDescription.inputs, {
        ranges: { Side: { values: ['Invalid'] } },
      }),
    raises('searchValueNotOption', { title: 'Side' }),
  );
});

test('inactive parameters keep current values and random search returns exactly unique seeded N', () => {
  const fixed = generateSearchSpace(derivativeDescription.inputs, {
    active: { Enabled: false, Side: false, Size: false },
    currentValues: { Enabled: false, Side: 'Long', Size: 2 },
    ranges: { [distance]: { values: inputValues } },
  });
  assert.equal(fixed.combinationCount, 3);
  const parameters = enumerateGrid(fixed);
  assert.ok(
    parameters.every(
      (input) => input.Enabled === false && input.Side === 'Long' && input.Size === 2,
    ),
  );
  assert.ok(evaluate(parameters, derivative).every((trial) => trial.objectiveValue === 0));
  for (const count of [
    0,
    1,
    space.combinationCount - 1,
    space.combinationCount,
    space.combinationCount + 1,
  ]) {
    const sampled = sampleRandom(space, count, 918);
    assert.equal(sampled.length, Math.min(count, space.combinationCount));
    assert.equal(new Set(sampled.map(stableTrialId)).size, sampled.length);
    assert.deepEqual(sampled, sampleRandom(space, count, 918));
  }
  assert.notDeepEqual(sampleRandom(space, 10, 7), sampleRandom(space, 10, 8));
  assert.throws(() => sampleRandom(space, -1), SearchSpaceError);
  assert.throws(() => sampleRandom(space, 1.5), SearchSpaceError);
});

test('disabled golden input ignores invalid search drafts and reproduces its current engine result', () => {
  const expected = runStrategy(source, { ...common, inputs: { [distance]: 0.5 } });
  assert.deepEqual(expected.diagnostics, []);
  const ranges = [
    { from: 0.3, to: 0.05, step: 0.05 },
    { from: 0.05, to: 0.3, step: 0 },
    { from: NaN, to: 0.3 },
    { from: 0.01, to: 0.3 },
    { from: 0.05, to: 1, step: 0.000001 },
    { values: [] },
    { values: [NaN] },
  ];
  for (const range of ranges) {
    const draft = structuredClone(range);
    const options = {
      active: { [distance]: false },
      currentValues: { [distance]: 0.5 },
      ranges: { [distance]: range },
    };
    const fixed = generateSearchSpace(description.inputs, options);
    assert.equal(fixed.combinationCount, 1);
    assert.deepEqual(fixed.activeAxes, []);
    assert.deepEqual(fixed.axes[0].values, [0.5]);
    const parameters = enumerateGrid(fixed);
    assert.deepEqual(parameters, [{ [distance]: 0.5 }]);
    assert.deepEqual(sampleRandom(fixed, 10, 24), parameters);
    const result = runStrategy(source, { ...common, inputs: parameters[0] });
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.metrics, expected.metrics);
    assert.equal(
      stableTrialId(parameters[0]),
      trialIdForParameters({ inputs: { [distance]: 0.5 } }),
    );
    assert.deepEqual(range, draft, 'saved ranges survive disabling unchanged');
    assert.throws(
      () => generateSearchSpace(description.inputs, { ...options, active: { [distance]: true } }),
      SearchSpaceError,
    );
  }
  const savedRange = { from: 0.05, to: 0.3, step: 0.1 };
  const disabled = generateSearchSpace(description.inputs, {
    active: { [distance]: false },
    ranges: { [distance]: savedRange },
  });
  assert.deepEqual(disabled.fixedParameters, { [distance]: distanceDescriptor.defaultValue });
  const restored = generateSearchSpace(description.inputs, {
    active: { [distance]: true },
    ranges: { [distance]: savedRange },
  });
  assert.deepEqual(restored.activeAxes[0].values, [0.05, 0.15, 0.25]);
});

test('disabled compiled boolean, option and integer axes ignore empty or invalid search lists', () => {
  const options = {
    active: { Enabled: false, Side: false, Size: false },
    currentValues: { Enabled: false, Side: 'Long', Size: 2 },
    ranges: {
      Enabled: { values: [] },
      Side: { values: ['Invalid'] },
      Size: { from: 2, to: 1, step: 0 },
      [distance]: { values: inputValues },
    },
  };
  const fixed = generateSearchSpace(derivativeDescription.inputs, options);
  assert.equal(fixed.combinationCount, 3);
  assert.deepEqual(fixed.fixedParameters, { Enabled: false, Side: 'Long', Size: 2 });
  const parameters = enumerateGrid(fixed);
  assert.ok(
    parameters.every(
      (input) => input.Enabled === false && input.Side === 'Long' && input.Size === 2,
    ),
  );
  const actual = evaluate(parameters, derivative);
  for (const trial of actual) {
    const expected = runStrategy(derivative, {
      ...common,
      inputs: { ...options.currentValues, [distance]: trial.parameters[distance] },
    });
    assert.deepEqual(trial.result!.metrics, expected.metrics);
    assert.equal(trial.objectiveValue, 0);
  }
  for (const name of ['Enabled', 'Side', 'Size'])
    assert.throws(
      () =>
        generateSearchSpace(derivativeDescription.inputs, {
          ...options,
          active: { ...options.active, [name]: true },
        }),
      SearchSpaceError,
    );
});

test('disabled inputs still validate current values and honor ID, title and default precedence', () => {
  const side = derivativeDescription.inputs.find((input) => input.title === 'Side')!;
  const fixed = generateSearchSpace([side], {
    active: { [side.id]: false, Side: true },
    ranges: { Side: { values: [] } },
    currentValues: { [side.id]: 'Short', Side: 'Long' },
  });
  assert.deepEqual(enumerateGrid(fixed), [{ Side: 'Short' }]);
  assert.deepEqual(enumerateGrid(generateSearchSpace([side], { active: { Side: false } })), [
    { Side: 'Both' },
  ]);
  for (const [title, value] of [
    ['Side', 'Invalid'],
    ['Enabled', 'false'],
    ['Size', 2.5],
    ['Size', 3],
    [distance, NaN],
    [distance, 0.01],
  ] as const) {
    const descriptor = derivativeDescription.inputs.find((input) => input.title === title)!;
    assert.throws(
      () =>
        generateSearchSpace([descriptor], {
          active: { [title]: false },
          ranges: { [title]: { values: [] } },
          currentValues: { [title]: value },
        }),
      SearchSpaceError,
    );
  }
  const expression = describe(
    '//@version=6\nstrategy("Fixed expression")\nx=input.int(2*3,"Computed")\nplot(x,"value")',
  );
  assert.equal(expression.success, true);
  const expressionSpace = generateSearchSpace(expression.inputs, {
    active: { Computed: false },
    currentValues: { Computed: 99 },
    ranges: { Computed: { values: [] } },
  });
  assert.deepEqual(enumerateGrid(expressionSpace), [{}]);
  const result = runStrategy(
    '//@version=6\nstrategy("Fixed expression")\nx=input.int(2*3,"Computed")\nplot(x,"value")',
    { ...common, inputs: enumerateGrid(expressionSpace)[0] },
  );
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.plots[0].values[0], 6);
});

test('combination counting uses exact arithmetic and rejects an unsafe integer product', () => {
  const largeSource =
    '//@version=6\nstrategy("Large count")\n' +
    Array.from(
      { length: 8 },
      (_, index) => 'p' + index + '=input.int(1,"P' + index + '",minval=1,maxval=100)',
    ).join('\n');
  const largeDescription = describe(largeSource);
  assert.equal(largeDescription.success, true, JSON.stringify(largeDescription.diagnostics));
  const safe = generateSearchSpace(largeDescription.inputs.slice(0, 7));
  assert.equal(safe.combinationCount, 100000000000000);
  assert.throws(
    () => generateSearchSpace(largeDescription.inputs),
    raises('searchUnsafeCombinationCount', { count: '10000000000000000' }),
  );
  assert.equal(sampleRandom(safe, 5, 24).length, 5);
});

test('real numeric, boolean and option axes support fixed, maximum, mean and pinned slices', () => {
  const axes = space.activeAxes;
  assert.equal(trials.length, 36);
  const fixed = heatmap(trials, distance, 'Enabled', {
    axes,
    slices: { Side: { mode: 'fixed', value: 'Long' }, Size: { mode: 'fixed', value: 2 } },
  });
  for (const cell of fixed.cells)
    near(
      cell.value,
      score(
        trials.find(
          (trial) =>
            trial.parameters[distance] === cell.x &&
            trial.parameters.Enabled === cell.y &&
            trial.parameters.Side === 'Long' &&
            trial.parameters.Size === 2,
        )!,
      ),
    );
  // The max slice takes the best value: the smallest when the objective is minimized (R4).
  for (const [mode, direction] of [
    ['max', 'maximize'],
    ['max', 'minimize'],
    ['mean', 'maximize'],
  ] as const) {
    const surface = heatmap(trials, distance, 'Enabled', {
      axes,
      direction,
      slices: { Side: { mode }, Size: { mode: 'fixed', value: 1 } },
    });
    for (const cell of surface.cells) {
      const expected = trials
        .filter(
          (trial) =>
            trial.parameters[distance] === cell.x &&
            trial.parameters.Enabled === cell.y &&
            trial.parameters.Size === 1,
        )
        .map(score);
      near(
        cell.value,
        mode === 'mean'
          ? average(expected)
          : direction === 'minimize'
            ? Math.min(...expected)
            : Math.max(...expected),
      );
    }
  }
  const pinned = heatmap(trials, distance, 'Enabled', {
    axes,
    slices: {
      Side: { mode: 'mean', pinned: true, value: 'Long' },
      Size: { mode: 'fixed', value: 2 },
    },
  });
  assert.deepEqual(pinned.cells, fixed.cells);
  const layers = heatmap(trials, distance, 'Enabled', {
    axes,
    zKey: 'Side',
    slices: { Size: { mode: 'fixed', value: 1 } },
  });
  assert.equal(layers.layers!.length, 3);
  assert.equal(layers.cells.length, 18);
  for (const cell of layers.cells)
    near(
      cell.value,
      score(
        trials.find(
          (trial) =>
            trial.parameters[distance] === cell.x &&
            trial.parameters.Enabled === cell.y &&
            trial.parameters.Side === cell.z &&
            trial.parameters.Size === 1,
        )!,
      ),
    );
  assert.throws(
    () => heatmap(trials, distance, 'Enabled', { axes, zKey: distance }),
    raises('heatmapAxesDistinct'),
  );
  const missing = heatmap(
    trials.filter(
      (trial) =>
        !(
          trial.parameters[distance] === 0.3 &&
          trial.parameters.Enabled === true &&
          trial.parameters.Side === 'Long'
        ),
    ),
    distance,
    'Enabled',
    { axes, slices: { Side: { mode: 'fixed', value: 'Long' }, Size: { mode: 'fixed', value: 1 } } },
  );
  assert.equal(missing.cells.find((cell) => cell.x === 0.3 && cell.y === true)!.value, null);
});

test('mixed slice reductions use declared dimension order and never include pinned-out trials', () => {
  const slices: Record<string, Slice> = { Side: { mode: 'max' }, Size: { mode: 'mean' } };
  const result = heatmap(trials, distance, 'Enabled', { axes: space.activeAxes, slices });
  for (const cell of result.cells) {
    const bySide = ['Both', 'Long', 'Short'].map((side) =>
      average(
        trials
          .filter(
            (trial) =>
              trial.parameters[distance] === cell.x &&
              trial.parameters.Enabled === cell.y &&
              trial.parameters.Side === side,
          )
          .map(score),
      ),
    );
    near(cell.value, Math.max(...bySide));
  }
});

test('neighbourhood averages include +/-1 neighbours along every active value list', () => {
  const smoothed = neighborhoodValues(trials, space.activeAxes);
  for (const trial of trials) {
    const neighbours = trials.filter((other) =>
      space.activeAxes.every(
        (axis) =>
          Math.abs(
            axis.values.indexOf(other.parameters[axis.title] as never) -
              axis.values.indexOf(trial.parameters[axis.title] as never),
          ) <= 1,
      ),
    );
    near(smoothed.get(trial), average(neighbours.map(score)));
  }
  const raw = heatmap(trials, distance, 'Enabled', {
    axes: space.activeAxes,
    zKey: 'Side',
    slices: { Size: { mode: 'fixed', value: 1 } },
  });
  const averaged = heatmap(trials, distance, 'Enabled', {
    axes: space.activeAxes,
    zKey: 'Side',
    neighborhood: true,
    slices: { Size: { mode: 'fixed', value: 1 } },
  });
  assert.notDeepEqual(
    averaged.cells.map((cell) => cell.value),
    raw.cells.map((cell) => cell.value),
  );
  const sparse = trials
    .filter((trial) => trial.parameters.Enabled === true && trial.parameters.Side === 'Long')
    .slice(1);
  const sparseValues = neighborhoodValues(sparse, space.activeAxes);
  assert.ok([...sparseValues.values()].every((value) => value !== null && Number.isFinite(value)));
});

test('sensitivity mean, quartiles and eta squared are calculated from real trial scores on one scale', () => {
  const expectedContributions = new Map<string, number>();
  for (const parameter of [distance, 'Enabled', 'Side', 'Size']) {
    const points = sensitivity(trials, parameter, { axes: space.activeAxes });
    const overall = average(trials.map(score));
    const totalVariance = trials.reduce((sum, trial) => sum + (score(trial) - overall) ** 2, 0);
    let explained = 0;
    for (const point of points) {
      const scores = trials
        .filter((trial) => trial.parameters[parameter] === point.value)
        .map(score)
        .sort((a, b) => a - b);
      near(point.mean, average(scores));
      assert.equal(point.count, scores.length);
      const expectedQuartile = (p: number) => {
        const index = (scores.length - 1) * p,
          start = Math.floor(index);
        return scores[start] + (scores[Math.ceil(index)] - scores[start]) * (index - start);
      };
      near(point.q1, expectedQuartile(0.25));
      near(point.q3, expectedQuartile(0.75));
      explained += scores.length * (average(scores) - overall) ** 2;
    }
    const contribution = explained / totalVariance;
    expectedContributions.set(parameter, contribution);
    near(points[0].etaSquared, contribution);
  }
  const summary = buildSensitivitySummary(
    trials,
    space.activeAxes.map((axis) => axis.title),
    { axes: space.activeAxes },
  );
  const values = summary.parameters.flatMap((strip) =>
    strip.points.flatMap((point) => [point.mean!, point.q1!, point.q3!]),
  );
  assert.deepEqual(summary.sharedScale, [Math.min(...values), Math.max(...values)]);
  const expectedOrder = space.activeAxes
    .map((axis, index) => ({
      parameter: axis.title,
      index,
      contribution: expectedContributions.get(axis.title)!,
    }))
    .sort((a, b) => b.contribution - a.contribution || a.index - b.index);
  assert.notDeepEqual(
    expectedOrder.map((item) => item.parameter),
    space.activeAxes.map((axis) => axis.title),
    'this real fixture distinguishes variance order from input declaration order',
  );
  const ordered = summary.parameters.toSorted((a, b) => b.etaSquared - a.etaSquared);
  assert.deepEqual(
    ordered.map((strip) => strip.parameter),
    expectedOrder.map((item) => item.parameter),
  );
  ordered.forEach((strip, index) => near(strip.etaSquared, expectedOrder[index].contribution));
  assert.deepEqual(
    defaultHeatmapAxes(trials, space.activeAxes),
    expectedOrder.slice(0, 2).map((item) => item.parameter),
  );
  assert.deepEqual(
    defaultHeatmapAxes(trials, space.activeAxes.toReversed()),
    expectedOrder.slice(0, 2).map((item) => item.parameter),
    'different positive contributions determine default axes even after input order changes',
  );
  const flat = trials.filter((trial) => trial.parameters.Enabled === false);
  assert.ok(flat.length && flat.every((trial) => trial.objectiveValue === 0));
  assert.deepEqual(
    defaultHeatmapAxes(flat, space.activeAxes.toReversed()),
    space.activeAxes
      .toReversed()
      .slice(0, 2)
      .map((axis) => axis.title),
    'a real flat surface uses declared axis order to resolve equal zero contributions',
  );
});

test('stability re-tunes other parameters, uses tolerance and selects the smallest real average shortfall', () => {
  const windows = [common, { ...common, bars: bars.slice(480, 960) }].map((input) => {
    const trials = evaluate(enumerateGrid(space), derivative, input);
    const best = trials.slice().sort((a, b) => score(b) - score(a))[0];
    return { trials, chosenParameters: best.parameters };
  });
  const strips = stabilityBands(windows, [distance, 'Enabled', 'Side'], 0.1, 'maximize', {
    axes: space.activeAxes,
  });
  for (const strip of strips) {
    const expectedBands = windows.map((window) => {
      const best = Math.max(...window.trials.map(score));
      const domain = space.activeAxes.find((axis) => axis.title === strip.parameter)!.values;
      return domain.filter(
        (value) =>
          Math.max(
            ...window.trials
              .filter((trial) => trial.parameters[strip.parameter] === value)
              .map(score),
          ) >=
          best - Math.abs(best) * 0.1,
      );
    });
    assert.deepEqual(
      strip.bands.map((band) => band.values),
      expectedBands,
    );
    assert.deepEqual(
      strip.intersection,
      expectedBands[0].filter((value) => expectedBands[1].includes(value)) as never,
    );
    const candidates = space.activeAxes
      .find((axis) => axis.title === strip.parameter)!
      .values.map((value) => ({
        value,
        shortfall: average(
          windows.map((window) => {
            const best = Math.max(...window.trials.map(score));
            return (
              (best -
                Math.max(
                  ...window.trials
                    .filter((trial) => trial.parameters[strip.parameter] === value)
                    .map(score),
                )) /
              Math.abs(best)
            );
          }),
        ),
      }))
      .sort((a, b) => a.shortfall - b.shortfall);
    assert.equal(strip.fixedValue, candidates[0].value);
    near(strip.averageShortfall, candidates[0].shortfall);
  }
  const narrow = stabilityBands(windows, [distance], 0, 'maximize', { axes: space.activeAxes })[0];
  const wide = stabilityBands(windows, [distance], 1, 'maximize', { axes: space.activeAxes })[0];
  assert.ok(narrow.bands.every((band, i) => band.values.length <= wide.bands[i].values.length));
});

test('stability missing values cannot earn zero shortfall and zero-best plateaux stay defined', () => {
  const enabledLong = trials.filter(
    (trial) =>
      trial.parameters.Enabled === true &&
      trial.parameters.Side === 'Long' &&
      trial.parameters.Size === 1,
  );
  const missingWindows = [
    { trials: enabledLong.filter((trial) => trial.parameters[distance] !== 0.5) },
    { trials: enabledLong.filter((trial) => trial.parameters[distance] !== 0.3) },
  ];
  const strip = stabilityBands(missingWindows, [distance], 0.1, 'maximize', {
    axes: space.activeAxes,
  })[0];
  assert.equal(strip.fixedValue, 0.05);
  assert.ok(strip.bands[0].scores!.find((profile) => profile.value === 0.5)!.shortfall === null);
  const zeroTrials = trials.filter((trial) => trial.parameters.Enabled === false);
  assert.ok(zeroTrials.every((trial) => trial.objectiveValue === 0));
  const plateau = stabilityBands(
    [{ trials: zeroTrials }, { trials: zeroTrials }],
    [distance],
    0.1,
    'maximize',
    { axes: space.activeAxes },
  )[0];
  assert.equal(plateau.allNearOptimal, true);
  assert.deepEqual(plateau.intersection, inputValues);
  assert.deepEqual(plateau.commonRanges, [{ from: 0.05, to: 0.5 }]);
  assert.equal(plateau.averageShortfall, 0);
  const zeroBest = trials.filter((trial) => trial.parameters.Side === 'Short');
  const cliff = stabilityBands([{ trials: zeroBest }], ['Enabled'], 0.1, 'maximize', {
    axes: space.activeAxes,
  })[0];
  assert.equal(cliff.bands[0].best, 0);
  assert.deepEqual(cliff.intersection, [false]);
  assert.deepEqual(cliff.commonRanges, [{ from: false, to: false }]);
  assert.equal(cliff.fixedValue, false);
  const minimum = stabilityBands([{ trials }], ['Enabled'], 0.1, 'minimize', {
    axes: space.activeAxes,
  })[0];
  assert.deepEqual(minimum.bands[0].values, [true]);
  assert.throws(
    () => stabilityBands([{ trials }], [distance], NaN),
    raises('stabilityToleranceFinite'),
  );
});

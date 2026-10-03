import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describe, run, sourceSeries } from '@pine/engine';
import { raises } from '../test/fixtures.ts';
import { generateSearchSpace, enumerateGrid } from './search-space.ts';

const pine = `//@version=6
strategy("Source choices")
src = input.source(close, "Source")
enabled = input.bool(true, "Enabled")
plot(src)`;
const description = describe(pine);
const input = {
  bars: [{ time: 1704067200, open: 100, high: 110, low: 90, close: 106, volume: 100 }],
  syminfo: { mintick: 1, timezone: 'Etc/UTC' },
  timeframe: 'D',
};

test('checked AST exposes eight source series and the engine evaluates each source override', () => {
  assert.equal(description.success, true);
  assert.equal(description.inputs[0].fixed, false);
  assert.equal(description.inputs[0].defaultValue, 'close');
  assert.deepEqual(description.inputs[0].options, sourceSeries);
  const expected = [100, 110, 90, 106, 100, 102, 101.5, 103];
  sourceSeries.forEach((source, index) => {
    const result = run(pine, { ...input, inputs: { Source: source } });
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.plots[0].values, [expected[index]]);
  });
  const expression = describe(pine.replace('input.source(close,', 'input.source(hl2 + close,'));
  assert.equal(
    expression.inputs[0].fixed,
    true,
    'arbitrary source expressions remain engine-owned',
  );
});

test('default source search is three choices; a single selected value and disabled false preserve execution inputs', () => {
  const initial = generateSearchSpace(description.inputs);
  assert.deepEqual(initial.axes[0].values, ['close', 'hl2', 'ohlc4']);
  assert.equal(initial.combinationCount, 6);
  const single = generateSearchSpace(description.inputs, {
    ranges: { Source: { values: ['high'] }, Enabled: { values: [false] } },
  });
  assert.equal(single.combinationCount, 1);
  assert.deepEqual(enumerateGrid(single), [{ Source: 'high', Enabled: false }]);
  const fixed = generateSearchSpace(description.inputs, {
    active: { Source: false, Enabled: false },
    currentValues: { Source: 'low', Enabled: false },
  });
  assert.deepEqual(enumerateGrid(fixed), [{ Source: 'low', Enabled: false }]);
  assert.throws(
    () => generateSearchSpace(description.inputs, { ranges: { Source: { values: [] } } }),
    raises('searchValueRequired', { title: 'Source' }),
  );
  assert.throws(
    () => generateSearchSpace(description.inputs, { ranges: { Source: { values: ['volume'] } } }),
    raises('searchValueNotOption', { title: 'Source' }),
  );
});

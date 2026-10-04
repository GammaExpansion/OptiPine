import assert from 'node:assert/strict';
import test from 'node:test';
import { describe } from '@pine/engine';
import { message } from '@pine/messages';
import { parameterText, searchedParameters } from './optimize-parameters.ts';
import { searchSetup, type SearchRow } from './optimize-setup.ts';

const rows = searchSetup(
  describe(`//@version=6
strategy("Precision")
trail = input.float(3, "Trail %", step=0.1)
length = input.int(18, "Length", minval=18, maxval=20)
mult = input.float(1.5, "Multiplier", minval=1, maxval=2, step=0.25)
source = input.source(close, "Source")
stop = input.bool(false, "Stop")
`).inputs,
  new Map(),
  {},
  { method: 'grid', count: 2000, seed: 42 },
).rows;
const multiplier = rows[2];

test('values use search-step precision, then input-step precision, preserving offsets', () => {
  assert.equal(parameterText(1.5, multiplier), '1.50');
  assert.equal(parameterText(2, multiplier), '2.00');
  assert.equal(parameterText(18, rows[1]), '18');
  const searchStep: SearchRow = {
    ...multiplier,
    draft: { searched: true, values: { kind: 'range', from: 1, to: 2, step: 0.1 } },
  };
  assert.equal(parameterText(1.5, searchStep), '1.5');
  assert.equal(parameterText(1.5, { ...searchStep, status: 'fixed' }), '1.50');
  assert.equal(parameterText(1.125, multiplier), '1.125');
  assert.equal(parameterText(0.001), '0.001');
  assert.equal(parameterText(1000), '1000');
  assert.equal(parameterText(-0, multiplier), '0.00');
  assert.equal(parameterText(-1.5, multiplier), '-1.50');
  assert.equal(
    parameterText(0.000001, {
      ...multiplier,
      draft: { searched: true, values: { kind: 'range', from: 0, to: 0.00001, step: 2.5e-7 } },
    }),
    '0.00000100',
  );
});

test('booleans and missing values are messages; script values stay untranslated', () => {
  assert.deepEqual(parameterText(false), message('inputs.off'));
  assert.deepEqual(parameterText(true), message('inputs.on'));
  for (const value of [null, undefined, NaN, Infinity])
    assert.deepEqual(parameterText(value), message('common.unavailable'));
  assert.equal(parameterText('close'), 'close');
});

test('summaries follow searched declarations while leaving the full set intact', () => {
  const parameters = Object.freeze({
    'Trail %': 3,
    Stop: false,
    Source: 'close',
    Multiplier: 2,
    Length: 20,
  });
  assert.deepEqual(searchedParameters(parameters, rows), [
    { title: 'Length', value: 20 },
    { title: 'Multiplier', value: 2 },
    { title: 'Source', value: 'close' },
    { title: 'Stop', value: false },
  ]);
  assert.deepEqual(searchedParameters({ Length: 20 }, rows), [{ title: 'Length', value: 20 }]);
  assert.equal(parameters['Trail %'], 3);
  assert.deepEqual(
    searchedParameters(
      parameters,
      rows.map((row) => ({ ...row, status: 'fixed' })),
    ),
    [],
  );
});

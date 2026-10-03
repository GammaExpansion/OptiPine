import assert from 'node:assert/strict';
import test from 'node:test';
import { describe, type InputDescriptor } from '@pine/engine';
import {
  applyInputValues,
  inputFields,
  inputValues,
  resetInputValues,
  setInputValue,
  stepInputValue,
  validateInputValue,
  type ParameterOrigin,
} from './inputs.ts';
import { workflowMessage } from './messages.ts';

const inputs = describe(`//@version=6
strategy("Inputs")
a = input.int(20, "Length", minval=5, maxval=200)
b = input.float(2.0, "Multiplier", minval=0.25, step=0.25)
c = input.source(close, "Source")
d = input.bool(false, "Use trailing stop")
e = input.string("Both", "Direction", options=["Both", "Long", "Short"])
f = input.session("0930-1600", "Trade window")
g = input.timeframe("D", "Higher timeframe")
h = input.time(timestamp("2023-01-01"), "Start date")
i = input.int(math.max(2, 14), "ATR length")
j = input.color(#ff0000, "Colour")
k = input.int(1, "Twice")
l = input.int(2, "Twice")
m = input.float(1.5, "Trail %")
n = input.price(100.0, "Level")
`).inputs;
const byTitle = (title: string, index = 0): InputDescriptor =>
  inputs.filter((input) => input.title === title)[index];

test('each kind of input is validated as the engine will read it (B14)', () => {
  const check = (title: string, value: unknown) =>
    validateInputValue(byTitle(title), value as never);
  assert.equal(check('Length', 20), null);
  assert.deepEqual(
    check('Length', 2.5),
    workflowMessage('backtest.inputIntegerRequired', { title: 'Length' }),
  );
  assert.deepEqual(
    check('Length', Number.NaN),
    workflowMessage('backtest.inputIntegerRequired', { title: 'Length' }),
  );
  assert.deepEqual(
    check('Length', 4),
    workflowMessage('backtest.inputBelowMin', { title: 'Length', min: 5 }),
  );
  assert.deepEqual(
    check('Length', 201),
    workflowMessage('backtest.inputAboveMax', { title: 'Length', max: 200 }),
  );
  assert.deepEqual(
    check('Multiplier', 0),
    workflowMessage('backtest.inputBelowMin', { title: 'Multiplier', min: 0.25 }),
  );
  assert.deepEqual(
    check('Multiplier', '2'),
    workflowMessage('backtest.inputNumberRequired', { title: 'Multiplier' }),
  );
  // The step only drives the stepper; TradingView accepts values between steps.
  assert.equal(check('Multiplier', 2.1), null);
  assert.equal(check('Source', 'hlc3'), null);
  assert.deepEqual(
    check('Source', 'volume'),
    workflowMessage('backtest.inputNotOption', { title: 'Source' }),
  );
  assert.deepEqual(
    check('Use trailing stop', 'yes'),
    workflowMessage('backtest.inputBooleanRequired', { title: 'Use trailing stop' }),
  );
  assert.deepEqual(
    check('Direction', 'Up'),
    workflowMessage('backtest.inputNotOption', { title: 'Direction' }),
  );
  assert.deepEqual(
    check('Direction', 3),
    workflowMessage('backtest.inputTextRequired', { title: 'Direction' }),
  );
  for (const session of ['0000-2400', '0930-1200,1300-1600:23456', '24x7'])
    assert.equal(check('Trade window', session), null);
  for (const session of ['9:30-16:00', '0960-1600', '0930-1600:8'])
    assert.deepEqual(
      check('Trade window', session),
      workflowMessage('backtest.inputSessionInvalid', { title: 'Trade window' }),
    );
  for (const timeframe of ['', '60', '1D', 'W', '15S'])
    assert.equal(check('Higher timeframe', timeframe), null);
  assert.deepEqual(
    check('Higher timeframe', 'daily'),
    workflowMessage('backtest.inputTimeframeInvalid', { title: 'Higher timeframe' }),
  );
  assert.equal(check('Start date', 1672531200000), null);
  assert.deepEqual(
    check('Start date', 1.5),
    workflowMessage('backtest.inputIntegerRequired', { title: 'Start date' }),
  );
  assert.equal(check('Level', 99.5), null);
});

test('inputs the script fixes are read-only with the reason', () => {
  const fields = inputFields(inputs);
  const reason = (title: string, index = 0) =>
    fields.filter((item) => item.descriptor.title === title)[index].readOnly;
  assert.equal(reason('Length'), null);
  assert.deepEqual(reason('ATR length'), workflowMessage('backtest.inputFixedComputedDefault'));
  assert.deepEqual(
    reason('Colour'),
    workflowMessage('backtest.inputFixedUnsupportedType', { type: 'color' }),
  );
  assert.deepEqual(reason('Twice', 1), workflowMessage('backtest.inputFixedDuplicateTitle'));
  const computedTitle = inputFields(
    describe('//@version=6\nstrategy("T")\nname = "A" + "B"\nx = input.int(1, name)').inputs,
  )[0];
  assert.deepEqual(computedTitle.readOnly, workflowMessage('backtest.inputFixedComputedTitle'));
  const computedOptions = inputFields(
    describe(
      '//@version=6\nstrategy("T")\nx = input.string("a", "Pick", options=["a", str.lower("B")])',
    ).inputs,
  )[0];
  assert.deepEqual(computedOptions.readOnly, workflowMessage('backtest.inputFixedComputedOptions'));

  const edited = setInputValue(fields, 'ATR length', 3);
  assert.equal(edited.find((item) => item.descriptor.title === 'ATR length')!.value, undefined);
  const values = inputValues(edited);
  assert.equal(Object.hasOwn(values, 'ATR length'), false);
  assert.equal(Object.hasOwn(values, 'Twice'), false);
  assert.equal(Object.hasOwn(values, 'Colour'), false);
  assert.equal(values.Length, 20);
});

test('changed inputs show their default; reset restores every default', () => {
  let fields = inputFields(inputs);
  fields = setInputValue(fields, 'Length', 28);
  fields = setInputValue(fields, 'Multiplier', 0);
  const length = fields.find((item) => item.descriptor.title === 'Length')!;
  assert.equal(length.changed, true);
  assert.equal(length.descriptor.defaultValue, 20);
  assert.equal(fields.filter((item) => item.changed).length, 2);
  assert.notEqual(fields.find((item) => item.descriptor.title === 'Multiplier')!.error, null);
  fields = resetInputValues(fields);
  assert.equal(fields.filter((item) => item.changed || item.error).length, 0);
});

test('a recompile keeps values by title and type only', () => {
  const before = setInputValue(setInputValue(inputFields(inputs), 'Length', 30), 'Trail %', 2.5);
  const next = describe(`//@version=6
strategy("Inputs")
a = input.int(20, "Length", minval=5, maxval=25)
m = input.int(3, "Trail %")
z = input.bool(true, "New")
`).inputs;
  const fields = inputFields(next, before);
  assert.deepEqual(
    fields.map((item) => [item.descriptor.title, item.value, item.error]),
    [
      ['Length', 30, workflowMessage('backtest.inputAboveMax', { title: 'Length', max: 25 })],
      ['Trail %', 3, null],
      ['New', true, null],
    ],
  );
});

test('a title such as __proto__ is an ordinary override key', () => {
  const values = inputValues(
    inputFields(describe('//@version=6\nstrategy("T")\nx = input.int(1, "__proto__")').inputs),
  );
  assert.equal(Object.hasOwn(values, '__proto__'), true);
  assert.equal(values['__proto__'], 1);
});

test('the stepper moves by the declared step within the range, without drift', () => {
  assert.equal(stepInputValue(byTitle('Multiplier'), 2, 1), 2.25);
  assert.equal(stepInputValue(byTitle('Multiplier'), 0.25, -1), 0.25);
  assert.equal(stepInputValue(byTitle('Length'), 200, 1), 200);
  assert.equal(stepInputValue(byTitle('Length'), 20, -1), 19);
  assert.equal(stepInputValue(byTitle('Trail %'), 1.5, 1), 2.5);
  assert.equal(stepInputValue(byTitle('Level'), 0.1, 1), 0.11);
  let value = 0;
  const tenth = { ...byTitle('Trail %'), step: 0.1 };
  for (let i = 0; i < 30; i++) value = stepInputValue(tenth, value, 1);
  assert.equal(value, 3);
  assert.equal(stepInputValue(byTitle('Length'), Number.NaN, 1), 21);
});

test('an applied set notes its origin until the input is edited, reset or dropped (B17)', () => {
  const origin: ParameterOrigin = { kind: 'rank', optimizationId: 3, trialId: 'a1', rank: 1 };
  let fields = applyInputValues(
    inputFields(inputs),
    { Length: 28, 'ATR length': 5, Missing: 1, Source: 'close' },
    origin,
  );
  const pick = (title: string) => fields.find((item) => item.descriptor.title === title)!;
  assert.deepEqual(
    [pick('Length').value, pick('Length').changed, pick('Length').origin],
    [28, true, origin],
  );
  assert.equal(pick('Length').descriptor.defaultValue, 20);
  assert.deepEqual([pick('Source').changed, pick('Source').origin], [false, origin]);
  assert.equal(pick('ATR length').value, undefined);
  assert.equal(pick('ATR length').origin, null);
  assert.equal(pick('Multiplier').origin, null);

  const recompiled = inputFields(
    describe(`//@version=6
strategy("Inputs")
a = input.int(20, "Length", minval=5, maxval=200)
c = input.source(close, "Source")
`).inputs,
    fields,
  );
  assert.deepEqual(
    recompiled.map((item) => [item.value, item.origin]),
    [
      [28, origin],
      ['close', origin],
    ],
  );

  fields = setInputValue(fields, 'Length', 30);
  assert.equal(pick('Length').origin, null);
  fields = resetInputValues(fields);
  assert.equal(
    fields.some((item) => item.origin),
    false,
  );
});

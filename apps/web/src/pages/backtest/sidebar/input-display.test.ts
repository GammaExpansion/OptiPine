import { describe, sourceSeries as engineSeries } from '@pine/engine';
import { expect, test } from 'vitest';
import { translate } from '../../../i18n/translate.ts';
import {
  applyInputValues,
  inputFields,
  resetInputValues,
  setInputValue,
  type InputField,
  type ParameterOrigin,
} from '../../../workflows/inputs.ts';
import {
  formatTime,
  inputControl,
  inputEditText,
  inputError,
  inputHint,
  inputSections,
  inputValueText,
  parseInputText,
  selectValues,
  sourceSeries,
  timeframeChoices,
} from './input-display.ts';

const source = `//@version=6
strategy("Inputs")
length = input.int(20, "Length", minval = 5, maxval = 200)
mult = input.float(2.0, "Multiplier", minval = 0.25, step = 0.25)
src = input.source(close, "Source")
trailing = input.bool(false, "Use trailing stop")
trail = input.float(3.0, "Trail %", step = 0.1, group = "Risk")
atr = input.int(math.round(14.0), "ATR length", group = "Risk")
window = input.session("0000-2400", "Trade window", group = "Session")
direction = input.string("Both", "Direction", options = ["Both", "Long", "Short"], group = "Session")
start = input.time(1672531200000, "Start date", group = "Session")
plot(close)`;
const fields = inputFields(describe(source).inputs);
const byTitle = (items: readonly InputField[], title: string) =>
  items.find((item) => item.descriptor.title === title)!;
const field = (title: string) => byTitle(fields, title);
const en = (text: Parameters<typeof translate>[0] | null) => (text ? translate(text, 'en') : null);

test('the source picker offers the engine’s built-in series', () => {
  expect(sourceSeries).toEqual(engineSeries);
});

test('each input type takes its control (B14)', () => {
  expect(fields.map((item) => [item.descriptor.title, inputControl(item)])).toEqual([
    ['Length', 'number'],
    ['Multiplier', 'number'],
    ['Source', 'select'],
    ['Use trailing stop', 'toggle'],
    ['Trail %', 'number'],
    ['ATR length', 'readOnly'],
    ['Trade window', 'text'],
    ['Direction', 'select'],
    ['Start date', 'time'],
  ]);
});

test('a timeframe input picks from TradingView’s list, keeping an unlisted value', () => {
  const [higher, chart] = inputFields(
    describe(`//@version=6
strategy("Timeframes")
higher = input.timeframe("240", "Higher TF")
chart = input.timeframe("", "Signal TF")
plot(close)`).inputs,
  );
  expect(inputControl(higher)).toBe('select');
  expect(selectValues(higher)).toEqual([...timeframeChoices]);
  expect(selectValues(higher).map((value) => en(inputValueText(higher.descriptor, value)))).toEqual(
    ['Chart', '1m', '3m', '5m', '15m', '30m', '45m', '1h', '2h', '3h', '4h', '1D', '1W', '1M'],
  );
  expect(en(inputValueText(chart.descriptor, ''))).toBe('Chart');
  const custom = setInputValue([higher], 'Higher TF', '7')[0];
  expect(selectValues(custom).at(-1)).toBe('7');
  expect(en(inputValueText(custom.descriptor, '7'))).toBe('7m');
});

test('values read with the step’s decimals, booleans as on and off, time in UTC', () => {
  expect(inputEditText(field('Multiplier').descriptor, 2)).toBe('2.00');
  expect(inputEditText(field('Multiplier').descriptor, 2.125)).toBe('2.125');
  expect(inputEditText(field('Trail %').descriptor, 3)).toBe('3.0');
  expect(inputEditText(field('Length').descriptor, 20)).toBe('20');
  expect(inputEditText(field('Start date').descriptor, 1672531200000)).toBe('2023-01-01 00:00');
  expect(inputEditText(field('ATR length').descriptor, undefined)).toBe('');
  expect(en(inputValueText(field('Use trailing stop').descriptor, false))).toBe('off');
  expect(en(inputValueText(field('ATR length').descriptor, undefined))).toBe('—');
  expect(formatTime(Date.UTC(2024, 1, 29, 9, 5))).toBe('2024-02-29 09:05');
});

test('edits parse to values, and unreadable text is sent as typed for the workflow to reject', () => {
  expect(parseInputText(field('Multiplier').descriptor, ' 2.5 ')).toBe(2.5);
  expect(parseInputText(field('Multiplier').descriptor, 'abc')).toBe('abc');
  expect(parseInputText(field('Length').descriptor, '')).toBe('');
  expect(parseInputText(field('Start date').descriptor, '2024-02-29 09:05')).toBe(
    Date.UTC(2024, 1, 29, 9, 5),
  );
  expect(parseInputText(field('Start date').descriptor, '2024-02-29')).toBe(Date.UTC(2024, 1, 29));
  expect(parseInputText(field('Start date').descriptor, '2023-02-30')).toBe('2023-02-30');
  expect(parseInputText(field('Trade window').descriptor, '0930-1600')).toBe('0930-1600');
});

test('an applied value names its set beside the default until edited or reset (B17)', () => {
  const rank: ParameterOrigin = { kind: 'rank', optimizationId: 1, trialId: 'a', rank: 1 };
  const applied = applyInputValues(fields, { Length: 28, Multiplier: 2 }, rank);
  expect(en(inputHint(byTitle(applied, 'Length')))).toBe('From #1, default 20');
  expect(translate(inputHint(byTitle(applied, 'Length'))!, 'zh')).toBe('来自 #1，默认 20');
  // A set value equal to the default changes nothing, so the caption stays the step (B17).
  expect(en(inputHint(byTitle(applied, 'Multiplier')))).toBe('Step 0.25');
  const hint = (origin: ParameterOrigin, language: 'en' | 'zh' = 'en') =>
    translate(
      inputHint(byTitle(applyInputValues(fields, { Length: 28 }, origin), 'Length'))!,
      language,
    );
  const ranges = {
    inSample: { start: 0, end: 86_400 },
    outOfSample: { start: 86_400, end: 172_800 },
  };
  expect(hint({ kind: 'window', optimizationId: 1, trialId: 'b', window: 2, ranges })).toBe(
    'From W3, default 20',
  );
  expect(hint({ kind: 'failed', optimizationId: 1, trialId: 'c' })).toBe(
    'From a failed set, default 20',
  );
  expect(hint({ kind: 'fixed', optimizationId: 1 })).toBe('From the fixed parameters, default 20');
  expect(hint({ kind: 'fixed', optimizationId: 1 }, 'zh')).toBe('来自固定参数，默认 20');
  expect(en(inputHint(byTitle(setInputValue(applied, 'Length', 30), 'Length')))).toBe('Default 20');
  expect(en(inputHint(byTitle(resetInputValues(applied), 'Length')))).toBe('5 – 200');
});

test('hints show the range or step, and the default once changed (B1, B14)', () => {
  expect(en(inputHint(field('Length')))).toBe('5 – 200');
  expect(en(inputHint(field('Multiplier')))).toBe('Step 0.25');
  expect(en(inputHint(field('Trail %')))).toBe('Step 0.1');
  expect(inputHint(field('ATR length'))).toBeNull();
  expect(inputHint(field('Source'))).toBeNull();
  const changed = setInputValue(fields, 'Multiplier', 0);
  expect(en(inputHint(byTitle(changed, 'Multiplier')))).toBe('Default 2.00');
  expect(en(inputError(byTitle(changed, 'Multiplier')))).toBe('Multiplier must be at least 0.25');
  const badTime = setInputValue(fields, 'Start date', '2023-01');
  expect(en(inputError(byTitle(badTime, 'Start date')))).toBe(
    'Enter a UTC time as YYYY-MM-DD HH:MM',
  );
});

test('selects list declared options or the series, keeping an unlisted value', () => {
  expect(selectValues(field('Direction'))).toEqual(['Both', 'Long', 'Short']);
  expect(selectValues(field('Source'))).toEqual([...engineSeries]);
  const other = setInputValue(fields, 'Source', 'volume');
  expect(selectValues(byTitle(other, 'Source')).at(-1)).toBe('volume');
});

test('sections follow declaration order and start where the group changes', () => {
  expect(
    inputSections(fields).map((section) => [
      section.group,
      section.fields.map((item) => item.descriptor.title),
    ]),
  ).toEqual([
    [null, ['Length', 'Multiplier', 'Source', 'Use trailing stop']],
    ['Risk', ['Trail %', 'ATR length']],
    ['Session', ['Trade window', 'Direction', 'Start date']],
  ]);
});

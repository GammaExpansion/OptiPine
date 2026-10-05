import { expect, test } from 'vitest';
import { inspectCsv, csvInput, csvTimeframeWarning, calendarFromJson } from './csv-import.ts';
import { defaultProfile } from './ProfileFields.tsx';
import { translate } from '../../i18n/translate.ts';

const header = 'time,open,high,low,close,Volume,plot';
const valid = `${header}\n1700000000,100,103,99,102,5,\n1700003600,102,104,101,103,6,"a,b"`;

test('CSV success keeps full counts, ignores plots and validates a hand-entered profile', () => {
  const result = inspectCsv(valid);
  expect(result.issues).toEqual([]);
  expect(result.dataset!.bars).toHaveLength(2);
  const built = csvInput(result.dataset, 'TEST:BTC', '240', 'crypto', {
    ...defaultProfile,
    mintick: '0.5',
    pointvalue: '2',
  });
  expect(built.input).toMatchObject({
    timeframe: '240',
    syminfo: { ticker: 'BTC', tickerid: 'TEST:BTC', mintick: 0.5, pricescale: 2, pointvalue: 2 },
    realtimeTail: false,
    strategyClosePending: false,
  });
});

test('CSV failures list each rejected record with its original row and raw data', () => {
  const result = inspectCsv(
    `${valid}\n1700003600,1,2,0,1,1,\n1700007200,5,2,1,4,1,\n1700010800,1,2,0,1,-5,`,
  );
  expect(result.dataset).toBeNull();
  expect(result.issues.map(({ line, rule }) => [line, rule])).toEqual([
    [4, { kind: 'message', id: 'csvAscendingTime', values: {} }],
    [5, { kind: 'message', id: 'csvOhlc', values: {} }],
    [6, { kind: 'message', id: 'csvVolume', values: {} }],
  ]);
  expect(result.issues[1].raw).toBe('1700007200,5,2,1,4,1,');
});

test('quoted multiline plot columns preserve original physical error row numbers', () => {
  const result = inspectCsv(
    `${header}\r\n1700000000,1,2,0,1,1,"a\r\nb"\r\n1700003600,1,2,0,1,-1,"x"\r\n1700007200,1,2,0,1,-2,`,
  );
  expect(result.issues.map((issue) => issue.line)).toEqual([4, 5]);
});

test('structural failures keep the package parser error without inventing recoveries', () => {
  expect(inspectCsv('time,open\n1,2').issues).toMatchObject([
    { line: 1, rule: { id: 'csvColumnCount' } },
  ]);
  expect(inspectCsv(`${header}\n1700000000,1,2,0,1,1,"unfinished`).issues).toMatchObject([
    { line: 2, rule: { id: 'csvUnclosedQuote' } },
  ]);
});

test('literal quotes in ignored unquoted columns do not hide later row errors', () => {
  const result = inspectCsv(
    `${header}\n1700000000,1,2,0,1,1,not"quoted\n1700003600,1,2,0,1,-1,\n1700007200,1,2,0,1,-2,`,
  );
  expect(result.issues.map((issue) => issue.line)).toEqual([3, 4]);
});

test('CSV never accepts invalid metadata, missing symbols, or an invalid calendar', () => {
  const dataset = inspectCsv(valid).dataset;
  expect(csvInput(dataset, '', '60', 'crypto', defaultProfile).error).toMatchObject({
    id: 'csv.symbolRequired',
  });
  expect(csvInput(dataset, 'BTC', '0', 'crypto', defaultProfile).error).toMatchObject({
    id: 'profileTimeframe',
  });
  const invalid = csvInput(dataset, 'BTC', '60', 'crypto', {
    mintick: '',
    pointvalue: '-1',
    mincontract: 'x',
    timezone: 'invalid/timezone',
  });
  expect(Object.keys(invalid.errors)).toEqual(['mintick', 'pointvalue', 'mincontract', 'timezone']);
  expect(invalid.input).toBeNull();
  expect(calendarFromJson('{').error).toMatchObject({ id: 'csv.calendarJsonInvalid' });
  expect(calendarFromJson('{}').error).toMatchObject({ id: 'calendarStructure' });
  const calendar = {
    from: 1700000000,
    to: 1700007200,
    sessions: [{ open: 1700000000, close: 1700007200, tradingDay: '2023-11-14' }],
  };
  const parsed = calendarFromJson(JSON.stringify(calendar));
  expect(parsed.error).toBeNull();
  expect(
    csvInput(dataset, 'BTC', '60', 'stock', defaultProfile, parsed.calendar).input!.sessionCalendar,
  ).toEqual(calendar);
});

test('CSV spacing warns about a mislabeled timeframe without resampling or blocking sparse data', () => {
  const dataset = inspectCsv(valid).dataset!;
  for (const timeframe of ['15', '240', '1D']) {
    expect(csvTimeframeWarning(dataset, timeframe, 'Etc/UTC')).toMatchObject({
      id: 'csv.timeframeMismatch',
      values: { minutes: 60, timeframe },
    });
  }
  expect(csvTimeframeWarning(dataset, '60', 'Etc/UTC')).toBeNull();
  expect(csvTimeframeWarning(dataset, '3600S', 'Etc/UTC')).toBeNull();
  expect(csvInput(dataset, 'TEST', '15', 'crypto', defaultProfile).input!.bars).toBe(dataset.bars);
  expect(csvTimeframeWarning(null, '15', 'Etc/UTC')).toBeNull();
  expect(
    csvTimeframeWarning({ ...dataset, bars: dataset.bars.slice(0, 1) }, '15', 'Etc/UTC'),
  ).toBeNull();
  expect(csvTimeframeWarning(dataset, 'bad', 'Etc/UTC')).toBeNull();
  expect(csvTimeframeWarning(dataset, '1D', 'bad/zone')).toBeNull();
});

test('CSV spacing handles session gaps, DST, calendar weeks and variable-length months', () => {
  const dataset = inspectCsv(valid).dataset!;
  const withTimes = (times: number[]) => ({
    ...dataset,
    bars: times.map((time) => ({ ...dataset.bars[0], time })),
  });
  const day = 86400;
  const intraday = withTimes([0, 3600, 7200, 3 * day, 3 * day + 3600]);
  expect(csvTimeframeWarning(intraday, '60', 'Etc/UTC')).toBeNull();
  expect(csvTimeframeWarning(intraday, '15', 'Etc/UTC')).toMatchObject({ values: { minutes: 60 } });
  const daily = withTimes(
    ['2026-03-06T14:30:00Z', '2026-03-09T13:30:00Z', '2026-03-10T13:30:00Z'].map(
      (value) => Date.parse(value) / 1000,
    ),
  );
  for (const timeframe of ['D', '1D'])
    expect(csvTimeframeWarning(daily, timeframe, 'America/New_York')).toBeNull();
  // Two daily bars either side of DST still count as one local calendar day.
  const dst = withTimes(
    ['2026-03-08T00:00:00Z', '2026-03-08T23:00:00Z'].map((value) => Date.parse(value) / 1000),
  );
  expect(csvTimeframeWarning(dst, '1D', 'America/New_York')).toBeNull();
  const weekly = withTimes(
    ['2026-01-05', '2026-01-12', '2026-01-20', '2026-01-26'].map(
      (value) => Date.parse(value) / 1000,
    ),
  );
  expect(csvTimeframeWarning(weekly, '1W', 'Etc/UTC')).toBeNull();
  const monthly = withTimes(
    ['2026-01-02', '2026-02-02', '2026-03-02', '2026-04-01'].map(
      (value) => Date.parse(value) / 1000,
    ),
  );
  for (const timeframe of ['M', '1M'])
    expect(csvTimeframeWarning(monthly, timeframe, 'Etc/UTC')).toBeNull();
  expect(csvTimeframeWarning(monthly, '1D', 'Etc/UTC')).toMatchObject({
    id: 'csv.timeframeMismatch',
  });
});

test('a one-minute CSV spacing warning carries its numeric count', () => {
  const dataset = inspectCsv(valid.replace('1700003600', '1700000060')).dataset!;
  const warning = csvTimeframeWarning(dataset, '15', 'Etc/UTC')!;
  expect(warning.values).toEqual({ count: 1, minutes: 1, timeframe: '15' });
  expect(translate(warning, 'en')).toBe(
    'Bars are most often 1 minute apart; the selected timeframe is 15. Check the timeframe; session breaks or missing bars can change spacing.',
  );
});

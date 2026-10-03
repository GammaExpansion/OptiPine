import { expect, test } from 'vitest';
import { inspectCsv, csvInput, calendarFromJson } from './csv-import.ts';
import { defaultProfile } from './ProfileFields.tsx';

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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { message } from '@pine/messages';
import { parseCsv, createSymbolProfile, CsvError } from './csv.ts';

const header = 'time,open,high,low,close,Volume';
test('CSV errors name the failed rule as a message id and retain original line numbers', () => {
  assert.throws(
    () => parseCsv(header + '\n1704067200,100,90,99,101,10'),
    (error: unknown) =>
      error instanceof CsvError &&
      error.line === 2 &&
      error.code === 'csvLineError' &&
      error.values.line === 2 &&
      JSON.stringify(error.values.reason) === JSON.stringify(message('csvOhlc')),
  );
});
test('CSV supports golden layout, BOM, CRLF, ignored quoted columns and infers interval', () => {
  const data = parseCsv(
    '\uFEFF' +
      header +
      ',ignored\r\n1704067200,100,102,99,101,10,"note, with \"\"quotes\"\""\r\n1704070800,101,104,100,103,12,"line\nbreak"\r\n',
  );
  assert.equal(data.bars.length, 2);
  assert.equal(data.timeframe, '60');
  assert.equal(data.from, 1704067200);
  assert.deepEqual(data.bars[0], {
    time: 1704067200,
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 10,
  });
});

test('CSV rejects invalid OHLC, missing values, duplicate timestamps and millisecond times with a line', () => {
  for (const csv of [
    header + '\n1704067200,100,90,99,101,10',
    header + '\n1704067200,100,102,99,101,',
    header + '\n1704067200000,100,102,99,101,10',
    header + '\n1704067200,100,102,99,101,10\n1704067200,100,102,99,101,10',
  ]) {
    assert.throws(
      () => parseCsv(csv),
      (error) => error instanceof CsvError && error.line >= 2,
    );
  }
  assert.throws(() => parseCsv('time,open,high,low,close\n1704067200,100,102,99,101'), CsvError);
});

test('CSV symbol profile keeps explicit metadata rather than inferring an exchange from prices', () => {
  const profile = createSymbolProfile('BATS:AAPL', {
    type: 'stock',
    timezone: 'America/New_York',
    currency: 'USD',
    mincontract: 1,
    session_hours: '0930-1600',
  });
  assert.equal(profile.tickerid, 'BATS:AAPL');
  assert.equal(profile.type, 'stock');
  assert.equal(profile.timezone, 'America/New_York');
  assert.equal(profile.mincontract, 1);
});

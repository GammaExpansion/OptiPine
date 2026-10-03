import test from 'node:test';
import assert from 'node:assert/strict';
import { basename, resolve } from 'node:path';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isReplaySelectionBoundary, loadChart, loadFixture, parseCsv } from './load.ts';
import { defaultFixtureRoot } from './resources.ts';

test('CSV quoting, empty cells, embedded newlines, and BOM are preserved', () => {
  assert.deepEqual(parseCsv('\uFEFFa,"b,c","d""e"\r\n1,"two\nlines",\r\n'), [
    ['a', 'b,c', 'd"e'],
    ['1', 'two\nlines', ''],
  ]);
  assert.throws(() => parseCsv('a,"unfinished'), /Unterminated/);
  assert.throws(() => parseCsv('a,"closed"suffix'), /after quoted/);
});

test('chart normalization retains final market row and never puts expected plots in engine bars', () => {
  const chart = loadChart(
    'time,open,high,low,close,Volume,signal\n100,1,2,1,2,3,42\n200,2,3,1,2,4,\n',
  );
  assert.deepEqual(chart.bars, [
    { time: 100, open: 1, high: 2, low: 1, close: 2, volume: 3 },
    { time: 200, open: 2, high: 3, low: 1, close: 2, volume: 4 },
  ]);
  assert.deepEqual(chart.plots, [{ title: 'signal', values: [42, null] }]);
  assert.throws(() => loadChart('time,open,high,low,close,Volume,x\n100,1,2,1,2,3\n'), /fields/);
});

test('native Volume position does not change market inputs or script column order', () => {
  const canonical = loadChart('time,open,high,low,close,Volume,a,b\n100,1,3,1,2,789,42,\n');
  for (const csv of [
    'time,open,high,low,close,a,Volume,b\n100,1,3,1,2,42,789,\n',
    'time,open,high,low,close,a,b,Volume\n100,1,3,1,2,42,,789\n',
  ]) {
    const actual = loadChart(csv);
    assert.deepEqual(actual.bars, canonical.bars);
    assert.deepEqual(actual.plots, canonical.plots);
  }
  assert.throws(() => loadChart('time,open,high,low,close,a\n100,1,3,1,2,42\n'), /Volume/);
  assert.throws(
    () => loadChart('time,open,high,low,close,Volume,Volume\n100,1,3,1,2,4,5\n'),
    /exactly one Volume/,
  );
  assert.throws(
    () => loadChart('time,open,high,low,close,a,Volume\n100,1,3,1,2,42,\n'),
    /Invalid number.*Volume/,
  );
});

test('weekly Replay selection accepts only UTC Monday bars and the next weekly boundary', () => {
  const bars = ['2024-12-23T00:00:00Z', '2024-12-30T00:00:00Z'].map((value) => ({
    time: Date.parse(value) / 1000,
  }));
  const selected = '2025-01-06T00:00:00Z';
  for (const timeframe of ['W', '1W'])
    for (const timezone of ['UTC', 'Etc/UTC', 'GMT', 'Etc/GMT'])
      assert.equal(isReplaySelectionBoundary(timeframe, timezone, bars, selected), true);
  assert.equal(isReplaySelectionBoundary('1W', 'UTC', bars, '2025-01-06T01:00:00+01:00'), true);
  for (const timeframe of ['2W', '1D', 'D', '1M', '1w'])
    assert.equal(isReplaySelectionBoundary(timeframe, 'UTC', bars, selected), false, timeframe);
  for (const timezone of ['America/New_York', 'Europe/London', 'Africa/Abidjan', undefined])
    assert.equal(
      isReplaySelectionBoundary('1W', timezone, bars, selected),
      false,
      String(timezone),
    );
  for (const value of [
    '2025-01-06T00:00:00',
    '2025-01-13T00:00:00Z',
    '2025-01-06T01:00:00Z',
    'invalid',
  ])
    assert.equal(isReplaySelectionBoundary('1W', 'UTC', bars, value), false, value);
  for (const shift of [1, 3600, 86400, 0.001]) {
    const shifted = bars.map(({ time }) => ({ time: time + shift }));
    assert.equal(
      isReplaySelectionBoundary(
        '1W',
        'UTC',
        shifted,
        new Date((shifted.at(-1)!.time + 604800) * 1000).toISOString(),
      ),
      false,
    );
  }
  assert.equal(
    isReplaySelectionBoundary('1W', 'UTC', [{ time: bars[0].time + 3600 }, bars[1]], selected),
    false,
  );
  assert.equal(isReplaySelectionBoundary('1W', 'UTC', [], selected), false);
  // Keep the established minute path independent of the exchange timezone.
  const minute = [{ time: Date.parse('2024-01-01T00:00:00Z') / 1000 }];
  assert.equal(
    isReplaySelectionBoundary('60', 'America/New_York', minute, '2024-01-01T01:00:00Z'),
    true,
  );
  assert.equal(isReplaySelectionBoundary('60', 'UTC', minute, '2024-01-01T02:00:00Z'), false);
});

test('raw fixture load separates engine inputs from expected report values', async () => {
  const root = defaultFixtureRoot,
    f = await loadFixture(resolve(root, 'strategy/v6/S_commission_slippage__pct'), root);
  assert.equal(f.key, 'strategy/v6/S_commission_slippage__pct');
  assert.ok(f.input!.bars.length > 20_000);
  assert.equal(f.report!.trades[0]['Date and time'], 1420212600);
  assert.equal(f.report!.trades[0]['Price USD'], 27);
  assert.equal(f.report!.metrics['Trades analysis/Total trades/All USD'], 2049);
  assert.equal(f.input!.settings!.commission_type, 'percent');
  assert.equal(f.input!.settings!.commission_value, 0.1);
  assert.deepEqual(Object.keys(f.input!).sort(), [
    'bars',
    'inputs',
    'realtimeTail',
    'settings',
    'syminfo',
    'timeframe',
  ]);
  assert.equal('report' in f.input!, false);
  assert.equal(f.input!.sessionCalendar, undefined);
  assert.deepEqual(f.marketProvenance, {});
});

test('calendar inputs are fixture-local, explicit, and independent of expected plots', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'pine-calendar-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = resolve(root, 'original', 'calendar-fixture');
  await mkdir(directory, { recursive: true });
  const meta = {
    schema_version: 2,
    id: basename(directory),
    kind: 'indicator',
    pine_version: 6,
    verified: true,
    syminfo: { tickerid: 'TEST:MARKET', timezone: 'UTC', session: 'regular' },
    timeframe: '60',
    data: {
      file: 'data.csv',
      exported_at: '2026-01-01T00:00:00Z',
      time_format: 'unix_seconds',
      columns: ['time', 'open', 'high', 'low', 'close', 'Volume', 'time_close'],
    },
  };
  const document = {
    schemaVersion: 1,
    provenance: {
      provider: 'Independent fixture source',
      exportedAt: '2026-01-01T00:00:00Z',
      chartUrl: 'https://example.test/chart',
      chartTimeframe: '1D',
      probe: 'calendar.pine',
      rawExportSha256: 'a'.repeat(64),
      columns: ['session_open', 'session_close', 'session_trading_day'],
    },
    calendar: {
      from: 0,
      to: 1000,
      sessions: [{ open: 100, close: 300, tradingDay: '1970-01-01' }],
    },
  };
  const csv = (expected: string) =>
    `time,open,high,low,close,Volume,time_close\n100,1,2,1,2,10,${expected}\n`;
  const metaPath = resolve(directory, 'meta.json');
  const calendarPath = resolve(directory, 'calendar.json');
  await Promise.all([
    writeFile(metaPath, JSON.stringify(meta)),
    writeFile(
      resolve(directory, 'source.pine'),
      '//@version=6\nindicator("calendar")\nplot(time_close)',
    ),
    writeFile(resolve(directory, 'data.csv'), csv('999999')),
    writeFile(calendarPath, JSON.stringify(document)),
  ]);
  const undeclared = await loadFixture(directory, root);
  assert.equal(undeclared.input!.sessionCalendar, undefined);
  assert.deepEqual(undeclared.marketProvenance, {});
  await writeFile(calendarPath, 'Not even JSON: an undeclared file must never be read.');
  assert.equal((await loadFixture(directory, root)).fingerprint, undeclared.fingerprint);

  await writeFile(calendarPath, JSON.stringify(document));
  const declaredMeta = { ...meta, session_calendar: { file: 'calendar.json' } };
  await writeFile(metaPath, JSON.stringify(declaredMeta));
  const declared = await loadFixture(directory, root);
  assert.deepEqual(declared.input!.sessionCalendar, document.calendar);
  assert.match(
    declared.marketProvenance.sessionCalendar,
    /^calendar.json: Independent fixture source/,
  );
  assert.notEqual(declared.fingerprint, undeclared.fingerprint);
  await writeFile(resolve(directory, 'data.csv'), csv('123'));
  const changedExpected = await loadFixture(directory, root);
  assert.deepEqual(changedExpected.input, declared.input);
  assert.notEqual(changedExpected.fingerprint, declared.fingerprint);
  document.calendar.sessions[0].close = 250;
  await writeFile(calendarPath, JSON.stringify(document));
  const changedCalendar = await loadFixture(directory, root);
  assert.notEqual(changedCalendar.fingerprint, changedExpected.fingerprint);
  assert.equal(changedCalendar.input!.sessionCalendar!.sessions[0].close, 250);
  document.provenance.provider = 'Corrected independent attribution';
  await writeFile(calendarPath, JSON.stringify(document));
  const changedProvenance = await loadFixture(directory, root);
  assert.notEqual(changedProvenance.fingerprint, changedCalendar.fingerprint);
  assert.deepEqual(changedProvenance.input, changedCalendar.input);

  const isolated = resolve(root, 'isolated', basename(directory));
  await cp(directory, isolated, { recursive: true });
  await rm(resolve(root, 'original'), { recursive: true });
  const copy = await loadFixture(isolated, resolve(root, 'isolated'));
  assert.deepEqual(copy.input, changedProvenance.input);
  assert.equal(copy.fingerprint, changedProvenance.fingerprint);
  assert.deepEqual(copy.marketProvenance, changedProvenance.marketProvenance);
});

test('calendar declarations cannot silently fall back or escape their fixture', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pine-invalid-calendar-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const meta = {
    schema_version: 2,
    id: basename(directory),
    kind: 'indicator',
    pine_version: 6,
    verified: true,
    syminfo: { tickerid: 'TEST:MARKET', timezone: 'UTC', session: 'regular' },
    timeframe: '60',
    data: {
      file: 'data.csv',
      exported_at: '2026-01-01T00:00:00Z',
      time_format: 'unix_seconds',
      columns: ['time', 'open', 'high', 'low', 'close', 'Volume', 'signal'],
    },
  };
  await Promise.all([
    writeFile(
      resolve(directory, 'source.pine'),
      '//@version=6\nindicator("calendar")\nplot(close)',
    ),
    writeFile(
      resolve(directory, 'data.csv'),
      'time,open,high,low,close,Volume,signal\n100,1,2,1,2,10,42\n',
    ),
  ]);
  const metaPath = resolve(directory, 'meta.json');
  for (const declaration of [
    null,
    false,
    'calendar.json',
    [],
    {},
    { file: null },
    { file: 1 },
    { file: '../calendar.json' },
    { file: '..\\calendar.json' },
    { file: 'nested/calendar.json' },
    { file: '/calendar.json' },
    { file: 'C:\\calendar.json' },
    { file: 'calendar.txt' },
  ]) {
    await writeFile(metaPath, JSON.stringify({ ...meta, session_calendar: declaration }));
    await assert.rejects(loadFixture(directory, directory), /Invalid session_calendar/);
  }
  await writeFile(
    metaPath,
    JSON.stringify({ ...meta, session_calendar: { file: 'calendar.json' } }),
  );
  await assert.rejects(loadFixture(directory, directory), /ENOENT/);
  await writeFile(resolve(directory, 'calendar.json'), '{}');
  await assert.rejects(loadFixture(directory, directory), /Invalid calendar document/);
});

test('Replay selection context comes from inline recorded inputs, independently of expected plots', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pine-replay-fixture-'));
  t.after(() => rm(directory, { recursive: true }));
  const original = resolve(defaultFixtureRoot, 'strategy/v6/S_sizing_crypto');
  const meta = JSON.parse(await readFile(resolve(original, 'meta.json'), 'utf8'));
  Object.assign(meta, {
    id: basename(directory),
    timeframe: '60',
    data: {
      file: 'data.csv',
      time_format: 'unix_seconds',
      exported_at: '2026-09-12T12:28:14Z',
      columns: ['time', 'open', 'high', 'low', 'close', 'Volume', 'signal'],
    },
    execution: {
      mode: 'replay-selection',
      selected_at: '2024-01-01T02:00:00Z',
      paused: true,
      stepped: false,
    },
  });
  const metaPath = resolve(directory, 'meta.json');
  const csv = (expected: string) =>
    'time,open,high,low,close,Volume,signal\n' +
    `1704067200,1,2,1,2,10,42\n1704070800,2,3,1,2,20,${expected}\n`;
  await Promise.all([
    writeFile(metaPath, JSON.stringify(meta)),
    writeFile(resolve(directory, 'source.pine'), '//@version=6\nstrategy("context")\nplot(close)'),
    writeFile(resolve(directory, 'data.csv'), csv('')),
    writeFile(resolve(directory, 'report.xlsx'), await readFile(resolve(original, 'report.xlsx'))),
  ]);
  const first = await loadFixture(directory, directory);
  assert.equal(first.input!.realtimeTail, false);
  assert.equal(first.input!.strategyClosePending, true);
  assert.equal(first.input!.bars.length, 2);
  assert.equal(
    first.settingsProvenance.strategyClosePending,
    'meta.execution: replay-selection, 2024-01-01T02:00:00Z, paused=true, stepped=false',
  );
  // A leftover capture note is not an input or a fingerprint dependency.
  await writeFile(resolve(directory, 'capture-notes.md'), 'Unreferenced acquisition notes.');
  assert.equal((await loadFixture(directory, directory)).fingerprint, first.fingerprint);
  await rm(resolve(directory, 'capture-notes.md'));
  await writeFile(resolve(directory, 'data.csv'), csv('999'));
  const changedExpectation = await loadFixture(directory, directory);
  assert.deepEqual(changedExpectation.input, first.input);
  assert.notEqual(changedExpectation.fingerprint, first.fingerprint);

  // Equivalent recorded timestamps leave execution unchanged, but metadata remains hashed.
  await writeFile(
    metaPath,
    JSON.stringify({
      ...meta,
      execution: { ...meta.execution, selected_at: '2024-01-01T03:00:00+01:00' },
    }),
  );
  const changedRecord = await loadFixture(directory, directory);
  assert.deepEqual(changedRecord.input, changedExpectation.input);
  assert.notEqual(changedRecord.fingerprint, changedExpectation.fingerprint);

  // Older captures can establish the selection boundary without recording whether
  // Replay was ever stepped. Absence must remain distinct from an observed false.
  const { stepped: _stepped, ...unrecordedStepping } = meta.execution;
  await writeFile(metaPath, JSON.stringify({ ...meta, execution: unrecordedStepping }));
  const unrecorded = await loadFixture(directory, directory);
  assert.deepEqual(unrecorded.input, changedExpectation.input);
  assert.notEqual(unrecorded.fingerprint, changedExpectation.fingerprint);
  assert.equal(
    unrecorded.settingsProvenance.strategyClosePending,
    'meta.execution: replay-selection, 2024-01-01T02:00:00Z, paused=true, stepped=unrecorded',
  );

  for (const changed of [
    null,
    false,
    'replay-selection',
    [],
    {},
    { ...meta.execution, mode: 'paused' },
    { ...meta.execution, selected_at: '2024-01-01T03:00:00Z' },
    { ...meta.execution, selected_at: '2024-01-01T02:00:00' },
    { ...meta.execution, selected_at: undefined },
    { ...meta.execution, selected_at: 1704074400 },
    { ...meta.execution, paused: undefined },
    { ...meta.execution, paused: false },
    { ...meta.execution, paused: 'true' },
    { ...meta.execution, stepped: true },
    { ...meta.execution, stepped: 'false' },
    { ...meta.execution, stepped: 0 },
    { ...meta.execution, stepped: null },
  ]) {
    await writeFile(metaPath, JSON.stringify({ ...meta, execution: changed }));
    await assert.rejects(loadFixture(directory, directory), /Replay selection context/);
  }
  for (const kind of ['indicator', 'parse']) {
    await writeFile(metaPath, JSON.stringify({ ...meta, kind, expect: { compile: 'ok' } }));
    await assert.rejects(loadFixture(directory, directory), /Replay selection context/);
  }
  const { execution: _execution, ...withoutExecution } = meta;
  await writeFile(metaPath, JSON.stringify(withoutExecution));
  const undeclared = await loadFixture(directory, directory);
  assert.equal(undeclared.input!.strategyClosePending, undefined);
  assert.equal(undeclared.settingsProvenance.strategyClosePending, undefined);

  meta.timeframe = '1W';
  meta.syminfo.timezone = 'Etc/UTC';
  meta.execution.selected_at = '2025-01-06T00:00:00Z';
  const weeklyCsv = (expected: string) =>
    `time,open,high,low,close,Volume,signal\n1734912000,1,2,1,2,10,42\n1735516800,2,3,1,2,20,${expected}\n`;
  await Promise.all([
    writeFile(metaPath, JSON.stringify(meta)),
    writeFile(resolve(directory, 'data.csv'), weeklyCsv('')),
  ]);
  const weekly = await loadFixture(directory, directory);
  assert.equal(weekly.input!.strategyClosePending, true);
  assert.equal(weekly.input!.realtimeTail, false);
  await writeFile(resolve(directory, 'data.csv'), weeklyCsv('999'));
  assert.deepEqual((await loadFixture(directory, directory)).input, weekly.input);
  for (const timeframe of ['1D', '2W', '1M']) {
    await writeFile(metaPath, JSON.stringify({ ...meta, timeframe }));
    await assert.rejects(loadFixture(directory, directory), /Replay selection context/);
  }
});

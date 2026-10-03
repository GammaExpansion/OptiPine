import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCalendar } from './calendar.ts';

function calendarDocument() {
  return {
    schemaVersion: 1,
    provenance: {
      provider: 'Independent synthetic source',
      exportedAt: '2026-01-01T00:00:00Z',
      chartUrl: 'https://example.test/chart',
      chartTimeframe: '1D',
      probe: 'calendar.pine',
      rawExportSha256: 'a'.repeat(64),
      columns: ['session_open', 'session_close', 'session_trading_day'],
    },
    calendar: {
      from: 0,
      to: 200,
      sessions: [{ open: 10, close: 100, tradingDay: '1970-01-01' }],
    },
  };
}

test('explicit calendar files fingerprint both intervals and independent provenance', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'pine-calendar-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const document = calendarDocument();
  const file = join(directory, 'market.json');
  await writeFile(file, JSON.stringify(document));
  const first = await loadCalendar(file);
  assert.deepEqual(first.calendar, document.calendar);
  assert.match(first.provenance, /market.json: Independent synthetic source/);
  document.calendar.sessions[0].close = 90;
  await writeFile(file, JSON.stringify(document));
  const second = await loadCalendar(file);
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.equal(first.calendar.sessions[0].close, 100);
  document.provenance.rawExportSha256 = 'b'.repeat(64);
  await writeFile(file, JSON.stringify(document));
  assert.notEqual((await loadCalendar(file)).fingerprint, second.fingerprint);
});

test('declared calendar files must exist and contain valid documents', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'pine-invalid-calendar-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'market.json');
  await assert.rejects(loadCalendar(file), /ENOENT/);
  const document = calendarDocument();
  for (const invalid of [
    null,
    [],
    {},
    { ...document, schemaVersion: 2 },
    { ...document, provenance: null },
    { ...document, provenance: { ...document.provenance, provider: 42 } },
    { ...document, provenance: { ...document.provenance, exportedAt: 'not-a-date' } },
    { ...document, provenance: { ...document.provenance, rawExportSha256: 'bad' } },
    { ...document, provenance: { ...document.provenance, columns: ['session_open', null] } },
    { ...document, calendar: null },
    { ...document, calendar: { ...document.calendar, sessions: [null] } },
    { ...document, calendar: { ...document.calendar, from: 200 } },
    { ...document, calendar: { ...document.calendar, periods: [] } },
    { ...document, calendar: { ...document.calendar, periods: { '1W': [null] } } },
    { ...document, calendar: { ...document.calendar, periods: { '1W': 'not-intervals' } } },
    {
      ...document,
      calendar: {
        ...document.calendar,
        sessions: [{ open: 100, close: 10, tradingDay: '1970-01-01' }],
      },
    },
  ]) {
    await writeFile(file, JSON.stringify(invalid));
    await assert.rejects(loadCalendar(file), /Invalid calendar document/);
  }
  await writeFile(file, '{incomplete');
  await assert.rejects(loadCalendar(file), /Invalid calendar document/);
});

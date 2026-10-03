import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { importCalendarChart } from '@pine/golden/calendar-import';
import type { CalendarDocument } from '@pine/golden/calendar';

const [csvFile, outputFile, timezone, exportedAt, chartUrl] = process.argv.slice(2);
if (!csvFile || !outputFile || !timezone || !Number.isFinite(Date.parse(exportedAt)) || !chartUrl)
  throw new Error(
    'Usage: node packages/golden/scripts/import-calendar.ts <csv> <json> <timezone> <exportedAt> <chartUrl>',
  );
const text = await readFile(csvFile, 'utf8');
const document: CalendarDocument = {
  schemaVersion: 1,
  provenance: {
    provider: 'TradingView chart export; independent calendar metadata probe',
    exportedAt,
    chartUrl,
    chartTimeframe: '1D',
    probe: 'packages/golden/scripts/probes/calendar.pine',
    rawExportSha256: createHash('sha256').update(text).digest('hex'),
    columns: [
      'session_open',
      'session_close',
      'session_trading_day',
      'calendar_week_open',
      'calendar_week_close',
      'calendar_month_open',
      'calendar_month_close',
    ],
  },
  calendar: importCalendarChart(text, timezone),
};
// One record per line keeps the historical schedule inspectable without excessive indentation.
const pretty = JSON.stringify(document, null, 2).replace(
  /\{\n\s+"(?:open|from)"[^{}]+?\n\s+\}/g,
  (record) => JSON.stringify(JSON.parse(record)),
);
await writeFile(outputFile, pretty + '\n');
console.log(`${document.calendar.sessions.length} sessions written to ${outputFile}`);

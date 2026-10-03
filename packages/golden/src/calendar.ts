import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import type { SessionCalendar } from '@pine/engine';
import { Calendar } from '@pine/engine/calendar';

export interface CalendarDocument {
  schemaVersion: 1;
  provenance: {
    provider: string;
    exportedAt: string;
    chartUrl: string;
    chartTimeframe: string;
    probe: string;
    rawExportSha256: string;
    columns: string[];
  };
  calendar: SessionCalendar;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read only the independent market input explicitly named by the fixture. */
export async function loadCalendar(
  file: string,
): Promise<{ calendar: SessionCalendar; fingerprint: string; provenance: string }> {
  const text = await readFile(file, 'utf8');
  let document: CalendarDocument;
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.provenance))
      throw new Error('Expected schemaVersion 1 and provenance');
    const provenance = value.provenance;
    if (
      !['provider', 'exportedAt', 'chartUrl', 'chartTimeframe', 'probe'].every(
        (key) => typeof provenance[key] === 'string' && provenance[key].trim() !== '',
      ) ||
      !Number.isFinite(Date.parse(provenance.exportedAt as string)) ||
      typeof provenance.rawExportSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(provenance.rawExportSha256) ||
      !Array.isArray(provenance.columns) ||
      !provenance.columns.length ||
      !provenance.columns.every((column) => typeof column === 'string' && column.trim() !== '')
    )
      throw new Error('Missing or invalid calendar provenance');
    const calendar = value.calendar;
    if (
      !isRecord(calendar) ||
      !Array.isArray(calendar.sessions) ||
      !calendar.sessions.every(isRecord) ||
      (calendar.periods !== undefined &&
        (!isRecord(calendar.periods) ||
          !Object.values(calendar.periods).every(
            (periods) => Array.isArray(periods) && periods.every(isRecord),
          )))
    )
      throw new Error('Missing or invalid calendar intervals');
    document = value as unknown as CalendarDocument;
    new Calendar(document.calendar);
  } catch (error) {
    throw new Error(`Invalid calendar document: ${file}`, { cause: error });
  }
  return {
    calendar: document.calendar,
    fingerprint: createHash('sha256').update(text).digest('hex'),
    provenance: `${basename(file)}: ${document.provenance.provider}, ${document.provenance.exportedAt}`,
  };
}

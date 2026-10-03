import {
  CsvError,
  createSymbolProfile,
  parseCsv,
  parseRunMetadata,
  parseSessionCalendar,
  type CsvDataset,
} from '@pine/market-data';
import { errorText, message, type Text, type Message } from '@pine/messages';
import type { SessionCalendar } from '@pine/engine';
import type { DatasetInput } from '../../workflows/backtest.ts';
import type { SymbolInfoKey } from '../../workflows/market-data.ts';
import type { ProfileDraft } from './ProfileFields.tsx';

export interface CsvIssue {
  line: number;
  rule: Text;
  raw: string;
}
export interface CsvInspection {
  dataset: CsvDataset | null;
  issues: CsvIssue[];
}

/** Locate logical records for error recovery only; the package still parses and validates each record. */
function recordSpans(raw: string): { line: number; raw: string }[] {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  const result: { line: number; raw: string }[] = [];
  let quoted = false,
    fieldStart = true,
    start = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];
      if (quoted) {
        if (char === '"' && lines[i][j + 1] === '"') j++;
        else if (char === '"') quoted = false;
      } else if (char === ',') fieldStart = true;
      else if (char === '"' && fieldStart) {
        quoted = true;
        fieldStart = false;
      } else if (char.trim()) fieldStart = false;
    }
    if (!quoted) {
      const row = lines.slice(start, i + 1).join('\n');
      if (row.trim()) result.push({ line: start + 1, raw: row });
      start = i + 1;
      fieldStart = true;
    }
  }
  return result;
}
export function inspectCsv(raw: string): CsvInspection {
  try {
    return { dataset: parseCsv(raw), issues: [] };
  } catch (error) {
    if (!(error instanceof CsvError)) throw error;
    const first: CsvIssue = {
      line: error.line,
      rule: error.values.reason as Text,
      raw: raw.split(/\r\n|\n|\r/)[error.line - 1] ?? '',
    };
    const rule = error.values.reason;
    if (
      error.line === 1 ||
      typeof rule !== 'object' ||
      rule.kind !== 'message' ||
      ['csvUnclosedQuote', 'csvAfterQuote'].includes(rule.id)
    )
      return { dataset: null, issues: [first] };
    const [header, ...rows] = recordSpans(raw);
    if (!header) return { dataset: null, issues: [first] };
    const issues: CsvIssue[] = [];
    let previous = '';
    for (const row of rows) {
      try {
        parseCsv(`${header.raw}\n${previous}${row.raw}`);
        previous = `${row.raw}\n`;
      } catch (error) {
        if (!(error instanceof CsvError)) throw error;
        issues.push({ line: row.line, rule: error.values.reason as Text, raw: row.raw });
      }
    }
    return { dataset: null, issues: issues.length ? issues : [first] };
  }
}

export function calendarFromJson(raw: string): {
  calendar: SessionCalendar | undefined;
  error: Text | null;
} {
  try {
    return { calendar: parseSessionCalendar(JSON.parse(raw)), error: null };
  } catch (error) {
    return {
      calendar: undefined,
      error: error instanceof SyntaxError ? message('csv.calendarJsonInvalid') : errorText(error),
    };
  }
}

export function csvInput(
  dataset: CsvDataset | null,
  symbol: string,
  timeframe: string,
  type: string,
  profile: ProfileDraft,
  calendar?: SessionCalendar,
): {
  input: DatasetInput | null;
  errors: Partial<Record<SymbolInfoKey, Message>>;
  error: Text | null;
} {
  const errors: Partial<Record<SymbolInfoKey, Message>> = {};
  const values = {
    mintick: Number(profile.mintick),
    pointvalue: Number(profile.pointvalue),
    mincontract: Number(profile.mincontract),
    timezone: profile.timezone,
  };
  for (const key of ['mintick', 'pointvalue', 'mincontract', 'timezone'] as const) {
    try {
      parseRunMetadata({ timeframe: '60', syminfo: { [key]: values[key] } });
    } catch (error) {
      errors[key] = errorText(error) as Message;
    }
  }
  if (Object.keys(errors).length) return { input: null, errors, error: null };
  if (!symbol.trim()) return { input: null, errors, error: message('csv.symbolRequired') };
  try {
    const metadata = parseRunMetadata({
      timeframe,
      syminfo: createSymbolProfile(symbol.trim(), { ...values, type }),
      ...(calendar ? { sessionCalendar: calendar } : {}),
    });
    return {
      input: dataset
        ? { ...metadata, bars: dataset.bars, realtimeTail: false, strategyClosePending: false }
        : null,
      errors,
      error: null,
    };
  } catch (error) {
    return { input: null, errors, error: errorText(error) };
  }
}

import { CodedError, type Text } from '@pine/messages';
import { marketDataError, marketDataMessage, type MarketDataMessageId } from './messages.ts';
import type { MarketBar, RunInput, SessionCalendar } from '@pine/engine';

export interface CsvDataset {
  bars: MarketBar[];
  timeframe: string;
  from: number;
  to: number;
}
/** A CSV rejected at `line`; `values.reason` holds the rule that failed. */
export class CsvError extends CodedError<MarketDataMessageId> {
  readonly line: number;
  constructor(reason: Text, line: number) {
    super('csvLineError', { line, reason });
    this.name = 'CsvError';
    this.line = line;
  }
}

/** RFC 4180 fields, including quotes in ignored indicator columns. */
function records(text: string): { fields: string[]; line: number }[] {
  const rows: { fields: string[]; line: number }[] = [];
  let fields: string[] = [],
    field = '',
    quoted = false,
    afterQuote = false,
    line = 1,
    startLine = 1;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += char;
        if (char === '\n') line++;
      }
    } else if (char === '"' && field.trim() === '' && !afterQuote) {
      quoted = true;
      field = '';
    } else if (char === ',') {
      fields.push(field.trim());
      field = '';
      afterQuote = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      fields.push(field.trim());
      if (fields.some(Boolean)) rows.push({ fields, line: startLine });
      fields = [];
      field = '';
      afterQuote = false;
      line++;
      startLine = line;
    } else if (afterQuote && char.trim() !== '')
      throw new CsvError(marketDataMessage('csvAfterQuote'), line);
    else field += char;
  }
  if (quoted) throw new CsvError(marketDataMessage('csvUnclosedQuote'), startLine);
  fields.push(field.trim());
  if (fields.some(Boolean)) rows.push({ fields, line: startLine });
  return rows;
}

export function inferTimeframe(bars: readonly MarketBar[]): string {
  const counts = new Map<number, number>();
  for (let index = 1; index < bars.length; index++) {
    const delta = bars[index].time - bars[index - 1].time;
    counts.set(delta, (counts.get(delta) ?? 0) + 1);
  }
  const seconds = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 3600;
  if (seconds % 604800 === 0) return `${seconds / 604800}W`;
  if (seconds % 86400 === 0) return `${seconds / 86400}D`;
  if (seconds % 60 === 0) return String(seconds / 60);
  return `${seconds}S`;
}

/** Golden CSV layout: Unix seconds and OHLCV; never interpret exported plot columns. */
export function parseCsv(text: string): CsvDataset {
  const rows = records(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new CsvError(marketDataMessage('csvMissingData'), 1);
  const header = rows[0].fields.map((field) => field.toLowerCase());
  const columns = ['time', 'open', 'high', 'low', 'close', 'volume'];
  const indexes = columns.map((column) => {
    if (header.filter((item) => item === column).length !== 1)
      throw new CsvError(marketDataMessage('csvColumnCount', { column }), rows[0].line);
    return header.indexOf(column);
  });
  const bars: MarketBar[] = [];
  for (const row of rows.slice(1)) {
    const values = indexes.map((index, column) => {
      const raw = row.fields[index];
      if (raw === undefined || raw === '' || !Number.isFinite(Number(raw)))
        throw new CsvError(
          marketDataMessage('csvFiniteColumn', { column: columns[column] }),
          row.line,
        );
      return Number(raw);
    });
    const [time, open, high, low, close, volume] = values;
    if (!Number.isInteger(time) || time < 0 || time > 99999999999)
      throw new CsvError(marketDataMessage('csvUnixSeconds'), row.line);
    if (bars.length && time <= bars.at(-1)!.time)
      throw new CsvError(marketDataMessage('csvAscendingTime'), row.line);
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high))
      throw new CsvError(marketDataMessage('csvOhlc'), row.line);
    if (volume < 0) throw new CsvError(marketDataMessage('csvVolume'), row.line);
    bars.push({ time, open, high, low, close, volume });
  }
  return { bars, timeframe: inferTimeframe(bars), from: bars[0].time, to: bars.at(-1)!.time };
}

export interface SymbolProfileOptions {
  type?: string;
  currency?: string;
  basecurrency?: string;
  timezone?: string;
  mintick?: number;
  mincontract?: number;
  pointvalue?: number;
  session_hours?: string;
}
/** User-editable CSV profile defaults; a CSV alone cannot establish exchange metadata. */
export function createSymbolProfile(
  symbol: string,
  options: SymbolProfileOptions = {},
): Record<string, unknown> {
  const [prefix, ticker] = symbol.includes(':')
    ? symbol.split(':', 2)
    : ['CSV', symbol || 'UNKNOWN'];
  const mintick = options.mintick ?? 0.01;
  return {
    tickerid: `${prefix}:${ticker}`,
    ticker,
    prefix,
    type: options.type ?? 'crypto',
    currency: options.currency ?? 'USDT',
    basecurrency: options.basecurrency ?? '',
    timezone: options.timezone ?? 'Etc/UTC',
    mintick,
    mincontract: options.mincontract ?? 0.00001,
    pointvalue: options.pointvalue ?? 1,
    pricescale: 1 / mintick,
    minmove: 1,
    session: 'regular',
    session_hours: options.session_hours ?? '0000-0000:1234567',
  };
}

function record(value: unknown, label: Text): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw marketDataError('jsonObjectRequired', { label });
  }
  return value as Record<string, unknown>;
}

function seconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

/** Validate the calendar contract before it can reach a worker or replace a prior selection. */
export function parseSessionCalendar(value: unknown): SessionCalendar {
  const data = record(value, marketDataMessage('importCalendar'));
  if (
    !seconds(data.from) ||
    !seconds(data.to) ||
    data.from >= data.to ||
    !Array.isArray(data.sessions)
  ) {
    throw marketDataError('calendarStructure');
  }
  const from = data.from;
  const to = data.to;
  let previousClose = -Infinity;
  const sessions = data.sessions.map((value, index) => {
    const session = record(value, marketDataMessage('calendarSession', { index: index + 1 }));
    if (!seconds(session.open) || !seconds(session.close) || session.open >= session.close) {
      throw marketDataError('calendarSessionBounds', { index: index + 1 });
    }
    if (session.open < previousClose) throw marketDataError('calendarSessionOverlap');
    if (session.open >= to || session.close <= from)
      throw marketDataError('calendarSessionOutside', { index: index + 1 });
    if (typeof session.tradingDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(session.tradingDay)) {
      throw marketDataError('calendarTradingDayMissing', { index: index + 1 });
    }
    const day = new Date(`${session.tradingDay}T00:00:00Z`);
    if (!Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== session.tradingDay) {
      throw marketDataError('calendarTradingDayInvalid', { index: index + 1 });
    }
    previousClose = session.close;
    return { open: session.open, close: session.close, tradingDay: session.tradingDay };
  });
  const periods: Record<string, { from: number; to: number; open: number; close: number }[]> = {};
  if (data.periods !== undefined) {
    for (const [timeframe, supplied] of Object.entries(
      record(data.periods, marketDataMessage('calendarPeriods')),
    )) {
      if (!/^[1-9]\d*[DWM]$/.test(timeframe) || !Array.isArray(supplied)) {
        throw marketDataError('calendarPeriodsStructure');
      }
      let previousEnd = -Infinity;
      periods[timeframe] = supplied.map((value, index) => {
        const period = record(
          value,
          marketDataMessage('calendarPeriod', { timeframe, index: index + 1 }),
        );
        if (
          !seconds(period.from) ||
          !seconds(period.to) ||
          !seconds(period.open) ||
          !seconds(period.close) ||
          period.from >= period.to ||
          period.open >= period.close
        ) {
          throw marketDataError('calendarPeriodBounds', { timeframe, index: index + 1 });
        }
        if (period.from < previousEnd)
          throw marketDataError('calendarPeriodOverlap', { timeframe });
        if (period.from >= to || period.to <= from)
          throw marketDataError('calendarPeriodOutside', { timeframe, index: index + 1 });
        previousEnd = period.to;
        return { from: period.from, to: period.to, open: period.open, close: period.close };
      });
    }
  }
  return { from, to, sessions, ...(data.periods === undefined ? {} : { periods }) };
}

export type RunMetadata = Pick<RunInput, 'syminfo' | 'timeframe'> &
  Partial<
    Pick<
      RunInput,
      'inputs' | 'settings' | 'realtimeTail' | 'strategyClosePending' | 'sessionCalendar'
    >
  >;

/** Read explicit RunInput fields; fixture notes never imply execution settings. */
export function parseRunMetadata(value: unknown): RunMetadata {
  const data = record(value, marketDataMessage('importProfile'));
  const syminfo = { ...record(data.syminfo, 'syminfo') };
  if (typeof data.timeframe !== 'string' || !/^(?:[1-9]\d*[SDWM]?|[DWM])$/.test(data.timeframe)) {
    throw marketDataError('profileTimeframe');
  }
  for (const key of ['mintick', 'pointvalue', 'mincontract']) {
    if (
      syminfo[key] !== undefined &&
      (typeof syminfo[key] !== 'number' ||
        !Number.isFinite(syminfo[key]) ||
        Number(syminfo[key]) <= 0)
    ) {
      throw marketDataError('profilePositive', { key });
    }
  }
  if (syminfo.timezone !== undefined) {
    if (typeof syminfo.timezone !== 'string') throw marketDataError('profileTimezoneName');
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: syminfo.timezone });
    } catch {
      throw marketDataError('profileTimezoneInvalid');
    }
  }
  const metadata: RunMetadata = { syminfo, timeframe: data.timeframe };
  for (const key of ['inputs', 'settings'] as const) {
    if (data[key] !== undefined) metadata[key] = { ...record(data[key], key) };
  }
  for (const key of ['realtimeTail', 'strategyClosePending'] as const) {
    if (data[key] !== undefined) {
      if (typeof data[key] !== 'boolean') throw marketDataError('profileBoolean', { key });
      metadata[key] = data[key];
    }
  }
  if (data.sessionCalendar !== undefined)
    metadata.sessionCalendar = parseSessionCalendar(data.sessionCalendar);
  return metadata;
}

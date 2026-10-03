import { createHash } from 'node:crypto';
import type { Diagnostic, PlotOutput, Trade } from '@pine/engine';
import type { Cell } from './report.ts';
import { reportNumber } from './report-number.ts';
import { reportedTradeProfit } from '@pine/engine/trade-profit';

export type Status = 'match' | 'mismatch' | 'unsupported' | 'crash';
export type Tier = 'compilation' | 'series' | 'trades' | 'metrics';
export interface Difference {
  position: number | string;
  expected: unknown;
  actual: unknown;
}
export interface Check {
  id: string;
  tier: Tier;
  status: Status;
  total: number;
  matched: number;
  /** One bit per matching assertion. This preserves individual cells in baselines compactly. */
  matching: string;
  firstDifference?: Difference;
  matchingPrefix?: number;
  /** The expected observations and precision used for this check, independent of output. */
  measurementFingerprint?: string;
}
export interface Tolerance {
  absolute: number;
  relative: number;
}
/** CSV exports contain full double precision. Allow small arithmetic-order roundoff only. */
export const SERIES_TOLERANCE: Tolerance = { absolute: 1e-8, relative: 1e-12 };
export const EXACT: Tolerance = { absolute: 0, relative: 0 };
/** Money and percentage report cells are rounded to two decimals; ratio cells to three. */
export const REPORT_TOLERANCE: Tolerance = { absolute: 0.005000001, relative: 0 };
export const RATIO_TOLERANCE: Tolerance = { absolute: 0.000500001, relative: 0 };
export const COMPARISON_RULES =
  'v2: ordered plots, full shape and cells; ordered trade rows/all fields; every populated report metric; CSV 1e-8 + 1e-12 relative; report half exported unit; per-check measurement fingerprints';

export function equalCell(
  expected: unknown,
  actual: unknown,
  tolerance: Tolerance = SERIES_TOLERANCE,
): boolean {
  // Pine na becomes blank on export; missing actual data (undefined) is never an na value.
  if (actual === undefined) return false;
  if (typeof actual === 'number' && !Number.isFinite(actual)) actual = null;
  if (typeof actual === 'boolean' && typeof expected === 'number') actual = Number(actual);
  if (expected === null || actual === null) return expected === actual;
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Number.isInteger(expected) && Number.isInteger(actual)) return expected === actual;
    return (
      Math.abs(expected - actual) <=
      tolerance.absolute + tolerance.relative * Math.max(Math.abs(expected), Math.abs(actual))
    );
  }
  return expected === actual;
}

export function checkValues(
  id: string,
  tier: Tier,
  expected: readonly unknown[],
  actual: readonly unknown[],
  tolerance: Tolerance = SERIES_TOLERANCE,
  available = true,
): Check {
  const total = Math.max(expected.length, actual.length),
    bits = Buffer.alloc(Math.ceil(total / 8));
  let matched = 0,
    firstDifference: Difference | undefined;
  for (let i = 0; i < total; i++) {
    if (
      available &&
      i < expected.length &&
      i < actual.length &&
      equalCell(expected[i], actual[i], tolerance)
    ) {
      matched++;
      bits[i >>> 3] |= 1 << (i & 7);
    } else
      firstDifference ??= {
        position: i,
        expected: expected[i] ?? (i < expected.length ? null : '<missing>'),
        actual: actual[i] ?? (i < actual.length ? null : '<missing>'),
      };
  }
  const measurementFingerprint = createHash('sha256')
    .update(JSON.stringify({ expected, tolerance }))
    .digest('hex');
  return {
    id,
    tier,
    status: !available ? 'unsupported' : matched === total ? 'match' : 'mismatch',
    total,
    matched,
    matching: bits.toString('base64'),
    measurementFingerprint,
    ...(firstDifference ? { firstDifference } : {}),
  };
}

export function unavailable(
  id: string,
  tier: Tier,
  total: number,
  status: 'unsupported' | 'crash',
  message: string,
): Check {
  return {
    id,
    tier,
    status,
    total,
    matched: 0,
    matching: Buffer.alloc(Math.ceil(total / 8)).toString('base64'),
    firstDifference: { position: 0, expected: 'executable result', actual: message },
  };
}

export function compareCompilation(
  expect: { compile: 'ok' | 'error'; error?: { line: number } },
  actual: { success: boolean; diagnostics: Diagnostic[] },
): Check {
  const expected: unknown[] = [expect.compile === 'ok'];
  const observed: unknown[] = [actual.success];
  if (expect.compile === 'error') {
    expected.push(expect.error?.line);
    observed.push(actual.diagnostics.find((d) => !['runtime', 'limit'].includes(d.kind))?.line);
  }
  const result = checkValues('compile', 'compilation', expected, observed, EXACT);
  const unsupported = actual.diagnostics.find((d) => d.kind === 'unsupported');
  return unsupported
    ? {
        ...result,
        ...unavailable('compile', 'compilation', result.total, 'unsupported', unsupported.message),
      }
    : result;
}

function compareCount(id: string, tier: Tier, expected: number, actual: number): Check {
  // Position zero represents the output container; later positions represent its items.
  // This stable check scores extra items without creating output-dependent check IDs.
  // The container position also gives an empty expected output a nonzero denominator.
  const shape = checkValues(
    id,
    tier,
    Array.from({ length: expected + 1 }, () => true),
    Array.from({ length: actual + 1 }, () => true),
    EXACT,
  );
  if (shape.firstDifference) shape.firstDifference = { position: 'count', expected, actual };
  return shape;
}

export function comparePlots(expected: PlotOutput[], actual: PlotOutput[]): Check[] {
  const checks = [compareCount('plots/count', 'series', expected.length, actual.length)];
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i],
      a = actual[i];
    const key = `plot/${i}/${e.title}`;
    checks.push(
      checkValues(
        `${key}/shape`,
        'series',
        [e.title, e.values.length],
        a ? [a.title, a.values.length] : [],
        EXACT,
      ),
    );
    checks.push(checkValues(key, 'series', e.values, a?.values ?? []));
  }
  return checks;
}

function reportTolerance(key: string): Tolerance {
  if (/^(Trade number|Type|Date and time|Signal|Duration \(bars\))$/.test(key)) return EXACT;
  // Unlike the monetary result columns, report quantities and notionals are not rounded
  // to cents. Permit only floating point multiplication noise, independent of position size.
  if (key === 'Size (qty)') return { absolute: 1e-10, relative: 0 };
  if (key === 'Size (value)') return SERIES_TOLERANCE;
  return REPORT_TOLERANCE;
}

const chartTimeFormatters = new Map<string, Intl.DateTimeFormat>();
function chartWallTime(value: Cell, zone: string): Cell {
  if (typeof value !== 'number') return value;
  let formatter = chartTimeFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    chartTimeFormatters.set(zone, formatter);
  }
  return formatter.format(new Date(value * 1000));
}

/** Render domain trades into the report's duplicated Exit/Entry rows using computed data only. */
export function tradeRows(
  trades: Trade[],
  currency = 'USD',
  pointvalue = 1,
  lastBarIndex?: number,
): Record<string, Cell>[] {
  const result: Record<string, Cell>[] = [];
  let cumulative = 0;
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i],
      value = t.quantity * t.entryPrice * pointvalue;
    const invested = value + t.entryCommission;
    const open = t.exitBar === null;
    const profit = reportedTradeProfit(t);
    if (!open) cumulative += t.profit;
    const common: Record<string, Cell> = {
      'Trade number': i + 1,
      'Size (qty)': t.quantity,
      'Size (value)': value,
      [`Net PnL ${currency}`]: reportNumber(profit),
      'Return %': invested === 0 ? null : (profit / invested) * 100,
      [`Commission ${currency}`]: reportNumber(t.commission),
      [`Favorable excursion ${currency}`]: reportNumber(t.maxRunup),
      'Favorable excursion %': invested === 0 ? null : (t.maxRunup / invested) * 100,
      [`Adverse excursion ${currency}`]: reportNumber(-Math.abs(t.maxDrawdown)),
      'Adverse excursion %': invested === 0 ? null : (-Math.abs(t.maxDrawdown) / invested) * 100,
      [`Cumulative PnL ${currency}`]: reportNumber(
        (t.realizedProfit ?? cumulative) + (open ? profit : 0),
      ),
      // Denominator is account initial capital, attached by compareTrades below.
      'Cumulative PnL %': null,
      'Duration (bars)':
        (t.exitBar ?? lastBarIndex) === undefined
          ? null
          : (t.exitBar ?? lastBarIndex)! - t.entryBar,
    };
    result.push({
      ...common,
      Type: `Exit ${t.direction}`,
      'Date and time': t.exitTime ?? 'Open',
      Signal: open ? 'Open' : (t.exitComment ?? t.exitId ?? ''),
      [`Price ${currency}`]: t.exitPrice ?? '—',
    });
    result.push({
      ...common,
      Type: `Entry ${t.direction}`,
      'Date and time': t.entryTime,
      Signal: t.entryComment || t.entryId,
      [`Price ${currency}`]: t.entryPrice,
    });
  }
  return result;
}

export function compareTrades(
  expected: Record<string, Cell>[],
  actual: Trade[],
  settings: {
    currency: string;
    pointvalue: number;
    initialCapital: number;
    lastBarIndex?: number;
    chartTimezone?: string;
  },
): Check[] {
  const rows = tradeRows(actual, settings.currency, settings.pointvalue, settings.lastBarIndex);
  for (const row of rows)
    row['Cumulative PnL %'] =
      (Number(row[`Cumulative PnL ${settings.currency}`]) / settings.initialCapital) * 100;
  const checks: Check[] = [compareCount('trades/count', 'trades', expected.length, rows.length)];
  const rowMatches = Array.from(
    { length: Math.max(expected.length, rows.length) },
    (_, i) => !!expected[i] && !!rows[i],
  );
  const fields = [...new Set(expected.flatMap(Object.keys))];
  for (const field of fields) {
    // Excel records chart-local wall times without a UTC offset. Both instants of a DST
    // fold have the same observation. Compare that recorded precision, without using
    // expected trade order or economics to select an offset.
    const value = (row: Record<string, Cell>): Cell =>
      field === 'Date and time' && settings.chartTimezone
        ? chartWallTime(row[field], settings.chartTimezone)
        : row[field];
    const check = checkValues(
      `trade/${field}`,
      'trades',
      expected.map(value),
      rows.map(value),
      reportTolerance(field),
    );
    const bits = Buffer.from(check.matching, 'base64');
    for (let i = 0; i < rowMatches.length; i++)
      rowMatches[i] &&= Boolean(bits[i >>> 3] & (1 << (i & 7)));
    if (check.firstDifference)
      check.firstDifference.position = `row ${Number(check.firstDifference.position) + 1}, ${field}`;
    checks.push(check);
  }
  let prefix = 0;
  while (rowMatches[prefix]) prefix++;
  const rowCheck = checkValues(
    'trades/rows',
    'trades',
    expected.map(() => true),
    rowMatches,
    EXACT,
  );
  rowCheck.matchingPrefix = prefix;
  checks.push(rowCheck);
  return checks;
}

export function compareMetrics(
  expected: Record<string, Cell>,
  actual: Record<string, Cell>,
): Check[] {
  return Object.entries(expected).map(([key, value]) => {
    let tolerance = /ratio|factor|Average profit \/ average loss/i.test(key)
      ? RATIO_TOLERANCE
      : /\/Average bars in (trades|winners|losers)\//.test(key)
        ? { absolute: 0.500000001, relative: 0 }
        : /\/(Total (open trades|trades|winners|losers)|Even trades|Outliers|Margin calls|Max contracts held)\//.test(
              key,
            )
          ? EXACT
          : REPORT_TOLERANCE;
    // Some very small monetary values retain extra decimals in the raw workbook.
    // Never discard precision actually present in that observation.
    if (typeof value === 'number' && value !== 0 && tolerance !== EXACT) {
      const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
      const places = Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent));
      tolerance = {
        absolute: Math.min(tolerance.absolute, 0.5 * 10 ** -places + 1e-9),
        relative: 0,
      };
    }
    const result = checkValues(
      `metric/${key}`,
      'metrics',
      [value],
      key in actual ? [actual[key]] : [],
      tolerance,
    );
    if (!(key in actual)) result.status = 'unsupported';
    if (result.firstDifference) result.firstDifference.position = key;
    return result;
  });
}

export function preservedMatches(before: Check, after: Check): boolean {
  const a = Buffer.from(before.matching, 'base64'),
    b = Buffer.from(after.matching, 'base64');
  return a.every((byte, i) => ((b[i] ?? 0) & byte) === byte);
}

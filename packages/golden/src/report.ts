import { posix } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { isMetricCell } from './report-layout.ts';

export type Cell = number | string | boolean | null;
export interface ExpectedReport {
  trades: Record<string, Cell>[];
  metrics: Record<string, Cell>;
  properties: Record<string, Cell>;
}

function numeric(value: string, where: string): number {
  if (value.trim() === '' || !Number.isFinite(Number(value)))
    throw new Error(`Invalid number at ${where}: ${JSON.stringify(value)}`);
  return Number(value);
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  trimValues: false,
});
const array = <T>(x: T | T[] | undefined): T[] =>
  x === undefined ? [] : Array.isArray(x) ? x : [x];
// OOXML elements have variable structures; constrain values to Cell when decoding cells.
function content(node: any): string {
  if (typeof node === 'string') return node;
  if (!node) return '';
  if (node['#text'] !== undefined) return String(node['#text']);
  if (node.t !== undefined) return content(node.t);
  return array<any>(node.r).map(content).join('');
}

export function readWorkbook(bytes: Uint8Array): Record<string, Cell[][]> {
  const archive = unzipSync(bytes);
  const read = (path: string): any => {
    if (!archive[path]) throw new Error(`Missing XLSX part: ${path}`);
    return xml.parse(strFromU8(archive[path]));
  };
  const rels = array<any>(read('xl/_rels/workbook.xml.rels').Relationships.Relationship);
  const strings = archive['xl/sharedStrings.xml']
    ? array<any>(read('xl/sharedStrings.xml').sst.si).map(content)
    : [];
  const result: Record<string, Cell[][]> = {};
  for (const sheet of array<any>(read('xl/workbook.xml').workbook.sheets.sheet)) {
    const rel = rels.find((r) => r['@Id'] === sheet['@r:id']);
    if (!rel) throw new Error(`Missing relationship for sheet ${sheet['@name']}`);
    const target = String(rel['@Target']);
    const path = target.startsWith('/')
      ? target.slice(1)
      : posix.normalize(posix.join('xl', target));
    const rows: Cell[][] = [];
    for (const row of array<any>(read(path).worksheet.sheetData.row)) {
      const cells: Cell[] = [];
      for (const c of array<any>(row.c)) {
        const ref = /^([A-Z]+)(\d+)$/.exec(String(c['@r']));
        if (!ref) throw new Error(`Invalid XLSX cell reference: ${c['@r']}`);
        const col = [...ref[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const raw = c.v === undefined ? '' : content(c.v);
        let value: Cell;
        switch (c['@t']) {
          case 's':
            value = strings[Number(raw)];
            if (value === undefined) throw new Error('Invalid shared string index');
            break;
          case 'inlineStr':
            value = content(c.is);
            break;
          case 'str':
            value = raw;
            break;
          case 'b':
            value = raw === '1';
            break;
          case 'e':
            throw new Error(`XLSX formula error ${raw} at ${c['@r']}`);
          default:
            value = raw === '' ? null : numeric(raw, `${sheet['@name']}!${c['@r']}`);
        }
        cells[col] = value === '' ? null : value;
      }
      rows[Number(row['@r']) - 1] = Array.from(
        { length: cells.length },
        (_, i) => cells[i] ?? null,
      );
    }
    result[String(sheet['@name'])] = rows;
  }
  return result;
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();
/** Excel serials are local wall times in the chart timezone, not UTC. */
export function excelTimeToUnix(serial: number, timezone: string): number {
  const wall = Math.round((serial - 25569) * 86400);
  let fmt = zoneFormatters.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    zoneFormatters.set(timezone, fmt);
  }
  let utc = wall;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(utc * 1000)).map((p) => [p.type, p.value]),
    );
    const local =
      Date.UTC(
        +parts.year,
        +parts.month - 1,
        +parts.day,
        +parts.hour,
        +parts.minute,
        +parts.second,
      ) / 1000;
    const next = wall - (local - utc);
    if (next === utc) return utc;
    utc = next;
  }
  throw new Error(`Ambiguous or nonexistent chart-local timestamp: ${serial} in ${timezone}`);
}

export function normalizeReport(
  workbook: Record<string, Cell[][]>,
  timezone: string,
): ExpectedReport {
  const required = [
    'Performance',
    'Trades analysis',
    'Risk-adjusted performance',
    'Trades',
    'Properties',
  ];
  for (const name of required)
    if (!workbook[name]?.length) throw new Error(`Missing report sheet: ${name}`);
  const properties = Object.fromEntries(
    workbook.Properties.slice(1)
      .filter((r) => r && r[0] !== null)
      .map((r) => [String(r[0]), r[1] ?? null]),
  );
  const metrics: Record<string, Cell> = {};
  for (const name of required.slice(0, 3)) {
    const [headers, ...rows] = workbook[name];
    for (const row of rows) {
      if (!row || row[0] === null) continue;
      for (let col = 1; col < headers.length; col++) {
        if (isMetricCell(name, String(row[0]), String(headers[col]))) {
          if (row[col] === undefined)
            throw new Error(`Missing report cell: ${name}/${row[0]}/${headers[col]}`);
          metrics[`${name}/${row[0]}/${headers[col]}`] = row[col];
        } else if (row[col] !== undefined && row[col] !== null) {
          throw new Error(`Unexpected populated report cell: ${name}/${row[0]}/${headers[col]}`);
        }
      }
    }
  }
  const [headers, ...rows] = workbook.Trades;
  const trades = rows.map((row, i) => {
    if (!row || row.length !== headers.length) throw new Error(`Incomplete trade row ${i + 2}`);
    const record: Record<string, Cell> = {};
    for (let col = 0; col < headers.length; col++) {
      let value = row[col];
      if (headers[col] === 'Date and time' && typeof value === 'number')
        value = excelTimeToUnix(value, timezone);
      record[String(headers[col])] = value;
    }
    return record;
  });
  return { properties, trades, metrics };
}

export function normalizeSettings(
  properties: Record<string, Cell>,
  notes = '',
): { settings: Record<string, unknown>; provenance: Record<string, string>; warnings: string[] } {
  const settings: Record<string, unknown> = {},
    provenance: Record<string, string> = {},
    warnings: string[] = [];
  const set = (key: string, value: unknown, source: string) => {
    settings[key] = value;
    provenance[key] = source;
  };
  const firstNumber = (value: Cell) =>
    Number(
      String(value)
        .replaceAll(',', '')
        .match(/[-+]?\d+(?:\.\d+)?/)?.[0],
    );
  for (const [property, key] of [
    ['Initial capital', 'initial_capital'],
    ['Pyramiding', 'pyramiding'],
    ['Commission', 'commission_value'],
    ['Slippage', 'slippage'],
  ] as const) {
    if (properties[property] !== undefined) {
      const n = firstNumber(properties[property]);
      if (!Number.isFinite(n)) warnings.push(`Unrecognized ${property}: ${properties[property]}`);
      else set(key, n, `report.xlsx Properties: ${property} = ${properties[property]}`);
    }
  }
  if (properties['Default order size'] !== undefined) {
    const value = String(properties['Default order size']);
    const type = /%.*equity/i.test(value)
      ? 'percent_of_equity'
      : /contracts?/i.test(value)
        ? 'fixed'
        : /\b(USD|USDT|EUR|GBP|JPY)\b/.test(value)
          ? 'cash'
          : undefined;
    if (type) {
      set('default_qty_type', type, `report.xlsx Properties: Default order size = ${value}`);
      set('default_qty_value', firstNumber(value), provenance.default_qty_type);
    } else warnings.push(`Unrecognized Default order size: ${value}`);
  }
  for (const side of ['Long', 'Short']) {
    const value = properties[`${side} leverage`];
    if (value === undefined) continue;
    const leverage = /Infinity/i.test(String(value)) ? Infinity : firstNumber(value);
    if (leverage > 0)
      set(
        `margin_${side.toLowerCase()}`,
        100 / leverage,
        `report.xlsx Properties: ${side} leverage = ${value}`,
      );
    else warnings.push(`Unrecognized ${side} leverage: ${value}`);
  }
  if (properties['Script execution'] !== undefined) {
    const value = String(properties['Script execution']);
    set(
      'calc_on_order_fills',
      /On order fill/i.test(value),
      `report.xlsx Properties: Script execution = ${value}`,
    );
    set('calc_on_every_tick', /On every tick/i.test(value), provenance.calc_on_order_fills);
  }
  if (properties['Order execution delay'] !== undefined) {
    const value = String(properties['Order execution delay']);
    if (/^(None|One tick)$/.test(value))
      set(
        'process_orders_on_close',
        value === 'None',
        `report.xlsx Properties: Order execution delay = ${value}`,
      );
    else warnings.push(`Unrecognized Order execution delay: ${value}`);
  }
  if (properties['Limit order execution'] !== undefined) {
    const value = String(properties['Limit order execution']);
    if (/^Requested price$/i.test(value))
      set(
        'backtest_fill_limits_assumption',
        0,
        `report.xlsx Properties: Limit order execution = ${value}`,
      );
    else {
      // A native source-default-2 capture reports "1 tick beyond". Preserve
      // that label without treating its displayed number as the setting.
      provenance.backtest_fill_limits_assumption = `report.xlsx Properties (unparsed): Limit order execution = ${value}`;
      warnings.push(`Unrecognized Limit order execution: ${value}`);
    }
  }
  // The raw report omits commission units. Collection notes record explicit UI overrides.
  // Inspect only the Commission assignment, not the general case description or its ID.
  const assignment = /Commission\s*=\s*([^;；\n，]+)/i.exec(notes)?.[1];
  const commissionText = `${properties.Commission ?? ''} ${assignment ?? ''}`;
  const commissionType = /per contract/i.test(commissionText)
    ? 'cash_per_contract'
    : /per order/i.test(commissionText)
      ? 'cash_per_order'
      : /%|percent/i.test(commissionText)
        ? 'percent'
        : undefined;
  if (commissionType)
    set(
      'commission_type',
      commissionType,
      assignment
        ? `meta.notes: Commission = ${assignment}`
        : `report.xlsx Properties: Commission = ${properties.Commission}`,
    );
  else if (Number(settings.commission_value) > 0)
    warnings.push(
      'Commission units absent from Properties and collection notes; script declaration remains the only source for commission_type',
    );
  return { settings, provenance, warnings };
}

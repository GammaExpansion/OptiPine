import { parseCsv } from './csv.ts';
export { parseCsv } from './csv.ts';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeReport, normalizeSettings, readWorkbook } from './report.ts';
import type { ExpectedReport } from './report.ts';
import { loadCalendar } from './calendar.ts';
import type { MarketBar, PlotOutput, RunInput } from '@pine/engine';

export interface FixtureMeta {
  schema_version: number;
  id: string;
  kind: 'parse' | 'indicator' | 'strategy';
  pine_version: number;
  verified: boolean;
  notes?: string;
  expect?: { compile: 'ok' | 'error'; error?: { line: number } };
  syminfo?: Record<string, unknown>;
  timeframe?: string;
  chart_timezone?: string;
  inputs?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  session_calendar?: { file: string };
  execution?: {
    mode: 'replay-selection';
    selected_at: string;
    paused: true;
    stepped?: false;
  };
  data?: { file: string; exported_at: string; columns: string[]; time_format: string };
  report?: { file: string; exported_at: string };
}
export interface Fixture {
  key: string;
  path: string;
  fingerprint: string;
  meta: FixtureMeta;
  source: string;
  input?: RunInput;
  plots: PlotOutput[];
  report?: ExpectedReport;
  settingsProvenance: Record<string, string>;
  marketProvenance: Record<string, string>;
  warnings: string[];
}

function numeric(value: string, where: string): number {
  if (value.trim() === '' || !Number.isFinite(Number(value)))
    throw new Error(`Invalid number at ${where}: ${JSON.stringify(value)}`);
  return Number(value);
}

export function loadChart(text: string): {
  bars: MarketBar[];
  plots: PlotOutput[];
  headers: string[];
} {
  const [headers, ...rows] = parseCsv(text);
  if (!headers || headers.slice(0, 5).join(',') !== 'time,open,high,low,close')
    throw new Error('Chart CSV must start with time,open,high,low,close');
  const volumeColumn = headers.indexOf('Volume', 5);
  if (volumeColumn < 0 || headers.lastIndexOf('Volume') !== volumeColumn)
    throw new Error('Chart CSV must contain exactly one Volume column');
  const plotColumns = headers.flatMap((_, index) =>
    index >= 5 && index !== volumeColumn ? [index] : [],
  );
  const plots = plotColumns.map((index) => ({
    title: headers[index],
    values: [] as PlotOutput['values'],
  }));
  const bars = rows.map((row, i) => {
    if (row.length !== headers.length)
      throw new Error(`CSV row ${i + 2} has ${row.length} fields; expected ${headers.length}`);
    const values = [0, 1, 2, 3, 4, volumeColumn].map((j) =>
      numeric(row[j], `CSV row ${i + 2}, ${headers[j]}`),
    );
    for (const [plotIndex, column] of plotColumns.entries())
      plots[plotIndex].values.push(
        row[column] === '' ? null : numeric(row[column], `CSV row ${i + 2}, ${headers[column]}`),
      );
    return {
      time: values[0],
      open: values[1],
      high: values[2],
      low: values[3],
      close: values[4],
      volume: values[5],
    };
  });
  for (let i = 1; i < bars.length; i++)
    if (bars[i].time <= bars[i - 1].time)
      throw new Error(`CSV timestamps not increasing at row ${i + 2}`);
  if (!bars.length) throw new Error('Chart CSV has no bars');
  return { bars, plots, headers };
}

/** Validate recorded Replay selections without consulting expected plot values. */
export function isReplaySelectionBoundary(
  timeframe: string,
  timezone: unknown,
  bars: readonly Pick<MarketBar, 'time'>[],
  selectedAt: string,
): boolean {
  if (!bars.length || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(selectedAt)) return false;
  const selected = Date.parse(selectedAt) / 1000;
  if (!Number.isFinite(selected)) return false;
  const last = bars.at(-1)!.time;
  if (/^[1-9]\d*$/.test(timeframe)) return selected === last + Number(timeframe) * 60;
  // Native 24/7 UTC weekly captures open at Monday midnight. This does not
  // generalize exchange-local weekly sessions or DST boundaries.
  if (
    !/^(?:1W|W)$/.test(timeframe) ||
    !['UTC', 'Etc/UTC', 'GMT', 'Etc/GMT'].includes(String(timezone))
  )
    return false;
  return (
    selected === last + 7 * 86400 &&
    bars.every(({ time }) => {
      const date = new Date(time * 1000);
      return (
        Number.isFinite(time) &&
        date.getUTCDay() === 1 &&
        date.getUTCHours() === 0 &&
        date.getUTCMinutes() === 0 &&
        date.getUTCSeconds() === 0 &&
        date.getUTCMilliseconds() === 0
      );
    })
  );
}

export async function discoverFixtures(root: string): Promise<string[]> {
  const paths: string[] = [];
  async function visit(path: string) {
    const entries = await readdir(path, { withFileTypes: true });
    if (entries.some((e) => e.isFile() && e.name === 'meta.json')) paths.push(path);
    else for (const e of entries) if (e.isDirectory()) await visit(join(path, e.name));
  }
  await visit(root);
  return paths.sort();
}

export async function loadFixture(path: string, root: string): Promise<Fixture> {
  const [metaText, source] = await Promise.all([
    readFile(join(path, 'meta.json'), 'utf8'),
    readFile(join(path, 'source.pine'), 'utf8'),
  ]);
  const meta = JSON.parse(metaText) as FixtureMeta;
  if (
    meta.schema_version !== 2 ||
    !['parse', 'indicator', 'strategy'].includes(meta.kind) ||
    typeof meta.verified !== 'boolean' ||
    meta.id !== basename(path)
  )
    throw new Error(`Invalid fixture metadata in ${path}`);
  if (meta.kind === 'parse' && !['ok', 'error'].includes(meta.expect?.compile ?? ''))
    throw new Error(`Missing compilation expectation in ${path}`);
  const execution = meta.execution;
  if (
    Object.hasOwn(meta, 'execution') &&
    (meta.kind !== 'strategy' ||
      !execution ||
      typeof execution !== 'object' ||
      Array.isArray(execution) ||
      execution.mode !== 'replay-selection' ||
      typeof execution.selected_at !== 'string' ||
      execution.paused !== true ||
      (Object.hasOwn(execution, 'stepped') && execution.stepped !== false))
  )
    throw new Error(`Invalid or unsupported Replay selection context in ${path}`);
  const calendarDeclaration = meta.session_calendar;
  if (
    Object.hasOwn(meta, 'session_calendar') &&
    (meta.kind === 'parse' ||
      !calendarDeclaration ||
      typeof calendarDeclaration !== 'object' ||
      Array.isArray(calendarDeclaration) ||
      typeof calendarDeclaration.file !== 'string' ||
      !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.json$/.test(calendarDeclaration.file))
  )
    throw new Error(`Invalid session_calendar in ${path}: expected a fixture-local JSON filename`);
  const hash = createHash('sha256').update(metaText).update(source);
  const fixture: Fixture = {
    key: relative(root, path).replaceAll('\\', '/'),
    path,
    fingerprint: '',
    meta,
    source,
    plots: [],
    settingsProvenance: {},
    marketProvenance: {},
    warnings: [],
  };
  if (meta.kind !== 'parse') {
    if (!meta.data || !meta.syminfo || !meta.timeframe || meta.data.time_format !== 'unix_seconds')
      throw new Error(`Missing market inputs in ${path}`);
    const csv = await readFile(join(path, meta.data.file), 'utf8');
    hash.update(csv);
    const chart = loadChart(csv);
    fixture.plots = chart.plots;
    if (JSON.stringify(chart.headers) !== JSON.stringify(meta.data.columns))
      throw new Error(`CSV headers differ from meta.data.columns in ${path}`);
    fixture.input = {
      bars: chart.bars,
      syminfo: { ...meta.syminfo },
      timeframe: meta.timeframe,
      inputs: { ...meta.inputs },
      settings: { ...meta.settings },
    };
    if (calendarDeclaration) {
      const calendar = await loadCalendar(join(path, calendarDeclaration.file));
      fixture.input.sessionCalendar = calendar.calendar;
      fixture.marketProvenance.sessionCalendar = calendar.provenance;
      hash.update(calendar.fingerprint);
    }
    const tf = /^(\d*)([DWM])$/.exec(meta.timeframe);
    const seconds = tf
      ? Number(tf[1] || 1) * ({ D: 86400, W: 604800, M: 2678400 }[tf[2]] ?? 0)
      : Number(meta.timeframe) * 60;
    const exportTime = Date.parse(meta.data.exported_at) / 1000;
    if (Number.isFinite(exportTime) && Number.isFinite(seconds))
      fixture.input.realtimeTail = exportTime < chart.bars.at(-1)!.time + seconds;
    if (fixture.input.realtimeTail)
      fixture.warnings.push(
        'Export contains an unclosed final bar; full market row retained, realtime update history unavailable',
      );
    if (execution) {
      // This recorded selection boundary is distinct from an arbitrary paused or
      // stepped Replay. Its context, not blank expected outputs, selects the schedule.
      if (
        !isReplaySelectionBoundary(
          meta.timeframe,
          meta.syminfo?.timezone,
          chart.bars,
          execution.selected_at,
        )
      )
        throw new Error(`Invalid or unsupported Replay selection context in ${path}`);
      fixture.input.realtimeTail = false;
      fixture.input.strategyClosePending = true;
      fixture.settingsProvenance.strategyClosePending = `meta.execution: ${execution.mode}, ${execution.selected_at}, paused=${execution.paused}, stepped=${execution.stepped ?? 'unrecorded'}`;
      fixture.warnings.push(
        'Recorded Replay selection boundary: final strategy close pending; Replay tick and bar-state semantics are not implemented',
      );
    }
    if (meta.kind === 'strategy') {
      if (!meta.report || !meta.chart_timezone)
        throw new Error(`Missing strategy report/timezone in ${path}`);
      const bytes = await readFile(join(path, meta.report.file));
      hash.update(bytes);
      fixture.report = normalizeReport(readWorkbook(bytes), meta.chart_timezone);
      const normalized = normalizeSettings(fixture.report.properties, meta.notes);
      fixture.input.settings = { ...normalized.settings, ...meta.settings };
      Object.assign(fixture.settingsProvenance, normalized.provenance);
      for (const key of Object.keys(meta.settings ?? {}))
        fixture.settingsProvenance[key] = 'meta.settings';
      fixture.warnings.push(...normalized.warnings);
    }
  }
  fixture.fingerprint = hash.digest('hex');
  return fixture;
}

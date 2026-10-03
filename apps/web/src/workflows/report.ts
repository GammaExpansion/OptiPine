import type { RunResult } from '@pine/engine';
import { metricRows, type MetricRow, type MetricValue } from '@pine/optimizer';
import { csvNumber, csvText } from './csv.ts';

type Part = 'value' | 'percent';

/**
 * One row of a report group. `id` is the engine's `Section/Name`; the catalogs label it with
 * TradingView's English name in both languages.
 */
export interface ReportRow {
  readonly id: string;
  /** The cell part the table shows: the amount (or count, ratio) or the percentage. */
  readonly show: Part;
  /** The engine reports this loss as a positive amount; the report prints it negative. */
  readonly loss: boolean;
  /** Undefined where the engine reports nothing for the column, shown as a dash. */
  readonly all: MetricValue | undefined;
  readonly long: MetricValue | undefined;
  readonly short: MetricValue | undefined;
}

export interface ReportGroup {
  readonly id: 'returns' | 'trades' | 'risk';
  readonly rows: readonly ReportRow[];
}

/** The small figure under a key figure. */
export type KeyFigureDetail =
  | { readonly kind: 'percent'; readonly value: MetricValue | undefined }
  | {
      readonly kind: 'sides';
      readonly long: MetricValue | undefined;
      readonly short: MetricValue | undefined;
    }
  | {
      readonly kind: 'wonLost';
      readonly won: MetricValue | undefined;
      readonly lost: MetricValue | undefined;
    }
  | { readonly kind: 'metric'; readonly id: string; readonly value: MetricValue | undefined };

export interface KeyFigure {
  readonly id: string;
  readonly show: Part;
  readonly loss: boolean;
  readonly value: MetricValue | undefined;
  readonly detail: KeyFigureDetail;
}

/** The Report tab (B1): six key figures over the Returns, Trades and Risk groups. */
export interface StrategyReport {
  readonly keyFigures: readonly KeyFigure[];
  readonly groups: readonly ReportGroup[];
}

type RowSpec = readonly [id: string, show: Part, loss?: 'loss'];

const groupSpecs: readonly (readonly [ReportGroup['id'], readonly RowSpec[]])[] = [
  [
    'returns',
    [
      ['Performance/Net profit', 'value'],
      ['Performance/Gross profit', 'value'],
      ['Performance/Gross loss', 'value', 'loss'],
      ['Performance/Commission paid', 'value'],
      ['Performance/Buy and hold PnL', 'percent'],
      ['Performance/Max run-up (intrabar)', 'value'],
      ['Performance/Max drawdown (intrabar)', 'value', 'loss'],
      ['Performance/Open PnL', 'value'],
    ],
  ],
  [
    'trades',
    [
      ['Trades analysis/Total trades', 'value'],
      ['Trades analysis/Total winners', 'value'],
      ['Trades analysis/Total losers', 'value'],
      ['Trades analysis/Percent profitable', 'percent'],
      ['Trades analysis/Average PnL', 'value'],
      ['Trades analysis/Average profit', 'value'],
      ['Trades analysis/Average loss', 'value', 'loss'],
      ['Trades analysis/Average profit / average loss', 'value'],
    ],
  ],
  [
    'risk',
    [
      ['Risk-adjusted performance/Sharpe ratio', 'value'],
      ['Risk-adjusted performance/Sortino ratio', 'value'],
      ['Risk-adjusted performance/Profit factor', 'value'],
      ['Trades analysis/Largest profit', 'value'],
      ['Trades analysis/Largest loss', 'value', 'loss'],
      ['Trades analysis/Average bars in trades', 'value'],
      ['Performance/Max contracts held', 'value'],
      ['Risk-adjusted performance/Margin calls', 'value'],
    ],
  ],
];

export function strategyReport(metrics: RunResult['metrics']): StrategyReport {
  const rows = new Map<string, MetricRow>(metricRows(metrics).map((row) => [row.id, row]));
  const cell = (id: string, scope: 'all' | 'long' | 'short', show: Part = 'value') =>
    rows.get(id)?.[scope][show];
  const row = ([id, show, loss]: RowSpec): ReportRow => ({
    id,
    show,
    loss: loss === 'loss',
    all: cell(id, 'all', show),
    long: cell(id, 'long', show),
    short: cell(id, 'short', show),
  });
  const figure = (spec: RowSpec, detail: KeyFigureDetail): KeyFigure => {
    const [id, show, loss] = spec;
    return { id, show, loss: loss === 'loss', value: cell(id, 'all', show), detail };
  };
  const netProfit = 'Performance/Net profit';
  const maxDrawdown = 'Performance/Max drawdown (intrabar)';
  const profitFactor = 'Risk-adjusted performance/Profit factor';
  const totalTrades = 'Trades analysis/Total trades';
  return {
    keyFigures: [
      figure([netProfit, 'value'], { kind: 'percent', value: cell(netProfit, 'all', 'percent') }),
      figure([maxDrawdown, 'value', 'loss'], {
        kind: 'percent',
        value: cell(maxDrawdown, 'all', 'percent'),
      }),
      figure([profitFactor, 'value'], {
        kind: 'sides',
        long: cell(profitFactor, 'long'),
        short: cell(profitFactor, 'short'),
      }),
      figure(['Trades analysis/Percent profitable', 'percent'], {
        kind: 'wonLost',
        won: cell('Trades analysis/Total winners', 'all'),
        lost: cell('Trades analysis/Total losers', 'all'),
      }),
      figure([totalTrades, 'value'], {
        kind: 'sides',
        long: cell(totalTrades, 'long'),
        short: cell(totalTrades, 'short'),
      }),
      figure(['Risk-adjusted performance/Sharpe ratio', 'value'], {
        kind: 'metric',
        id: 'Risk-adjusted performance/Sortino ratio',
        value: cell('Risk-adjusted performance/Sortino ratio', 'all'),
      }),
    ],
    groups: groupSpecs.map(([id, specs]) => ({ id, rows: specs.map(row) })),
  };
}

/** The caller translates section titles and column headers; metric names stay engine English. */
export type ReportCsvHeaders = Readonly<
  Record<'metric' | 'all' | 'long' | 'short' | 'keyFigures' | ReportGroup['id'], string>
>;

/**
 * Four columns per section, in report order. Key-figure details get separate metric rows except
 * side breakdowns, which occupy Long/Short. Percentages carry %, loss magnitudes print negative,
 * and absent/nonfinite cells stay empty. Numeric precision follows the other workflow exports.
 */
export function reportCsv(report: StrategyReport, headers: ReportCsvHeaders): string {
  const lines: string[][] = [];
  const section = (id: 'keyFigures' | ReportGroup['id']) => {
    if (lines.length) lines.push(['', '', '', '']);
    lines.push(
      [headers[id], '', '', ''],
      [headers.metric, headers.all, headers.long, headers.short],
    );
  };
  const cell = (value: MetricValue | undefined, show: Part, loss: boolean): string => {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (!Number.isFinite(value)) return '';
    return csvNumber(loss ? -Math.abs(value) : value) + (show === 'percent' ? '%' : '');
  };
  const row = (
    id: string,
    show: Part,
    loss: boolean,
    all: MetricValue | undefined,
    long?: MetricValue,
    short?: MetricValue,
  ) => {
    lines.push([
      id.slice(id.indexOf('/') + 1),
      cell(all, show, loss),
      cell(long, show, loss),
      cell(short, show, loss),
    ]);
  };
  section('keyFigures');
  for (const figure of report.keyFigures) {
    const detail = figure.detail;
    row(
      figure.id,
      figure.show,
      figure.loss,
      figure.value,
      detail.kind === 'sides' ? detail.long : undefined,
      detail.kind === 'sides' ? detail.short : undefined,
    );
    if (detail.kind === 'percent') row(figure.id, 'percent', figure.loss, detail.value);
    else if (detail.kind === 'metric') row(detail.id, 'value', false, detail.value);
    else if (detail.kind === 'wonLost') {
      row('Trades analysis/Total winners', 'value', false, detail.won);
      row('Trades analysis/Total losers', 'value', false, detail.lost);
    }
  }
  for (const group of report.groups) {
    section(group.id);
    for (const metric of group.rows)
      row(metric.id, metric.show, metric.loss, metric.all, metric.long, metric.short);
  }
  return csvText(lines);
}

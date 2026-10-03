import type { RunResult } from '@pine/engine';

export type MetricValue = number | string | null;
export interface MetricCell {
  value?: MetricValue;
  percent?: MetricValue;
  /** The key's own unit suffix, such as the account currency; empty when it has none. */
  unit?: string;
  valueKey?: string;
  percentKey?: string;
}
/** One report metric with its All / Long / Short cells, keyed as `Section/Name`. */
export interface MetricRow {
  id: string;
  section: string;
  name: string;
  all: MetricCell;
  long: MetricCell;
  short: MetricCell;
}

/** TradingView's report order: sections first, then these metrics, then the rest as given. */
const sections = ['Performance', 'Trades analysis', 'Risk-adjusted performance'];
const priority = [
  'Net profit',
  'Gross profit',
  'Gross loss',
  'Commission paid',
  'Buy and hold PnL',
  'Max run-up (intrabar)',
  'Max drawdown (intrabar)',
  'Max contracts held',
  'Open PnL',
  'Total trades',
  'Total winners',
  'Total losers',
  'Percent profitable',
  'Average PnL',
  'Average profit',
  'Average loss',
  'Average profit / average loss',
  'Largest profit',
  'Largest loss',
  'Average bars in trades',
  'Average bars in winners',
  'Average bars in losers',
  'Sharpe ratio',
  'Sortino ratio',
  'Profit factor',
  'Margin calls',
];

/** Parsing and sorting ~350 metric keys repeats per trial; rows are memoized per metrics object. */
const rowsCache = new WeakMap<object, MetricRow[]>();

/**
 * Group engine metric keys (`Section/Name/Scope unit`) into report rows without deriving,
 * rounding, changing signs or replacing nulls. Returned rows are shared; do not mutate them.
 */
export function metricRows(metrics: RunResult['metrics']): readonly MetricRow[] {
  let rows = rowsCache.get(metrics);
  if (!rows) {
    rows = buildMetricRows(metrics);
    rowsCache.set(metrics, rows);
  }
  return rows;
}

function buildMetricRows(metrics: RunResult['metrics']): MetricRow[] {
  const rows = new Map<string, MetricRow>();
  for (const [key, value] of Object.entries(metrics)) {
    const firstSlash = key.indexOf('/'),
      lastSlash = key.lastIndexOf('/');
    const section = firstSlash < 0 ? 'Other' : key.slice(0, firstSlash);
    const name = firstSlash < 0 ? key : key.slice(firstSlash + 1, lastSlash);
    const scope = firstSlash < 0 ? 'All' : key.slice(lastSlash + 1).split(' ')[0];
    const unit = firstSlash < 0 ? '' : key.slice(lastSlash + 1 + scope.length).trim();
    const id = `${section}/${name}`;
    let row = rows.get(id);
    if (!row) {
      row = { id, section, name, all: {}, long: {}, short: {} };
      rows.set(id, row);
    }
    const cell = row[scope === 'Long' ? 'long' : scope === 'Short' ? 'short' : 'all'];
    if (unit === '%') {
      cell.percent = value;
      cell.percentKey = key;
    } else {
      cell.value = value;
      cell.valueKey = key;
      cell.unit = unit;
    }
  }
  const rank = (name: string) => (priority.indexOf(name) < 0 ? 1000 : priority.indexOf(name));
  return [...rows.values()].sort(
    (a, b) =>
      (sections.indexOf(a.section) < 0 ? 10 : sections.indexOf(a.section)) -
        (sections.indexOf(b.section) < 0 ? 10 : sections.indexOf(b.section)) ||
      rank(a.name) - rank(b.name),
  );
}

/** Look up an objective by its engine report name; prefer currency or percent explicitly. */
export function metricValue(
  metrics: RunResult['metrics'],
  name: string,
  scope: 'All' | 'Long' | 'Short' = 'All',
  percent = false,
): number | null {
  const row = metricRows(metrics).find((item) => item.name === name);
  const cell = row?.[scope === 'Long' ? 'long' : scope === 'Short' ? 'short' : 'all'];
  const value = percent ? cell?.percent : cell?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

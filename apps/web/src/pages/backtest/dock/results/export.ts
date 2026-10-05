import {
  reportCsv,
  type ReportCsvHeaders,
  type StrategyReport,
} from '../../../../workflows/report.ts';
import { tradesCsv, type TradeCsvColumn, type TradeRow } from '../../../../workflows/trades.ts';

/** Export schemas stay English and independent of translated UI copy. */
const reportHeaders: ReportCsvHeaders = {
  metric: 'Metric',
  all: 'All',
  long: 'Long',
  short: 'Short',
  keyFigures: 'Key figures',
  returns: 'Returns',
  trades: 'Trades',
  risk: 'Risk',
};
const tradeHeaders: Readonly<Record<TradeCsvColumn, string>> = {
  number: '#',
  side: 'Side',
  entryTime: 'Entry UTC',
  entryPrice: 'Entry price',
  exitTime: 'Exit UTC',
  exitPrice: 'Exit price',
  quantity: 'Qty',
  pnl: 'P&L',
  pnlPercent: 'P&L %',
  cumulativePnl: 'Cumulative',
  bars: 'Bars',
};

export function reportExport(report: StrategyReport): string {
  return reportCsv(report, reportHeaders);
}

/** The workflow owns CSV escaping and values; this boundary supplies the stable English schema. */
export function tradeExport(rows: readonly TradeRow[]): string {
  return tradesCsv(rows, tradeHeaders, { long: 'Long', short: 'Short' });
}

export function downloadCsv(csv: string, filename: string): void {
  // A BOM lets spreadsheet applications detect UTF-8 even when data contains non-ASCII text.
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to begin reading the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

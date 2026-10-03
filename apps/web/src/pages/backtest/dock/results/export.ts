import { translateId, type Language } from '../../../../i18n/translate.ts';
import { reportCsv, type StrategyReport } from '../../../../workflows/report.ts';
import {
  tradeCsvColumns,
  tradesCsv,
  type TradeCsvColumn,
  type TradeRow,
} from '../../../../workflows/trades.ts';

export function reportExport(report: StrategyReport, language: Language): string {
  return reportCsv(report, {
    metric: translateId('report.metric', language),
    all: translateId('report.all', language),
    long: translateId('report.long', language),
    short: translateId('report.short', language),
    keyFigures: translateId('report.keyFigures', language),
    returns: translateId('report.returns', language),
    trades: translateId('report.trades', language),
    risk: translateId('report.risk', language),
  });
}

/** The workflow owns CSV escaping and values; this boundary supplies the localized columns. */
export function tradeExport(rows: readonly TradeRow[], language: Language): string {
  const header = Object.fromEntries(
    tradeCsvColumns.map((column) => [column, translateId(`trades.${column}`, language)]),
  ) as Record<TradeCsvColumn, string>;
  return tradesCsv(rows, header, {
    long: translateId('trades.long', language),
    short: translateId('trades.short', language),
  });
}

export function downloadCsv(csv: string, filename: string): void {
  // A BOM lets spreadsheet applications detect Chinese headers as UTF-8.
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

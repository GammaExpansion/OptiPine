import { translateId, type Language } from '../../../../i18n/translate.ts';
import {
  tradeCsvColumns,
  tradesCsv,
  type TradeCsvColumn,
  type TradeRow,
} from '../../../../workflows/trades.ts';

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

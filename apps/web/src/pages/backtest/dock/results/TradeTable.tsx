import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Icon } from '../../../../components/Icon.tsx';
import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import { useSelectionStore } from '../../../../state/selection.ts';
import { tradeCsvColumns, type TradeRow } from '../../../../workflows/trades.ts';
import { numberMessage, profitTone, tradeTime } from './formatting.ts';
import styles from './Results.module.css';

const rowHeight = 30;
const widths = [44, 48, 136, 86, 136, 86, 74, 96, 76, 96, 52, 36];

/** Only visible rows mount. Roving focus stays on the grid as rows recycle during scrolling. */
export function TradeTable({
  rows,
  view,
  filterKey = '',
}: {
  rows: readonly TradeRow[];
  view?: { scrollTop: number };
  filterKey?: string;
}) {
  const { t, text } = useI18n();
  const hoverTrade = useSelectionStore((state) => state.hoverTrade);
  const focusTrade = useSelectionStore((state) => state.focusTrade);
  const focused = useSelectionStore((state) => state.focusedTrade?.trade);
  const [selected, setSelected] = useState<number | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const previousFilter = useRef(filterKey);
  const id = useId();
  const columns = useMemo<ColumnDef<TradeRow>[]>(
    () => [
      ...tradeCsvColumns.map((column): ColumnDef<TradeRow> => ({
        id: column,
        accessorKey: column,
        header: t(`trades.${column}`),
        cell: ({ row }) => {
          const trade = row.original;
          if (column === 'side')
            return (
              <span data-tone={trade.side === 'long' ? 'profit' : 'loss'} className={styles.side}>
                {t(`trades.${trade.side}`)}
              </span>
            );
          if (column === 'entryTime' || column === 'exitTime')
            return (
              <span className={column === 'exitTime' && trade.open ? styles.open : undefined}>
                {text(tradeTime(trade[column]))}
              </span>
            );
          const value = trade[column];
          const signed = column === 'pnl' || column === 'pnlPercent' || column === 'cumulativePnl';
          return (
            <span
              data-tone={
                column === 'pnl' || column === 'pnlPercent' ? profitTone(value) : undefined
              }
              className={column === 'exitPrice' && trade.open ? styles.caption : undefined}
            >
              {text(
                numberMessage(value, {
                  decimals:
                    column === 'number' || column === 'bars' ? 0 : column === 'quantity' ? 4 : 2,
                  signed,
                  percent: column === 'pnlPercent',
                }),
              )}
            </span>
          );
        },
      })),
      {
        id: 'locate',
        header: () => <span className={styles.actionHeading}>{t('sheet.icon.locate')}</span>,
        cell: ({ row }) => (
          <button
            className={styles.locate}
            tabIndex={-1}
            aria-label={t('trades.locate', { number: row.original.number })}
            onClick={(event) => {
              event.stopPropagation();
              setSelected(row.original.number);
              focusTrade(row.original.number);
              scroll.current?.focus({ preventScroll: true });
            }}
          >
            <Icon name="locate" size={13} />
          </button>
        ),
      },
    ],
    [t, text, focusTrade],
  );
  const table = useReactTable({
    data: rows as TradeRow[],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.number),
  });
  const model = table.getRowModel().rows;
  const virtual = useVirtualizer({
    count: model.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => rowHeight,
    getItemKey: (index) => model[index].id,
    overscan: 8,
    scrollMargin: rowHeight,
    scrollPaddingStart: rowHeight,
    initialOffset: view?.scrollTop ?? 0,
  });
  const items = virtual.getVirtualItems();
  const selectedIndex = useMemo(
    () => rows.findIndex((row) => row.number === selected),
    [rows, selected],
  );
  const activeIndex = selectedIndex < 0 ? 0 : selectedIndex;
  const active = model[activeIndex]?.original.number;
  const visibleActive = items.some((item) => item.index === activeIndex);
  useEffect(() => {
    setSelected(null);
    hoverTrade(null);
    return () => hoverTrade(null);
  }, [rows, hoverTrade]);
  useLayoutEffect(() => {
    const element = scroll.current!;
    const top = previousFilter.current === filterKey ? (view?.scrollTop ?? 0) : 0;
    previousFilter.current = filterKey;
    element.scrollTop = Math.min(top, Math.max(0, element.scrollHeight - element.clientHeight));
    if (view) view.scrollTop = element.scrollTop;
  }, [rows, view, filterKey]);
  return (
    <div
      ref={scroll}
      className={styles.tradeScroll}
      role="grid"
      tabIndex={0}
      aria-label={t('trades.table')}
      aria-rowcount={rows.length + 1}
      aria-colcount={columns.length}
      aria-activedescendant={visibleActive ? `${id}-${active}` : undefined}
      onMouseLeave={() => hoverTrade(null)}
      onScroll={() => {
        if (view) view.scrollTop = scroll.current!.scrollTop;
        hoverTrade(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && active !== undefined) {
          event.preventDefault();
          focusTrade(active);
          return;
        }
        let next: number;
        if (event.key === 'ArrowDown') next = Math.min(rows.length - 1, activeIndex + 1);
        else if (event.key === 'ArrowUp') next = Math.max(0, activeIndex - 1);
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = rows.length - 1;
        else return;
        event.preventDefault();
        if (!model[next]) return;
        setSelected(model[next].original.number);
        virtual.scrollToIndex(next, { align: 'auto' });
      }}
    >
      <div className={styles.tradeTable}>
        <div className={styles.tradeHeader} role="row" aria-rowindex={1}>
          {table.getHeaderGroups()[0].headers.map((header, index) => (
            <div
              key={header.id}
              role="columnheader"
              style={{ flex: `${widths[index]} 0 0` }}
              data-column={header.id}
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
            </div>
          ))}
        </div>
        <div
          className={styles.tradeRows}
          role="rowgroup"
          style={{ height: virtual.getTotalSize() }}
        >
          {items.map((item) => {
            const row = model[item.index];
            const trade = row.original;
            return (
              <div
                key={row.id}
                id={`${id}-${trade.number}`}
                role="row"
                aria-rowindex={item.index + 2}
                aria-selected={active === trade.number}
                data-focused={focused === trade.number}
                data-trade={trade.number}
                className={styles.tradeRow}
                style={{ transform: `translateY(${item.start - rowHeight}px)`, height: rowHeight }}
                onMouseEnter={() => hoverTrade(trade.number)}
                onMouseLeave={() => hoverTrade(null)}
                onClick={() => {
                  setSelected(trade.number);
                  focusTrade(trade.number);
                  scroll.current?.focus({ preventScroll: true });
                }}
              >
                {row.getVisibleCells().map((cell, index) => (
                  <div
                    key={cell.id}
                    role="gridcell"
                    style={{ flex: `${widths[index]} 0 0` }}
                    data-column={cell.column.id}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

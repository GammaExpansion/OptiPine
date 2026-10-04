/** The leaderboard with its filter chips and pages (R1, R4, R9–R11). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Button } from '../../../components/Button.tsx';
import { Chip } from '../../../components/Chip.tsx';
import { EmptyState } from '../../../components/EmptyState.tsx';
import { IconButton } from '../../../components/IconButton.tsx';
import { Popover } from '../../../components/Popover.tsx';
import { Table } from '../../../components/Table.tsx';
import { Tag } from '../../../components/Tag.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { useUiStore } from '../../../state/ui.ts';
import { useLayout } from '../../../shell/useLayout.ts';
import type { LeaderboardRow } from '../../../workflows/optimize-views.ts';
import { AddConditionTrigger } from '../filters/AddConditionTrigger.tsx';
import { inputColumns } from './column-layout.ts';
import { LeaderboardCards } from './LeaderboardCards.tsx';
import { useResultFormat } from './useResultFormat.ts';
import styles from './Leaderboard.module.css';

const noRows: LeaderboardRow[] = [];

export function LeaderboardPanel() {
  const { t } = useI18n();
  const phone = useLayout() === 'phone';
  const views = useOptimizationStore((state) => state.views);
  const format = useResultFormat(views?.searchRows);
  const settings = useOptimizationStore((state) => state.viewSettings);
  const actions = useOptimizationStore((state) => state.actions);
  const failures = useOptimizationStore((state) => state.results?.failures.length ?? 0);
  const running = useOptimizationStore((state) => state.run.status === 'running');
  const setDialogOpen = useUiStore((state) => state.setDialogOpen);
  const container = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(624);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const board = views?.leaderboard;
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [board?.page]);
  // Every view, a selection's included, brings an equal but new `board.columns`. Column definitions
  // rebuilt from it would be new cell components to the table, which would remount every cell and
  // take the focus from the selected row's button; so they follow the titles' content instead.
  const titles = board?.columns ?? [];
  const titlesKey = JSON.stringify(titles);
  const searchRows = views?.searchRows;
  const columns = useMemo<ColumnDef<LeaderboardRow>[]>(() => {
    const layout = inputColumns(titles, width, !views?.unvalidated);
    const value = (amount: number | null, signed: boolean, digits: number) => (
      <span data-profit={signed && amount != null ? amount >= 0 : undefined}>
        {format.number(amount, signed, digits)}
      </span>
    );
    return [
      {
        id: 'rank',
        header: t('optimize.leaderboard.rank'),
        cell: ({ row }) => (
          <button
            className={styles.rank}
            aria-label={t('optimize.leaderboard.select', { rank: row.original.rank })}
            onClick={() => actions.select(row.original.trialId)}
          >
            {row.original.rank}
          </button>
        ),
      },
      ...layout.visible.map((title): ColumnDef<LeaderboardRow> => ({
        id: `input:${title}`,
        header: title,
        cell: ({ row }) => format.parameter(row.original.parameters[title], title),
      })),
      ...(layout.hidden.length
        ? [
            {
              id: 'more',
              header: t('optimize.leaderboard.more', { count: layout.hidden.length }),
              cell: ({ row }: { row: { original: LeaderboardRow } }) => (
                <Popover
                  label={t('optimize.leaderboard.parameters')}
                  trigger={
                    <Button variant="link" className={styles.more}>
                      {t('optimize.leaderboard.more', { count: layout.hidden.length })}
                    </Button>
                  }
                >
                  <dl className={styles.parameters} onClick={(event) => event.stopPropagation()}>
                    {layout.hidden.map((title) => (
                      <div key={title}>
                        <dt>{title}</dt>
                        <dd>{format.parameter(row.original.parameters[title], title)}</dd>
                      </div>
                    ))}
                  </dl>
                </Popover>
              ),
            },
          ]
        : []),
      {
        id: 'in',
        header: t(views?.unvalidated ? 'optimize.leaderboard.net' : 'optimize.leaderboard.in'),
        cell: ({ row }) => value(row.original.inSample.netProfit, true, 0),
      },
      ...(!views?.unvalidated
        ? [
            {
              id: 'out',
              header: t('optimize.leaderboard.out'),
              cell: ({ row }: { row: { original: LeaderboardRow } }) =>
                value(row.original.outOfSample?.netProfit ?? null, true, 0),
            },
          ]
        : []),
      {
        id: 'pf',
        header: t('optimize.leaderboard.pf'),
        cell: ({ row }) => value(row.original.inSample.profitFactor, false, 2),
      },
      {
        id: 'dd',
        header: t('optimize.leaderboard.dd'),
        cell: ({ row }) => format.drawdown(row.original.inSample.maxDrawdownPercent),
      },
      {
        id: 'trades',
        header: t('optimize.leaderboard.trades'),
        cell: ({ row }) => value(row.original.inSample.trades, false, 0),
      },
    ];
    // `titles` and `format` change with `titlesKey` and `searchRows`.
  }, [titlesKey, searchRows, width, views?.unvalidated, t, actions]);
  const table = useReactTable({
    data: (board?.rows ?? noRows) as LeaderboardRow[],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.trialId,
  });
  return (
    <section ref={container} className={styles.panel} aria-label={t('optimize.leaderboard.title')}>
      <div className={styles.heading}>
        <h2>{t('optimize.leaderboard.title')}</h2>
        <span>
          {t('optimize.leaderboard.pass', {
            passing: board?.passing ?? 0,
            total: board?.total ?? 0,
          })}
        </span>
        <div className={styles.filters}>
          {views?.unvalidated && <Tag tone="amber">{t('optimize.summary.unvalidated')}</Tag>}
          {settings.filters.map((filter, index) => (
            <Chip
              key={index}
              label={format.condition(filter)}
              bad={views?.filterDiagnosis[index]?.passing === 0}
              onRemove={() => actions.removeFilter(index)}
              removeLabel={t('optimize.leaderboard.removeFilter', {
                condition: format.condition(filter),
              })}
            />
          ))}
          <AddConditionTrigger />
        </div>
        {views?.pending && <span role="status">{t('optimize.leaderboard.pending')}</span>}
        {!!(views?.inProgress ? views.failed : failures) && (
          <Button
            variant="link"
            tone="danger"
            disabled={running}
            disabledReason={t('optimize.selection.wait')}
            onClick={() => setDialogOpen('failedCombinations', true)}
          >
            {t('optimize.leaderboard.failed', {
              count: views?.inProgress ? views.failed : failures,
            })}
          </Button>
        )}
      </div>
      <div ref={body} className={styles.body} aria-busy={views?.pending}>
        {board && board.passing === 0 ? (
          <div className={styles.empty}>
            <EmptyState title={t('optimize.leaderboard.empty')}>
              {t('optimize.leaderboard.emptyHint')}
            </EmptyState>
            <div className={styles.diagnosis}>
              {views.filterDiagnosis.map((diagnosis, index) => (
                <div key={index}>
                  <strong>{format.condition(diagnosis.filter)}</strong>
                  <div>
                    <p>{t('optimize.leaderboard.alone', { count: diagnosis.passing })}</p>
                    {diagnosis.best !== null && (
                      <p className={styles.loss}>
                        {t('optimize.leaderboard.best', {
                          value: format.metricValue(diagnosis.filter.metric, diagnosis.best),
                        })}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="link"
                    disabled={views.pending}
                    onClick={() => actions.removeFilter(index)}
                  >
                    {t('optimize.leaderboard.remove')}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : phone ? (
          <LeaderboardCards
            rows={board?.rows ?? noRows}
            searchRows={views?.searchRows ?? []}
            selectedId={views?.selection?.row.trialId}
            unvalidated={!!views?.unvalidated}
            onSelect={actions.select}
          />
        ) : (
          <Table
            variant="leaderboard"
            caption={t('optimize.leaderboard.title')}
            title={t('optimize.leaderboard.ranking', {
              metric: t(`optimize.leaderboard.metric.${settings.objective}`),
              direction: t(`optimize.leaderboard.${settings.direction}`),
            })}
          >
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id} scope="col">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-selected={views?.selection?.row.trialId === row.id || undefined}
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest('button')) actions.select(row.id);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <footer className={styles.footer}>
        <span>
          {t('optimize.leaderboard.rows', {
            first: board?.rows[0]?.rank ?? 0,
            last: board?.rows.at(-1)?.rank ?? 0,
            total: board?.passing ?? 0,
          })}
        </span>
        <div>
          <IconButton
            icon="left"
            label={t('optimize.leaderboard.previous')}
            disabled={!board || board.page === 0}
            onClick={() => actions.setPage((board?.page ?? 0) - 1)}
          />
          <span>
            {t('optimize.leaderboard.pagination', {
              page: (board?.page ?? 0) + 1,
              pages: board?.pageCount ?? 1,
            })}
          </span>
          <IconButton
            icon="right"
            label={t('optimize.leaderboard.next')}
            disabled={!board || board.page + 1 >= board.pageCount}
            onClick={() => actions.setPage((board?.page ?? 0) + 1)}
          />
        </div>
      </footer>
    </section>
  );
}

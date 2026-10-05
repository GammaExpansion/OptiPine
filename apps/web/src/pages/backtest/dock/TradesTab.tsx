import { useMemo, useState } from 'react';
import { IconButton } from '../../../components/IconButton.tsx';
import { Select } from '../../../components/Select.tsx';
import { SegmentedControl } from '../../../components/SegmentedControl.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../state/backtest.ts';
import {
  filterTrades,
  type PnlFilter,
  type SideFilter,
  type TradeRow,
} from '../../../workflows/trades.ts';
import { displayedResult, tradesFor } from './results/model.ts';
import { ResultFrame } from './results/ResultFrame.tsx';
import { TradeTable } from './results/TradeTable.tsx';
import { downloadCsv, tradeExport } from './results/export.ts';
import { DockActions } from './DockActions.tsx';
import styles from './results/Results.module.css';

const noRows: readonly TradeRow[] = [];

export function TradesTab() {
  const { t } = useI18n();
  const result = useBacktestStore(displayedResult);
  const [side, setSide] = useState<SideFilter>('all');
  const [pnl, setPnl] = useState<PnlFilter>('all');
  const rows = result ? tradesFor(result) : noRows;
  const list = useMemo(() => filterTrades(rows, { side, pnl }), [rows, side, pnl]);
  return (
    <ResultFrame>
      <DockActions>
        <IconButton
          icon="download"
          label={t('trades.export')}
          onClick={() => downloadCsv(tradeExport(list.rows), t('trades.filename'))}
        />
      </DockActions>
      <div className={styles.tradeToolbar}>
        <SegmentedControl
          small
          label={t('trades.side')}
          value={side}
          onChange={(value) => setSide(value as SideFilter)}
          options={(['all', 'long', 'short'] as const).map((value) => ({
            value,
            label: t(`trades.${value}`),
          }))}
        />
        <Select
          className={styles.pnlFilter}
          label={t('trades.pnlFilter')}
          value={pnl}
          onChange={(value) => setPnl(value as PnlFilter)}
          options={(['all', 'profit', 'loss'] as const).map((value) => ({
            value,
            label: t(value === 'all' ? 'trades.pnlAll' : `trades.${value}`),
          }))}
        />
        <span className={styles.caption}>
          {t('trades.counts', { closed: list.closedCount, open: list.openCount })}
        </span>
      </div>
      {list.rows.length ? (
        <TradeTable rows={list.rows} key={`${result?.finishedAt}-${side}-${pnl}`} />
      ) : (
        <div className={styles.empty}>
          <strong>{t(rows.length ? 'trades.noMatches' : 'trades.empty')}</strong>
          {!rows.length && <span>{t('trades.emptyHint')}</span>}
        </div>
      )}
    </ResultFrame>
  );
}

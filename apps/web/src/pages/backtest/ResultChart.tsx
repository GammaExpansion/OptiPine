import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlotOutput } from '@pine/engine';
import { PriceChart, type PriceChartHandle } from '../../charts/PriceChart.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useSelectionStore } from '../../state/selection.ts';
import { useBacktestStore } from '../../state/backtest.ts';
import { tradeRows, type TradeRow } from '../../workflows/trades.ts';
import { ChartNoteCard } from './states/ChartNoteCard.tsx';
import { timeframeLabel, tradeContext, type ChartView } from './states/chart-view.ts';
import styles from './ChartArea.module.css';

// Stable empties: the chart reloads its series whenever these arrays change.
const noPlots: readonly PlotOutput[] = [];
const noTrades: readonly TradeRow[] = [];

/**
 * The price chart with the shown result (B1, B6–B12), wired to the Trades tab's hover and focus.
 * It loads in a chunk of its own with Lightweight Charts, so the first-launch screen does not wait.
 */
export function ResultChart({ view }: { view: Extract<ChartView, { kind: 'chart' }> }) {
  const { t } = useI18n();
  const chart = useRef<PriceChartHandle>(null);
  const [markers, setMarkers] = useState(true);
  const dimMarkers = useBacktestStore(
    (state) =>
      (state.preview?.run ?? state.run).status === 'running' ||
      (!state.preview && Boolean(state.outdated?.reasons.length)),
  );
  const { input, result, note } = view;
  const trades = useMemo(
    () => (result ? tradeRows(result.output.trades, tradeContext(input)) : noTrades),
    [result, input],
  );
  const hovered = useSelectionStore((state) => state.hoveredTrade);
  const focused = useSelectionStore((state) => state.focusedTrade);
  const hoveredRow = useMemo(
    () => (markers && hovered !== null ? trades.find((row) => row.number === hovered) : null),
    [markers, hovered, trades],
  );
  // Only focus requests made while the chart is mounted move it.
  const focusedSeq = useRef(focused?.seq);
  useEffect(() => {
    if (!focused || focused.seq === focusedSeq.current) return;
    focusedSeq.current = focused.seq;
    const row = trades.find((item) => item.number === focused.trade);
    if (row) chart.current?.focusTrade(row);
  }, [focused, trades]);
  const ticker = typeof input.syminfo.ticker === 'string' ? input.syminfo.ticker : '';
  return (
    <div className={styles.area}>
      <PriceChart
        ref={chart}
        bars={input.bars}
        plots={result?.output.plots ?? noPlots}
        trades={markers ? trades : noTrades}
        hoveredTrade={hoveredRow ?? null}
        symbol={ticker}
        timeframe={timeframeLabel(input.timeframe)}
        dimMarkers={dimMarkers}
        timezone={input.syminfo.timezone ?? 'Etc/UTC'}
        mintick={input.syminfo.mintick}
      />
      {result && (
        <div className={styles.tools}>
          <IconButton
            icon="marks"
            label={t('run.tradeMarkers')}
            active={markers}
            onClick={() => setMarkers(!markers)}
          />
          <IconButton
            icon="fit"
            label={t('run.resetZoom')}
            onClick={() => chart.current?.resetView()}
          />
        </div>
      )}
      {note && <ChartNoteCard note={note} />}
    </div>
  );
}

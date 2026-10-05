import { useI18n } from '../../../i18n/I18nProvider.tsx';
import type { ReactNode } from 'react';
import { EquityCharts } from '../../../charts/EquityCharts.tsx';
import { formatDate } from '../../../i18n/translate.ts';
import { useBacktestStore } from '../../../state/backtest.ts';
import { useUiStore } from '../../../state/ui.ts';
import { displayedResult, equityFor } from './results/model.ts';
import { numberMessage, profitTone } from './results/formatting.ts';
import { ResultFrame } from './results/ResultFrame.tsx';
import { backtestViewMemory } from '../states/view-memory.ts';
import styles from './results/Results.module.css';

export function EquityTab() {
  const { t, text } = useI18n();
  const result = useBacktestStore(displayedResult);
  const view = useBacktestStore(backtestViewMemory);
  const maximized = useUiStore((state) => state.paneSizes.backtest.chart === 0);
  const equity = result && equityFor(result);
  if (!equity) return <ResultFrame empty account />;
  const { input, summary } = equity;
  const dd = summary.maxDrawdown;
  const number = (
    value: number | null | undefined,
    decimals = 0,
    signed = false,
    percent = false,
  ) => text(numberMessage(value, { decimals, signed, percent }));
  const fact = (label: string, value: ReactNode, detail?: ReactNode, tone?: string) => (
    <div className={styles.fact}>
      <span className={styles.caption}>{label}</span>
      <div>
        <strong data-tone={tone}>{value}</strong>
        {detail && <span className={styles.caption}>{detail}</span>}
      </div>
    </div>
  );
  return (
    <ResultFrame account>
      <EquityCharts
        className={styles.equity}
        input={input}
        view={view?.equity}
        summary={summary}
        showAttribution={maximized}
        afterToolbar={
          <div className={styles.facts}>
            {fact(
              t('equity.endingEquity'),
              number(summary.endingEquity),
              number(summary.totalReturn, 2, true, true),
              profitTone(summary.totalReturn),
            )}
            {fact(
              t('equity.annualizedReturn'),
              number(summary.annualizedReturn, 2, true, true),
              t('equity.years', { value: number(summary.years, 2), count: summary.years }),
            )}
            {fact(
              t('equity.maxDrawdown'),
              text(numberMessage(dd?.amount ?? 0, { decimals: 0, loss: true })),
              dd && t('equity.from', { date: formatDate(dd.peak.time * 1000) }),
              dd ? 'loss' : 'neutral',
            )}
            {fact(
              t('equity.duration'),
              t('equity.days', {
                value: number(dd?.durationDays ?? 0),
                count: dd?.durationDays ?? 0,
              }),
              dd && !dd.recovery ? t('equity.notRecovered') : undefined,
              dd && !dd.recovery ? 'amber' : undefined,
            )}
            {fact(t('equity.returnDrawdown'), number(summary.returnOverMaxDrawdown, 2))}
            {fact(
              t('equity.winningLosing'),
              t('equity.pair', {
                first: number(summary.winningDays),
                second: number(summary.losingDays),
              }),
            )}
            {fact(
              t('equity.bestWorst'),
              <>
                <span data-tone={profitTone(summary.bestDay?.pnl)}>
                  {number(summary.bestDay?.pnl, 0, true)}
                </span>
                {t('equity.slash')}
                <span data-tone={profitTone(summary.worstDay?.pnl)}>
                  {number(summary.worstDay?.pnl, 0, true)}
                </span>
              </>,
            )}
          </div>
        }
      />
    </ResultFrame>
  );
}

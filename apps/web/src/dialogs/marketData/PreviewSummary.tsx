import type { DatasetInput } from '../../workflows/backtest.ts';
import { KeyValueRow } from '../../components/KeyValueRow.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { formatDate, formatNumber } from '../../i18n/translate.ts';
import { previewPoints } from './preview-points.ts';
import { timeframeIds } from './timeframes.ts';
import styles from './DataDialog.module.css';

export function PreviewSummary({ input, badge }: { input: DatasetInput; badge: string }) {
  const { t } = useI18n();
  const { bars, sessionCalendar } = input;
  const symbol = String(input.syminfo.ticker ?? input.syminfo.tickerid ?? '').trim();
  const points = previewPoints(bars, 440, 100);
  const days = sessionCalendar
    ? new Set(sessionCalendar.sessions.map((session) => session.tradingDay)).size
    : 0;
  return (
    <>
      <div className={styles.previewHead}>
        <strong>
          {t(symbol ? 'data.previewFor' : 'data.previewTimeframe', {
            symbol,
            timeframe: timeframeIds[input.timeframe]
              ? t(timeframeIds[input.timeframe])
              : input.timeframe,
          })}
        </strong>
        <span className={styles.muted}>{badge}</span>
      </div>
      <svg
        className={styles.chart}
        viewBox="0 0 440 104"
        preserveAspectRatio="none"
        role="img"
        aria-label={t('data.pricePreview')}
      >
        <polygon points={`0,100 ${points} 440,100`} fill="rgba(159,179,200,0.10)" />
        <polyline
          points={points}
          fill="none"
          stroke="#9fb3c8"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <line x1="0" x2="440" y1="100.5" y2="100.5" stroke="var(--divider)" />
      </svg>
      <div>
        <KeyValueRow label={t('data.bars')}>{formatNumber(bars.length)}</KeyValueRow>
        <KeyValueRow label={t('data.utcRange')}>
          {t('data.rangeValue', {
            from: formatDate(bars[0].time * 1000, true).slice(0, 16),
            to: formatDate(bars.at(-1)!.time * 1000, true).slice(0, 16),
          })}
        </KeyValueRow>
        <KeyValueRow label={t('data.session')}>
          {sessionCalendar ? t('data.tradingDays', { count: days }) : t('data.continuous')}
        </KeyValueRow>
      </div>
    </>
  );
}

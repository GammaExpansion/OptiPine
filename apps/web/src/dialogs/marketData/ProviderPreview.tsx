import { useEffect, useState } from 'react';
import { Button } from '../../components/Button.tsx';
import { Note } from '../../components/Note.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { getServices } from '../../state/services.ts';
import { useMarketDataStore } from '../../state/marketData.ts';
import {
  fetchProgress,
  type DataPreview,
  type SymbolInfoKey,
} from '../../workflows/market-data.ts';
import { ProfileFields, type ProfileDraft } from './ProfileFields.tsx';
import { PreviewSummary } from './PreviewSummary.tsx';
import { timeframeIds } from './timeframes.ts';
import styles from './DataDialog.module.css';
import { demoBuild } from '../../demo.ts';

function Preview({ preview }: { preview: DataPreview }) {
  const { t } = useI18n();
  const edit = useMarketDataStore((state) => state.actions.editSymbolInfo);
  const [draft, setDraft] = useState<ProfileDraft>(() => ({
    mintick: String(preview.symbolInfo.mintick),
    pointvalue: String(preview.symbolInfo.pointvalue),
    mincontract: String(preview.symbolInfo.mincontract),
    timezone: preview.symbolInfo.timezone,
  }));
  const onChange = (key: SymbolInfoKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key === 'timezone') edit(key, value);
    else edit(key, value.trim() ? Number(value) : NaN);
  };
  return (
    <>
      <PreviewSummary
        input={preview.dataset.input}
        badge={t(preview.cached ? 'data.cached' : 'data.fetched')}
      />
      <ProfileFields values={draft} errors={preview.symbolInfoErrors} onChange={onChange} />
      {preview.profileEstimated && <Note tone="amber">{t('data.estimated')}</Note>}
      {preview.dataset.calendarEstimated && <Note tone="amber">{t('data.calendarEstimated')}</Note>}
      {preview.dataset.ohlcNormalized ? (
        <Note tone="amber">
          {t('data.ohlcNormalized', { count: preview.dataset.ohlcNormalized })}
        </Note>
      ) : preview.unadjusted ? (
        <span className={styles.muted}>{t('data.unadjusted')}</span>
      ) : null}
    </>
  );
}

export function ProviderPreview({ onYahoo, onCsv }: { onYahoo: () => void; onCsv: () => void }) {
  const { t, text } = useI18n();
  const state = useMarketDataStore((state) => state.fetch);
  const service = useMarketDataStore((state) => state.service);
  const retry = useMarketDataStore((state) => state.actions.retry);
  const [now, setNow] = useState(getServices().now);
  useEffect(() => {
    if (state.status !== 'fetching') return;
    setNow(getServices().now());
    const timer = setInterval(() => setNow(getServices().now()), 100);
    return () => clearInterval(timer);
  }, [state]);
  if (state.status === 'fetching')
    return (
      <div className={styles.progress} role="status">
        <strong>
          {t('data.fetching', {
            symbol: state.request.symbol,
            timeframe: t(timeframeIds[state.request.timeframe]),
          })}
        </strong>
        <ProgressBar
          className={styles.progressBar}
          label={t('data.fetchingAbout', { count: state.expectedBars })}
          value={fetchProgress(state, now) * 100}
        />
        <span className={styles.muted}>
          {t('data.fetchingAbout', { count: state.expectedBars })}
        </span>
      </div>
    );
  if (state.status === 'preview') return <Preview preview={state.preview} />;
  if (state.status === 'unavailable' || service === 'unavailable')
    return (
      <div className={styles.recovery}>
        <Note tone="amber" role="status">
          {t('data.unavailable')}
        </Note>
        <Button onClick={onCsv}>{t('data.uploadCsv')}</Button>
      </div>
    );
  if (state.status === 'refused')
    return (
      <div className={styles.recovery}>
        <Note tone="danger" role="alert">
          <strong>
            {t('data.refusedBy', {
              provider: t(state.request.feed === 'yahoo' ? 'data.yahoo' : 'data.binance'),
            })}
          </strong>
          <div>{text(state.error)}</div>
          {demoBuild && <div>{t('data.demoCsvHint')}</div>}
        </Note>
        <div className={styles.chips}>
          {!demoBuild && state.alternative === 'yahoo' && (
            <Button onClick={onYahoo}>{t('data.useYahoo')}</Button>
          )}
          <Button onClick={onCsv}>{t('data.uploadCsv')}</Button>
          {state.canRetry && <Button onClick={() => void retry()}>{t('data.retry')}</Button>}
        </div>
        <span className={styles.muted}>{t('data.noStitch')}</span>
      </div>
    );
  return <div className={styles.empty}>{t('data.previewHint')}</div>;
}

import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { timeframeIds } from '../../dialogs/marketData/timeframes.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../state/backtest.ts';
import { useMarketDataStore } from '../../state/marketData.ts';
import { useUiStore } from '../../state/ui.ts';
import { confirmReplace, pickScriptFile, showPaste } from '../../dialogs/script/actions.ts';
import styles from './FirstLaunch.module.css';

export function FirstLaunch() {
  const { t, text } = useI18n();
  const open = useUiStore((state) => state.setDialogOpen);
  const loadExample = useBacktestStore((state) => state.actions.loadExample);
  const readiness = useBacktestStore((state) => state.readiness);
  const run = useBacktestStore((state) => state.actions.run);
  const source = useBacktestStore((state) => state.source);
  const dataset = useBacktestStore((state) => state.dataset);
  // A fetch started without the dialog, as an example's, shows here (the dialog shows its own).
  const fetching = useMarketDataStore((state) =>
    state.fetch.status === 'fetching' ? state.fetch : null,
  );
  const cancelFetch = useMarketDataStore((state) => state.actions.cancel);
  const reason =
    !source.trim() && !dataset
      ? t('shell.runMissing')
      : readiness.reasons.map(text).join(t('data.separator'));
  const steps = [
    {
      title: t('backtest.strategy'),
      hint: t('backtest.strategyHint'),
      actions: (
        <>
          <Button onClick={() => void showPaste()}>
            <Icon name="paste" />
            {t('backtest.pasteCode')}
          </Button>
          <Button onClick={pickScriptFile}>{t('backtest.openFile')}</Button>
        </>
      ),
    },
    {
      title: t('backtest.marketData'),
      hint: fetching
        ? t('data.fetching', {
            symbol: fetching.request.symbol,
            timeframe: t(timeframeIds[fetching.request.timeframe]),
          })
        : t('backtest.marketHint'),
      progress: fetching && (
        <ProgressBar
          className={styles.progress}
          label={t('data.fetchingAbout', { count: fetching.expectedBars })}
        />
      ),
      actions: fetching ? (
        <Button onClick={cancelFetch}>{t('data.cancelFetch')}</Button>
      ) : (
        <Button onClick={() => open('marketData', true)}>{t('shell.selectData')}</Button>
      ),
    },
    {
      title: t('backtest.run'),
      hint: t('backtest.runHint'),
      actions: (
        <Button
          variant="primary"
          disabled={!readiness.ok}
          disabledReason={reason}
          onClick={() => void run()}
        >
          <Icon name="play" size={11} />
          {t('shell.runBacktest')}
        </Button>
      ),
    },
  ];
  return (
    <section className={styles.chart} aria-label={t('backtest.start')}>
      <div className={styles.start}>
        <h1>{t('backtest.start')}</h1>
        {steps.map((step, index) => (
          <div className={styles.step} key={index}>
            <span className={styles.number}>{index + 1}</span>
            <div className={styles.copy}>
              <strong>{step.title}</strong>
              {/* The data step's hint is a live region, so a fetch it starts is announced. */}
              <span role={'progress' in step ? 'status' : undefined}>{step.hint}</span>
              {'progress' in step && step.progress}
            </div>
            <div className={styles.actions}>{step.actions}</div>
          </div>
        ))}
        <div className={styles.example}>
          <Button
            variant="link"
            onClick={() => confirmReplace(() => void loadExample('trend-breakout'))}
          >
            {t('backtest.loadExample')}
          </Button>
        </div>
      </div>
    </section>
  );
}

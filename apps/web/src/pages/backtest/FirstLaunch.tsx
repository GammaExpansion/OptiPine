import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../state/backtest.ts';
import { useUiStore } from '../../state/ui.ts';
import { pickScriptFile, showPaste } from '../../dialogs/script/actions.ts';
import styles from './FirstLaunch.module.css';

export function FirstLaunch() {
  const { t, text } = useI18n();
  const open = useUiStore((state) => state.setDialogOpen);
  const loadExample = useBacktestStore((state) => state.actions.loadExample);
  const readiness = useBacktestStore((state) => state.readiness);
  const run = useBacktestStore((state) => state.actions.run);
  const result = useBacktestStore((state) => state.result);
  const source = useBacktestStore((state) => state.source);
  const dataset = useBacktestStore((state) => state.dataset);
  const reason =
    !source.trim() && !dataset
      ? t('shell.runMissing')
      : readiness.reasons.map(text).join(t('data.separator'));
  if (result) return null;
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
      hint: t('backtest.marketHint'),
      actions: <Button onClick={() => open('marketData', true)}>{t('shell.selectData')}</Button>,
    },
    {
      title: t('backtest.run'),
      hint: readiness.ok ? t('backtest.runHint') : reason,
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
              <span>{step.hint}</span>
            </div>
            <div className={styles.actions}>{step.actions}</div>
          </div>
        ))}
        <div className={styles.example}>
          <Button variant="link" onClick={() => void loadExample('trend-breakout')}>
            {t('backtest.loadExample')}
          </Button>
        </div>
      </div>
    </section>
  );
}

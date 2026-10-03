import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import styles from './EmptyChart.module.css';

export function EmptyChart() {
  const { t } = useI18n();
  const steps = [
    {
      title: t('backtest.strategy'),
      hint: t('backtest.strategyHint'),
      actions: (
        <>
          <Button>
            <Icon name="paste" />
            {t('backtest.pasteCode')}
          </Button>
          <Button>{t('backtest.openFile')}</Button>
        </>
      ),
    },
    {
      title: t('backtest.marketData'),
      hint: t('backtest.marketHint'),
      actions: <Button>{t('shell.selectData')}</Button>,
    },
    {
      title: t('backtest.run'),
      hint: t('backtest.runHint'),
      actions: (
        <Button variant="primary" disabled aria-describedby="run-missing">
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
          <Button variant="link">{t('backtest.loadExample')}</Button>
        </div>
      </div>
    </section>
  );
}

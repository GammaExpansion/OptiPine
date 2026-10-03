import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { SegmentedControl } from '../../components/SegmentedControl.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import styles from './OptimizeSidebar.module.css';

export function OptimizeSidebar() {
  const { t } = useI18n();
  return (
    <div className={styles.sidebar}>
      <div className={styles.sections}>
        <section>
          <div className={styles.heading}>
            <h2>{t('optimize.searchRanges')}</h2>
            <SegmentedControl
              small
              label={t('optimize.searchMethod')}
              value="grid"
              options={[
                { value: 'grid', label: t('optimize.grid') },
                { value: 'random', label: t('optimize.random') },
              ]}
            />
          </div>
          <p>{t('backtest.inputsHint')}</p>
        </section>
        <section>
          <h2>{t('optimize.validation')}</h2>
          <SegmentedControl
            label={t('optimize.validation')}
            value="in-out"
            options={[
              { value: 'none', label: t('optimize.none') },
              { value: 'in-out', label: t('optimize.inOut') },
              { value: 'walk-forward', label: t('optimize.walkForward') },
            ]}
          />
          <div className={styles.share}>
            <span>{t('optimize.oosShare')}</span>
            <div className={styles.track}>
              <i />
            </div>
            <span>{t('optimize.shareDefault')}</span>
          </div>
        </section>
        <section>
          <h2>{t('optimize.ranking')}</h2>
          <Button className={styles.select}>
            {t('optimize.objectiveDefault')}
            <Icon name="chevron" size={12} />
          </Button>
          <Button className={styles.condition}>{t('optimize.addCondition')}</Button>
        </section>
        <section>
          <div className={styles.heading}>
            <h2>{t('backtest.properties')}</h2>
            <Button variant="link">{t('optimize.edit')}</Button>
          </div>
          <p>{t('backtest.propertiesHint')}</p>
        </section>
      </div>
      <div className={styles.run}>
        <div>
          <div className={styles.combos}>
            <strong>{t('common.unavailable')}</strong>
            <span>{t('optimize.combos')}</span>
          </div>
          <p>{t('shell.runMissing')}</p>
        </div>
        <Button variant="primary" disabled>
          <Icon name="play" size={11} />
          {t('optimize.start')}
        </Button>
      </div>
    </div>
  );
}

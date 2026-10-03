import { useShallow } from 'zustand/react/shallow';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { windowCount } from '../../../shell/optimize-status.ts';
import { inSampleShare, spanText, walkForwardFacts } from './range-display.ts';
import styles from './DataRangeBar.module.css';

/** The walk-forward plan as the bar sums it up (O3): windows, their lengths and the step. */
function WalkForwardRange() {
  const { t, text } = useI18n();
  const { plan, settings } = useOptimizationStore(
    useShallow((state) => ({ plan: state.plan, settings: state.validation.walkForward })),
  );
  if (plan.status === 'failed') return <span className={styles.error}>{text(plan.error)}</span>;
  const facts = walkForwardFacts(settings);
  return (
    <>
      {plan.status === 'planned' ? (
        <span>{text(windowCount(plan.windows.length))}</span>
      ) : (
        <span className={styles.caption}>{t('optimize.setup.planning')}</span>
      )}
      <span className={styles.legend}>
        <i className={styles.inSampleDark} />
        {text(facts.inSample)}
      </span>
      <span className={styles.legend}>
        <i className={styles.outOfSample} />
        {text(facts.outOfSample)}
      </span>
      <span className={styles.secondary}>{text(facts.step)}</span>
    </>
  );
}

/**
 * The bar at the top of the Optimize page (O1–O3, R1): the dataset's span with the IS and OOS
 * ranges and their dates, all of it for validation None, or the walk-forward plan.
 */
export function DataRangeBar() {
  const { t, text } = useI18n();
  const range = useOptimizationStore((state) => state.dataRange);
  const mode = useOptimizationStore((state) => state.validation.mode);
  let body = null;
  if (mode === 'walk-forward') body = <WalkForwardRange />;
  else if (!range.all) body = <span className={styles.caption}>{t('optimize.setup.noData')}</span>;
  else if (range.error) body = <span className={styles.error}>{text(range.error)}</span>;
  else if (mode === 'none')
    body = (
      <>
        <span className={styles.legend}>
          <i className={styles.inSample} />
          {t('optimize.setup.allData')}
          <span className={styles.secondary}>{text(spanText(range.all))}</span>
        </span>
        <span className={styles.track}>
          <span className={styles.inSampleDark} />
        </span>
        <span className={styles.caption}>{t('optimize.setup.noOos')}</span>
      </>
    );
  else if (range.inSample && range.outOfSample) {
    const share = inSampleShare(range.inSample, range.outOfSample);
    body = (
      <>
        <span className={styles.legend}>
          <i className={styles.inSample} />
          {t('optimize.setup.inSample')}
          <span className={styles.secondary}>{text(spanText(range.inSample))}</span>
        </span>
        <span className={styles.track}>
          <span className={styles.inSampleDark} style={{ flex: `0 0 ${share}%` }} />
          <span className={styles.outOfSample} />
        </span>
        <span className={styles.legend}>
          <i className={styles.outOfSample} />
          {t('optimize.setup.outOfSample')}
          <span className={styles.secondary}>{text(spanText(range.outOfSample))}</span>
        </span>
      </>
    );
  }
  return (
    <div className={styles.bar}>
      <span className={styles.secondary}>{t('optimize.dataRange')}</span>
      {body}
    </div>
  );
}

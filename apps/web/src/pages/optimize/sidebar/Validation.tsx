import type { CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SectionHeading } from '../../../components/SectionHeading.tsx';
import { SegmentedControl } from '../../../components/SegmentedControl.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import type { ValidationMode } from '../../../workflows/optimize-setup.ts';
import { MiniNumber } from './MiniNumber.tsx';
import styles from './OptimizeSidebar.module.css';

const modes: readonly ValidationMode[] = ['none', 'in-out', 'walk-forward'];

/**
 * The OOS share as the split point along the data: IS to the left of the knob, OOS in amber to
 * its right, as the range bar draws them (O1).
 */
function ShareSlider() {
  const { t, text } = useI18n();
  const percent = useOptimizationStore((state) => state.validation.outOfSamplePercent);
  const error = useOptimizationStore((state) => state.dataRange.error);
  const setValidation = useOptimizationStore((state) => state.actions.setValidation);
  const inSample = 100 - percent;
  return (
    <>
      <label className={styles.share}>
        <span className={styles.secondary}>{t('optimize.oosShare')}</span>
        <input
          type="range"
          className={styles.slider}
          min={5}
          max={95}
          step={1}
          value={inSample}
          style={{ '--split': `${((inSample - 5) / 90) * 100}%` } as CSSProperties}
          aria-label={t('optimize.oosShare')}
          aria-valuetext={t('optimize.setup.splitValue', { inSample, outOfSample: percent })}
          onChange={(event) =>
            setValidation({ outOfSamplePercent: 100 - Number(event.target.value) })
          }
        />
        <span className={styles.percent}>{t('optimize.setup.percent', { value: percent })}</span>
      </label>
      {error && (
        <span className={styles.error} role="alert">
          {text(error)}
        </span>
      )}
    </>
  );
}

/** IS, OOS and step months and whether IS rolls forward (O3); the plan validates them. */
function WalkForwardFields() {
  const { t, text } = useI18n();
  const { settings, plan } = useOptimizationStore(
    useShallow((state) => ({ settings: state.validation.walkForward, plan: state.plan })),
  );
  const setValidation = useOptimizationStore((state) => state.actions.setValidation);
  const invalid = plan.status === 'failed';
  return (
    <>
      <div className={styles.months}>
        <span className={styles.secondary}>{t('optimize.setup.wfInSample')}</span>
        <MiniNumber
          width={42}
          label={t('optimize.setup.isMonths')}
          value={settings.inSampleMonths}
          invalid={invalid}
          onChange={(inSampleMonths) => setValidation({ walkForward: { inSampleMonths } })}
        />
        <span className={`${styles.secondary} ${styles.gap}`}>
          {t('optimize.setup.wfOutOfSample')}
        </span>
        <MiniNumber
          width={36}
          label={t('optimize.setup.oosMonths')}
          value={settings.outOfSampleMonths}
          invalid={invalid}
          onChange={(outOfSampleMonths) => setValidation({ walkForward: { outOfSampleMonths } })}
        />
        <span className={`${styles.secondary} ${styles.gap}`}>{t('optimize.setup.wfStep')}</span>
        <MiniNumber
          width={36}
          label={t('optimize.setup.stepMonths')}
          value={settings.stepMonths}
          invalid={invalid}
          onChange={(stepMonths) => setValidation({ walkForward: { stepMonths } })}
        />
        <span className={styles.caption}>{t('optimize.setup.monthsUnit')}</span>
      </div>
      {plan.status === 'failed' && (
        <span className={styles.error} role="alert">
          {text(plan.error)}
        </span>
      )}
      <div className={styles.between}>
        <span className={styles.secondary}>{t('optimize.setup.isStart')}</span>
        <SegmentedControl
          small
          label={t('optimize.setup.windowMode')}
          value={settings.anchored ? 'anchored' : 'rolling'}
          onChange={(value) => setValidation({ walkForward: { anchored: value === 'anchored' } })}
          options={[
            { value: 'rolling', label: t('optimize.setup.rolling') },
            { value: 'anchored', label: t('optimize.setup.anchored') },
          ]}
        />
      </div>
    </>
  );
}

/** Validation (O1–O3): None with its warning, IS / OOS with the OOS share, or walk-forward. */
export function Validation() {
  const { t } = useI18n();
  const mode = useOptimizationStore((state) => state.validation.mode);
  const setValidation = useOptimizationStore((state) => state.actions.setValidation);
  return (
    <section className={styles.section}>
      <SectionHeading>{t('optimize.validation')}</SectionHeading>
      <div className={styles.wide}>
        <SegmentedControl
          label={t('optimize.validation')}
          value={mode}
          onChange={(value) =>
            setValidation({ mode: modes.find((item) => item === value) ?? 'none' })
          }
          options={[
            { value: 'none', label: t('optimize.none') },
            { value: 'in-out', label: t('optimize.inOut') },
            { value: 'walk-forward', label: t('optimize.walkForward') },
          ]}
        />
      </div>
      {mode === 'in-out' && <ShareSlider />}
      {mode === 'none' && <p className={styles.warning}>{t('optimize.setup.unvalidated')}</p>}
      {mode === 'walk-forward' && <WalkForwardFields />}
    </section>
  );
}

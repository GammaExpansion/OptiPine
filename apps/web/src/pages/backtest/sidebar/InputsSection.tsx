import { Fragment } from 'react';
import { Icon } from '../../../components/Icon.tsx';
import { SectionHeading } from '../../../components/SectionHeading.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../state/backtest.ts';
import { InputControl } from './InputControl.tsx';
import { inputSections } from './input-display.ts';
import styles from '../Sidebar.module.css';

/** The script's inputs in declaration order, with Reset (B1, B14). */
export function InputsSection() {
  const { t } = useI18n();
  const compiled = useBacktestStore((state) => state.description !== null);
  const inputs = useBacktestStore((state) => state.inputs);
  const resetInputs = useBacktestStore((state) => state.actions.resetInputs);
  if (!compiled)
    return (
      <section className={styles.section}>
        <SectionHeading>{t('backtest.inputs')}</SectionHeading>
        <p className={styles.empty}>{t('backtest.inputsHint')}</p>
      </section>
    );
  const changed = inputs.filter((field) => field.changed).length;
  return (
    <section className={styles.section}>
      <SectionHeading
        action={
          <span className={styles.actions}>
            {changed > 0 && (
              <span className={styles.count}>
                {inputs.length === 1
                  ? t('inputs.countOne')
                  : t('inputs.count', { count: inputs.length, changed })}
              </span>
            )}
            <button
              type="button"
              className={styles.reset}
              disabled={!inputs.some((field) => field.changed || field.origin)}
              onClick={resetInputs}
            >
              <Icon name="reset" size={13} />
              {t('inputs.reset')}
            </button>
          </span>
        }
      >
        {t('backtest.inputs')}
      </SectionHeading>
      {!inputs.length && <p className={styles.empty}>{t('inputs.none')}</p>}
      {inputSections(inputs).map((section, index) => (
        <Fragment key={index}>
          {section.group !== null && (
            <div className={styles.group}>
              <span>{section.group}</span>
            </div>
          )}
          {section.fields.map((field) => (
            <InputControl key={field.descriptor.id} field={field} />
          ))}
        </Fragment>
      ))}
    </section>
  );
}

import { Button } from '../../../components/Button.tsx';
import { KeyValueRow } from '../../../components/KeyValueRow.tsx';
import { SectionHeading } from '../../../components/SectionHeading.tsx';
import {
  scriptSummaryText,
  summaryIds,
  summaryOverridden,
  summaryText,
} from '../../../dialogs/properties/property-display.ts';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../state/backtest.ts';
import { scriptIsIndicator } from '../states/chart-view.ts';
import { useUiStore } from '../../../state/ui.ts';
import styles from '../Sidebar.module.css';

/** The engine's default when the data does not name its currency. */
const defaultCurrency = 'USD';

/** The Properties summary with All settings (B1); an override shows the script's value. */
export function PropertiesSummary() {
  const { t, text } = useI18n();
  const fields = useBacktestStore((state) => state.properties);
  const currency = useBacktestStore((state) => {
    const value = state.dataset?.input.syminfo.currency;
    return typeof value === 'string' ? value : defaultCurrency;
  });
  const setDialogOpen = useUiStore((state) => state.setDialogOpen);
  // An indicator has no account to configure.
  const indicator = useBacktestStore(scriptIsIndicator);
  if (!fields.length || indicator)
    return (
      <section className={styles.section}>
        <SectionHeading>{t('backtest.properties')}</SectionHeading>
        <p className={styles.empty}>
          {t(indicator ? 'backtest.propertiesIndicator' : 'backtest.propertiesHint')}
        </p>
      </section>
    );
  return (
    <section className={styles.properties}>
      <SectionHeading
        action={
          <Button variant="link" onClick={() => setDialogOpen('properties', true)}>
            {t('properties.allSettings')}
          </Button>
        }
      >
        {t('backtest.properties')}
      </SectionHeading>
      <div className={styles.summary}>
        {summaryIds.map((id) => {
          const value = summaryText(fields, id, currency);
          const script = scriptSummaryText(fields, id, currency);
          return (
            <KeyValueRow key={id} label={t(`backtest.property.${id}`)}>
              <span className={styles.value}>
                {summaryOverridden(fields, id) && (
                  <>
                    <span className={styles.script}>
                      {script
                        ? t('properties.script', { value: script })
                        : t('properties.scriptComputed')}
                    </span>
                    <span className={styles.changed} />
                  </>
                )}
                {value ? text(value) : t('properties.computed')}
              </span>
            </KeyValueRow>
          );
        })}
      </div>
    </section>
  );
}

import { Button } from '../../../components/Button.tsx';
import { SectionHeading } from '../../../components/SectionHeading.tsx';
import { summaryText } from '../../../dialogs/properties/property-display.ts';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../state/backtest.ts';
import { useUiStore } from '../../../state/ui.ts';
import styles from './OptimizeSidebar.module.css';

/** The engine's default when the data does not name its currency. */
const defaultCurrency = 'USD';

/**
 * Properties (O1): commission, slippage and order size in a line, and Edit, which opens the same
 * strategy properties as the Backtest page (B13).
 */
export function Properties() {
  const { t, text } = useI18n();
  const fields = useBacktestStore((state) => state.properties);
  const currency = useBacktestStore((state) => {
    const value = state.dataset?.input.syminfo.currency;
    return typeof value === 'string' ? value : defaultCurrency;
  });
  const setDialogOpen = useUiStore((state) => state.setDialogOpen);
  const value = (id: 'commission' | 'slippage' | 'orderSize') => {
    const summary = summaryText(fields, id, currency);
    return summary ? text(summary) : t('properties.computed');
  };
  return (
    <section className={styles.section}>
      <SectionHeading
        action={
          fields.length > 0 && (
            <Button variant="link" onClick={() => setDialogOpen('properties', true)}>
              {t('optimize.edit')}
            </Button>
          )
        }
      >
        {t('backtest.properties')}
      </SectionHeading>
      {fields.length ? (
        <p className={styles.facts}>
          <span>
            {t('optimize.setup.propertyFact', {
              label: t('backtest.property.commission'),
              value: value('commission'),
            })}
          </span>
          <span>
            {t('optimize.setup.propertyFact', {
              label: t('backtest.property.slippage'),
              value: value('slippage'),
            })}
          </span>
          <span>{value('orderSize')}</span>
        </p>
      ) : (
        <p className={styles.hint}>{t('backtest.propertiesHint')}</p>
      )}
    </section>
  );
}

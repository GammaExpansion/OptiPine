import { useState } from 'react';
import { Button } from '../../components/Button.tsx';
import { Dialog } from '../../components/Dialog.tsx';
import { Note } from '../../components/Note.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../state/backtest.ts';
import { useMarketDataStore } from '../../state/marketData.ts';
import { useUiStore } from '../../state/ui.ts';
import { getServices } from '../../state/services.ts';
import { datasetDensity, expectedBarCount } from '../../workflows/market-data.ts';
import { RangeFields } from '../marketData/RangeFields.tsx';
import { selectionFrom, selectionRequest } from '../marketData/selection.ts';
import styles from '../marketData/DataDialog.module.css';

export function DateRangeDialog() {
  const { t, text } = useI18n();
  const close = useUiStore((state) => state.setDialogOpen);
  const origin = useMarketDataStore((state) => state.origin);
  const dataset = useBacktestStore((state) => state.dataset);
  const fetchData = useMarketDataStore((state) => state.actions.fetch);
  const [now] = useState(getServices().now);
  const [selection, setSelection] = useState(() =>
    origin?.kind === 'provider' ? selectionFrom(origin.request) : null,
  );
  if (!selection || !dataset || origin?.kind !== 'provider') return null;
  const checked = selectionRequest(selection, now);
  const density = datasetDensity(dataset.input);
  const refetch = () => {
    if (!checked.request || checked.error) return;
    void fetchData(checked.request, density);
    close('dateRange', false);
    close('marketData', true);
  };
  return (
    <Dialog
      open
      onOpenChange={(value) => close('dateRange', value)}
      title={t('data.dateTitle')}
      closeLabel={t('data.close')}
      size="small"
      footer={
        <>
          <span className={styles.footerNote}>
            {checked.request &&
              t('data.estimate', {
                count: expectedBarCount(checked.request, selection.timeframe, density),
              })}
          </span>
          <Button onClick={() => close('dateRange', false)}>{t('data.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!checked.request || !!checked.error}
            onClick={refetch}
          >
            {t('data.fetchAgain')}
          </Button>
        </>
      }
    >
      <RangeFields
        estimates
        value={selection}
        now={now}
        density={density}
        onChange={setSelection}
      />
      {checked.error && (
        <Note tone="danger" role="alert">
          {text(checked.error)}
        </Note>
      )}
    </Dialog>
  );
}

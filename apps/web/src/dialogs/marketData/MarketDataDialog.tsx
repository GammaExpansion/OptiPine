import { useEffect, useRef, useState } from 'react';
import { feedTimeframes, type Feed } from '@pine/market-data';
import { Button } from '../../components/Button.tsx';
import { Dialog } from '../../components/Dialog.tsx';
import { Note } from '../../components/Note.tsx';
import { SegmentedControl } from '../../components/SegmentedControl.tsx';
import { Tabs } from '../../components/Tabs.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useMarketDataDialogStore } from '../../state/marketDataDialog.ts';
import { getMarketDataStore, useMarketDataStore } from '../../state/marketData.ts';
import { useUiStore } from '../../state/ui.ts';
import { feedDensity } from '../../workflows/market-data.ts';
import { CsvPanel, type CsvReady } from './CsvPanel.tsx';
import { ProviderPreview } from './ProviderPreview.tsx';
import { RangeFields } from './RangeFields.tsx';
import { SymbolSearch } from './SymbolSearch.tsx';
import {
  restoreSelection,
  selectionRequest,
  type Selection,
} from '../../workflows/market-selection.ts';
import { timeframeIds } from './timeframes.ts';
import styles from './DataDialog.module.css';
import { demoBuild } from '../../demo.ts';

export function MarketDataDialog() {
  const { t, text } = useI18n();
  const close = useUiStore((state) => state.setDialogOpen);
  const current = useMarketDataStore((state) => state.fetch);
  const service = useMarketDataStore((state) => state.service);
  const origin = useMarketDataStore((state) => state.origin);
  const actions = useMarketDataStore((state) => state.actions);
  const dialogActions = useMarketDataDialogStore((state) => state.actions);
  const [initial] = useState(dialogActions.initialSelection);
  const { now } = initial;
  const [selection, setSelection] = useState(() =>
    demoBuild && initial.selection.feed !== 'binance'
      ? restoreSelection(null, now)
      : initial.selection,
  );
  const [tab, setTab] = useState(() =>
    origin?.kind === 'csv' && current.status === 'idle'
      ? 'csv'
      : !demoBuild && selection.feed === 'yahoo'
        ? 'yahoo'
        : 'binance',
  );
  const [csv, setCsv] = useState<CsvReady | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const store = getMarketDataStore();
    return () => {
      mounted.current = false;
      const pending = store.getState().fetch;
      // StrictMode replays setup before this microtask; preserve an incoming header refetch.
      queueMicrotask(() => {
        if (!mounted.current && store.getState().fetch === pending) actions.cancel();
      });
    };
  }, [actions]);
  const dismiss = () => {
    actions.cancel();
    close('marketData', false);
  };
  const change = (value: Selection) => {
    actions.cancel();
    setSelection(value);
  };
  const chooseTab = (value: string) => {
    if (value === tab) return;
    actions.cancel();
    setCsv(null);
    setTab(value);
    if (value !== 'csv') {
      const feed: Feed = value === 'yahoo' ? 'yahoo' : 'binance';
      setSelection((old) => ({
        ...old,
        feed,
        symbol: feed === 'yahoo' ? 'AAPL' : 'BTCUSDT',
        timeframe: feed === 'yahoo' ? '1D' : '60',
        preset: '1M',
      }));
    }
  };
  const checked = selectionRequest(selection, now);
  const accept = () => {
    if (tab === 'csv') {
      if (!csv) return;
      actions.useCsv(csv.input, csv.fileName);
    } else {
      const accepted = dialogActions.accept(selection);
      if (!accepted) return;
    }
    close('marketData', false);
  };
  const fetchData = () => {
    if (checked.request && !checked.error)
      void actions.fetch(checked.request, feedDensity(selection.feed, selection.timeframe));
  };
  const preview = current.status === 'preview';
  const fetching = current.status === 'fetching';
  const blocked = service === 'unavailable' || !!checked.error || !checked.request;
  return (
    <Dialog
      open
      onEscapeKeyDown={(event) => {
        // Radix handles document capture before the input can dismiss its inline suggestions.
        if (
          event.target instanceof Element &&
          event.target.matches('[role="combobox"][aria-expanded="true"]')
        )
          event.preventDefault();
      }}
      onOpenChange={(value) => {
        if (!value) dismiss();
      }}
      title={t('data.marketTitle')}
      closeLabel={t('data.close')}
      size="large"
      footer={
        <>
          <span className={styles.footerNote}>
            {t(
              tab === 'csv'
                ? 'csv.localNote'
                : demoBuild
                  ? 'data.demoBrowserNote'
                  : 'data.serverNote',
            )}
          </span>
          <Button onClick={dismiss}>{t('data.cancel')}</Button>
          {tab === 'csv' ? (
            <Button variant="primary" disabled={!csv} onClick={accept}>
              {t('data.use')}
            </Button>
          ) : fetching ? (
            <Button onClick={actions.cancel}>{t('data.cancelFetch')}</Button>
          ) : (
            <Button
              variant="primary"
              disabled={
                preview
                  ? Object.keys(current.preview.symbolInfoErrors).length > 0
                  : blocked || current.status === 'refused'
              }
              onClick={preview ? accept : fetchData}
            >
              {t(
                preview || current.status === 'refused' || service === 'unavailable'
                  ? 'data.use'
                  : 'data.fetch',
              )}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.surface}>
        {demoBuild && (
          <Note className={styles.demoNote}>
            {t('data.demoServerOnly')}{' '}
            <a
              href="https://github.com/GammaExpansion/OptiPine#running-the-app"
              target="_blank"
              rel="noreferrer"
            >
              {t('data.demoServerLink')}
            </a>
          </Note>
        )}
        <Tabs
          label={t('data.providers')}
          value={tab}
          onChange={chooseTab}
          options={[
            {
              value: 'binance',
              label: t('data.binance'),
              description: t('data.cryptoDescription'),
            },
            {
              value: 'yahoo',
              label: t('data.yahoo'),
              description: t('data.yahooDescription'),
              disabled: demoBuild,
            },
            { value: 'csv', label: t('data.uploadCsv') },
          ]}
        >
          {tab === 'csv' ? (
            <CsvPanel onReady={setCsv} />
          ) : (
            <div className={styles.columns}>
              <div className={styles.left}>
                {selection.feed !== 'yahoo' && (
                  <div>
                    <span className={styles.label}>{t('data.market')}</span>
                    <SegmentedControl
                      label={t('data.market')}
                      value={selection.feed}
                      disabled={service === 'unavailable'}
                      onChange={(feed) => change({ ...selection, feed: feed as Feed })}
                      options={[
                        { value: 'binance', label: t('data.spot') },
                        {
                          value: 'binance-futures',
                          label: t('data.perpetual'),
                          disabled: demoBuild,
                        },
                      ]}
                    />
                  </div>
                )}
                <SymbolSearch
                  feed={selection.feed}
                  value={selection.symbol}
                  disabled={service === 'unavailable'}
                  onChange={(symbol) => change({ ...selection, symbol })}
                />
                <div>
                  <span className={styles.label}>{t('data.timeframe')}</span>
                  <SegmentedControl
                    label={t('data.timeframe')}
                    value={selection.timeframe}
                    disabled={service === 'unavailable'}
                    onChange={(timeframe) => change({ ...selection, timeframe })}
                    options={Object.keys(feedTimeframes[selection.feed]).map((value) => ({
                      value,
                      label: t(timeframeIds[value]),
                    }))}
                  />
                </div>
                <RangeFields
                  value={selection}
                  now={now}
                  onChange={change}
                  density={feedDensity(selection.feed, selection.timeframe)}
                />
                <span className={styles.muted}>{t('data.limits')}</span>
                {selection.feed === 'yahoo' && (
                  <span className={styles.muted}>{t('data.yahooLimits')}</span>
                )}
                {checked.limited && <span className={styles.muted}>{t('data.limited')}</span>}
                {checked.error && (
                  <Note tone="danger" role="alert">
                    {text(checked.error)}
                  </Note>
                )}
              </div>
              <div className={styles.right}>
                <ProviderPreview
                  onYahoo={() => chooseTab('yahoo')}
                  onCsv={() => chooseTab('csv')}
                />
              </div>
            </div>
          )}
        </Tabs>
      </div>
    </Dialog>
  );
}

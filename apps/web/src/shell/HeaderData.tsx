import { feedTimeframes } from '@pine/market-data';
import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icon.tsx';
import { SegmentedControl } from '../components/SegmentedControl.tsx';
import { ScriptMenu } from '../dialogs/script/ScriptMenu.tsx';
import { ScriptFilePicker } from '../dialogs/script/ScriptFilePicker.tsx';
import { timeframeIds } from '../dialogs/marketData/timeframes.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { formatDate } from '../i18n/translate.ts';
import { useBacktestStore } from '../state/backtest.ts';
import { useMarketDataStore } from '../state/marketData.ts';
import { useUiStore } from '../state/ui.ts';
import type { Layout } from './layout.ts';
import header from './Header.module.css';

const timeframes = ['15', '60', '240', '1D'];

/**
 * The script, the data and its timeframe and range. A tablet drops the provider and the range
 * (G2); a phone also picks the timeframe from a list (G3).
 */
export function HeaderData({ layout = 'desktop' }: { layout?: Layout }) {
  const { t } = useI18n();
  const open = useUiStore((state) => state.setDialogOpen);
  const dataset = useBacktestStore((state) => state.dataset);
  const origin = useMarketDataStore((state) => state.origin);
  const fetchData = useMarketDataStore((state) => state.actions.fetch);
  const fetching = useMarketDataStore((state) =>
    state.fetch.status === 'fetching' ? state.fetch.request : null,
  );
  const input = dataset?.input;
  const request = origin?.kind === 'provider' ? origin.request : null;
  const timeframe = input?.timeframe === 'D' ? '1D' : (input?.timeframe ?? '');
  const changeTimeframe = (timeframe: string) => {
    if (!request) return;
    void fetchData({ ...request, timeframe });
    open('marketData', true);
  };
  const unavailable = (value: string) =>
    !!request && !Object.hasOwn(feedTimeframes[request.feed], value);
  return (
    <>
      <ScriptFilePicker />
      <ScriptMenu />
      <Button variant="toolbar" onClick={() => open('marketData', true)}>
        {input ? (
          <>
            <strong style={{ color: 'var(--text)' }}>
              {String(input.syminfo.ticker ?? input.syminfo.tickerid ?? request?.symbol ?? '')}
            </strong>
            {layout === 'desktop' && (
              <span style={{ color: 'var(--caption)' }}>
                {t(
                  origin?.kind === 'csv'
                    ? 'data.csvProvider'
                    : request?.feed === 'yahoo'
                      ? 'data.yahoo'
                      : request?.feed === 'binance-futures'
                        ? 'data.binanceFutures'
                        : 'data.binance',
                )}
              </span>
            )}
          </>
        ) : fetching ? (
          // Before any data, a fetch started outside the dialog (an example's) shows here.
          t('data.fetching', {
            symbol: fetching.symbol,
            timeframe: t(timeframeIds[fetching.timeframe]),
          })
        ) : (
          t('shell.selectData')
        )}
        <Icon name="chevron" size={12} />
      </Button>
      {layout === 'phone' ? (
        input && (
          // A phone's own picker, which needs no menu code on the first screen.
          <span className={header.select}>
            <select
              aria-label={t('shell.timeframe')}
              title={origin?.kind === 'csv' ? t('data.csvFixed') : undefined}
              value={timeframe}
              disabled={!request}
              onChange={(event) => changeTimeframe(event.target.value)}
            >
              {timeframeIds[timeframe] && !timeframes.includes(timeframe) && (
                <option value={timeframe}>{t(timeframeIds[timeframe])}</option>
              )}
              {timeframes.map((value) => (
                <option key={value} value={value} disabled={unavailable(value)}>
                  {t(timeframeIds[value])}
                </option>
              ))}
            </select>
            <Icon name="chevron" size={12} />
          </span>
        )
      ) : (
        <span className={header.timeframe}>
          <SegmentedControl
            label={t('shell.timeframe')}
            value={timeframe}
            onChange={changeTimeframe}
            disabled={!request}
            options={timeframes.map((value) => ({
              value,
              label: t(timeframeIds[value]),
              disabled: unavailable(value),
            }))}
          />
        </span>
      )}
      {layout === 'desktop' && (
        <Button
          variant="toolbar"
          disabled={!request}
          disabledReason={origin?.kind === 'csv' ? t('data.csvFixed') : undefined}
          onClick={() => open('dateRange', true)}
        >
          <Icon name="calendar" />
          <span
            style={{
              color: input ? 'var(--text)' : undefined,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {input
              ? t('data.rangeValue', {
                  from: formatDate(input.bars[0].time * 1000),
                  to: formatDate(input.bars.at(-1)!.time * 1000),
                })
              : t('shell.dateRange')}
          </span>
        </Button>
      )}
    </>
  );
}

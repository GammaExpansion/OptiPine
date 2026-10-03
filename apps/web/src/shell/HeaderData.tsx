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

export function HeaderData() {
  const { t } = useI18n();
  const open = useUiStore((state) => state.setDialogOpen);
  const dataset = useBacktestStore((state) => state.dataset);
  const origin = useMarketDataStore((state) => state.origin);
  const fetchData = useMarketDataStore((state) => state.actions.fetch);
  const input = dataset?.input;
  const request = origin?.kind === 'provider' ? origin.request : null;
  const changeTimeframe = (timeframe: string) => {
    if (!request) return;
    void fetchData({ ...request, timeframe });
    open('marketData', true);
  };
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
          </>
        ) : (
          t('shell.selectData')
        )}
        <Icon name="chevron" size={12} />
      </Button>
      <SegmentedControl
        label={t('shell.timeframe')}
        value={input?.timeframe === 'D' ? '1D' : (input?.timeframe ?? '')}
        onChange={changeTimeframe}
        disabled={!request}
        options={['15', '60', '240', '1D'].map((value) => ({
          value,
          label: t(timeframeIds[value]),
          disabled: !!request && !Object.hasOwn(feedTimeframes[request.feed], value),
        }))}
      />
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
    </>
  );
}

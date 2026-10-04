import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EngineWorkerClient } from '@pine/workers';
import type { EquityRunResult, MarketBar } from '@pine/engine';
import { loadCatalog } from '../i18n/translate.ts';
import { I18nProvider, loadActiveCatalog, useI18n } from '../i18n/I18nProvider.tsx';
import { uiStore, useUiStore } from '../state/ui.ts';
import { createEngineWorker } from '../workers/factories.ts';
import { equitySummary, type EquityInput, type EquitySummary } from '../workflows/equity.ts';
import { tradeRows, type TradeRow } from '../workflows/trades.ts';
import { PriceChart, type PriceChartHandle } from '../charts/PriceChart.tsx';
import { EquityCharts } from '../charts/EquityCharts.tsx';
import { syntheticBars } from './synthetic.ts';
import { examples } from './examples.ts';
import '../styles/base.css';
import './dev.css';

interface DemoResult {
  bars: MarketBar[];
  output: EquityRunResult;
  trades: TradeRow[];
  equity: EquityInput;
  summary: EquitySummary;
}

function ChartWorkbench() {
  const { t, error, language } = useI18n();
  const setLanguage = useUiStore((state) => state.setLanguage);
  const [example, setExample] = useState<'trend-breakout' | 'rsi-reversal'>('trend-breakout');
  const [count, setCount] = useState(20_496);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [tradeNumber, setTradeNumber] = useState(1);
  const [hovered, setHovered] = useState<TradeRow | null>(null);
  const chart = useRef<PriceChartHandle>(null);
  const showPriceChart = new URLSearchParams(window.location.search).get('view') !== 'equity';
  useEffect(() => {
    document.title = t('charts.devTitle');
  }, [t]);
  useEffect(() => {
    const client = new EngineWorkerClient(createEngineWorker);
    let active = true;
    setResult(null);
    setFailure(null);
    setHovered(null);
    const bars = syntheticBars(count);
    void client
      .run(examples[example], {
        bars,
        syminfo: {
          timezone: 'Etc/UTC',
          mintick: 0.01,
          mincontract: 0.001,
          pointvalue: 1,
          currency: 'USD',
        },
        timeframe: '60',
      })
      .then((output) => {
        if (!active) return;
        if (output.diagnostics.length)
          throw new Error(output.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
        if (!output.equity) throw new Error(t('charts.noData'));
        const equity = {
          times: bars.map((bar) => bar.time),
          equity: output.equity,
          initialCapital: 100_000,
          timezone: 'Etc/UTC',
        };
        const summary = equitySummary(equity);
        if (!summary) throw new Error(t('charts.noData'));
        const trades = tradeRows(output.trades, {
          pointvalue: 1,
          lastBarIndex: bars.length - 1,
          lastClose: bars.at(-1)!.close,
        });
        setTradeNumber(Math.max(1, trades.length - 2));
        setResult({ bars, output: { ...output, equity: output.equity }, equity, summary, trades });
      })
      .catch((cause: unknown) => {
        if (active) setFailure(error(cause));
      });
    return () => {
      active = false;
      client.cancel();
    };
  }, [example, count, error, t]);
  return (
    <div className="charts-dev">
      <header>
        <strong>{t('charts.devTitle')}</strong>
        <span>{t('charts.devData')}</span>
        <span className="charts-dev-status">
          {failure
            ? t('charts.devFailure', { reason: failure })
            : result
              ? t('charts.devReady', { bars: result.bars.length, trades: result.trades.length })
              : t('charts.devLoading')}
        </span>
      </header>
      <main>
        <div className="charts-dev-main">
          {showPriceChart && (
            <div className="charts-dev-price">
              {result && (
                <PriceChart
                  ref={chart}
                  bars={result.bars}
                  plots={result.output.plots}
                  trades={result.trades}
                  symbol="BTCUSDT"
                  timezone="Etc/UTC"
                  hoveredTrade={hovered}
                />
              )}
            </div>
          )}
          <div className="charts-dev-dock">{t('charts.equity')}</div>
          {result && (
            <EquityCharts
              input={result.equity}
              summary={result.summary}
              showAttribution={!showPriceChart}
            />
          )}
        </div>
        <aside className="charts-dev-controls">
          <label>
            {t('charts.devExample')}
            <select
              aria-label={t('charts.devExample')}
              value={example}
              onChange={(event) =>
                setExample(event.target.value as 'trend-breakout' | 'rsi-reversal')
              }
            >
              <option value="trend-breakout">{t('charts.devTrend')}</option>
              <option value="rsi-reversal">{t('charts.devRsi')}</option>
            </select>
          </label>
          <label>
            {t('charts.devBars')}
            <select
              aria-label={t('charts.devBars')}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            >
              {[20_496, 100_000].map((value) => (
                <option key={value} value={value}>
                  {t('charts.devBarCount', { count: value })}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('charts.devTrade')}
            <input
              aria-label={t('charts.devTrade')}
              type="number"
              min={1}
              max={result?.trades.length ?? 1}
              value={tradeNumber}
              onChange={(event) => setTradeNumber(Number(event.target.value))}
            />
          </label>
          <button
            disabled={!result?.trades.some((trade) => trade.number === tradeNumber)}
            onClick={() =>
              chart.current?.focusTrade(
                result?.trades.find((trade) => trade.number === tradeNumber) ?? null,
              )
            }
          >
            {t('charts.devFocus')}
          </button>
          <div className="charts-dev-actions">
            <button onClick={() => chart.current?.focusTrade(null)}>{t('charts.devClear')}</button>
            <button onClick={() => chart.current?.resetView()}>{t('charts.devReset')}</button>
          </div>
          <label>
            {t('charts.devLanguage')}
            <select
              aria-label={t('charts.devLanguage')}
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'en' | 'zh')}
            >
              <option value="en">{t('charts.devEnglish')}</option>
              <option value="zh">{t('charts.devChinese')}</option>
            </select>
          </label>
          <p>{t('charts.devNote')}</p>
          <h2>{t('charts.devTrades')}</h2>
          <div className="charts-dev-trades">
            {result?.trades.slice(0, 12).map((trade) => (
              <button
                key={trade.number}
                onMouseEnter={() => setHovered(trade)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(trade)}
                onBlur={() => setHovered(null)}
                onClick={() => {
                  setHovered(null);
                  chart.current?.focusTrade(trade);
                }}
              >
                {t('charts.tradeTitle', {
                  number: trade.number,
                  side: t(trade.side === 'long' ? 'charts.long' : 'charts.short'),
                })}
              </button>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

await loadActiveCatalog();
await loadCatalog(uiStore.getState().language, 'sheet');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ChartWorkbench />
    </I18nProvider>
  </StrictMode>,
);

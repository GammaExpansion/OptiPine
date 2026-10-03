import type { InputDescriptor } from '@pine/engine';
import type { FeedRequest } from '@pine/market-data';

export interface ExampleStrategy {
  readonly id: string;
  readonly fileName: `${string}.pine`;
  /** Script names and Pine input titles are intentionally not translated. */
  readonly title: string;
  /** The caller adds the two years ending at the current hour, in Unix seconds. */
  readonly dataRequest: Readonly<Omit<FeedRequest, 'from' | 'to'>>;
  readonly inputs: readonly Readonly<Pick<InputDescriptor, 'title' | 'type' | 'defaultValue'>>[];
}

/** `binance` is the market-data provider's spot feed; `60` is Pine's one-hour timeframe. */
const dataRequest = { feed: 'binance', symbol: 'BTCUSDT', timeframe: '60' } as const;

/** File names keep source loading in the caller: Vite raw imports in the app, fs in Node. */
export const examples = [
  {
    id: 'trend-breakout',
    fileName: 'trend-breakout.pine',
    title: 'Trend Breakout',
    dataRequest,
    inputs: [
      { title: 'Length', type: 'int', defaultValue: 20 },
      { title: 'Multiplier', type: 'float', defaultValue: 2 },
      { title: 'Source', type: 'source', defaultValue: 'close' },
      { title: 'Use trailing stop', type: 'bool', defaultValue: false },
      { title: 'Trail %', type: 'float', defaultValue: 3 },
    ],
  },
  {
    id: 'rsi-reversal',
    fileName: 'rsi-reversal.pine',
    title: 'RSI Reversal',
    dataRequest,
    inputs: [
      { title: 'RSI length', type: 'int', defaultValue: 14 },
      { title: 'Oversold', type: 'float', defaultValue: 30 },
      { title: 'Source', type: 'source', defaultValue: 'close' },
      { title: 'Exit at midline', type: 'bool', defaultValue: true },
      { title: 'Stop %', type: 'float', defaultValue: 3 },
    ],
  },
  {
    id: 'ma-cross',
    fileName: 'ma-cross.pine',
    title: 'MA Cross',
    dataRequest,
    inputs: [
      { title: 'Fast length', type: 'int', defaultValue: 50 },
      { title: 'Slow length', type: 'int', defaultValue: 200 },
      { title: 'Average type', type: 'string', defaultValue: 'EMA' },
      { title: 'Require rising slow MA', type: 'bool', defaultValue: true },
      { title: 'Stop %', type: 'float', defaultValue: 5 },
    ],
  },
] as const satisfies readonly ExampleStrategy[];

export type ExampleId = (typeof examples)[number]['id'];

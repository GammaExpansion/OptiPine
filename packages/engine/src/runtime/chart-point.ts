import type { MarketBar } from '../types.ts';
import { num } from './numeric.ts';

/** Explicit coordinates; unlike a drawing ID, point fields are readable data. */
export class ChartPoint {
  time: number;
  index: number;
  price: number;

  constructor(time: number, index: number, price: number) {
    this.time = time;
    this.index = index;
    this.price = price;
  }
}

// https://www.tradingview.com/pine-script-docs/language/type-system/#chart-points
// The reference's chart.point.now price parameter is optional and defaults to close.
export function chartPoint(
  name: string,
  positional: unknown[],
  named: Record<string, unknown>,
  bar: MarketBar,
  index: number,
): ChartPoint {
  const arg = (name: string, position: number, fallback: unknown = NaN): unknown =>
    Object.hasOwn(named, name) ? named[name] : (positional[position] ?? fallback);
  switch (name) {
    case 'new':
      return new ChartPoint(num(arg('time', 0)), num(arg('index', 1)), num(arg('price', 2)));
    case 'now':
      return new ChartPoint(bar.time * 1000, index, num(arg('price', 0, bar.close)));
    case 'from_index':
      return new ChartPoint(NaN, num(arg('index', 0)), num(arg('price', 1)));
    case 'from_time':
      return new ChartPoint(num(arg('time', 0)), NaN, num(arg('price', 1)));
    case 'copy': {
      const point = arg('id', 0);
      if (!(point instanceof ChartPoint))
        throw new Error('chart.point.copy requires a chart point');
      return new ChartPoint(point.time, point.index, point.price);
    }
    default:
      throw Object.assign(new Error(`Unsupported chart.point.${name}`), { kind: 'unsupported' });
  }
}

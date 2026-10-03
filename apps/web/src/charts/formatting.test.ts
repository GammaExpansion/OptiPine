import { describe, expect, it } from 'vitest';
import { drawdownTickLabels, priceFormat, tickLabels } from './formatting.ts';

describe('chart price formatting', () => {
  it('groups coarse price ticks while retaining mintick precision for exact labels', () => {
    const format = priceFormat(0.01);
    expect(format.tickmarksFormatter([97_000, 96_000, 95_000])).toEqual([
      '97,000',
      '96,000',
      '95,000',
    ]);
    expect(format.formatter(96_976.73)).toBe('96,976.73');
    expect(format.formatter(97_000)).toBe('97,000.00');
    expect(priceFormat(0.00001).formatter(1.23456)).toBe('1.23456');
    expect(priceFormat(1).formatter(1000)).toBe('1,000');
  });
  it('preserves fractional grids and offsets without floating point noise or duplicate labels', () => {
    expect(tickLabels([1.2, 1.3, 1.4000000000000001], 8)).toEqual(['1.2', '1.3', '1.4']);
    expect(tickLabels([100.25, 101.25, 102.25], 2)).toEqual(['100.25', '101.25', '102.25']);
    expect(tickLabels([0, 1e-8, 2e-8], 8)).toEqual(['0', '0.00000001', '0.00000002']);
    expect(tickLabels([0, 0.005, 0.01], 3)).toEqual(['0', '0.005', '0.01']);
    expect(tickLabels([0, -0, -1000], 2)).toEqual(['0', '0', '−1,000']);
    expect(tickLabels([], 2)).toEqual([]);
  });
  it('uses grouped equity ticks and compact drawdown ticks with a translated suffix', () => {
    expect(priceFormat(1).tickmarksFormatter([100_000, 110_000])).toEqual(['100,000', '110,000']);
    const thousands = (value: string) => `${value}k`;
    expect(drawdownTickLabels([0, -3900, -7800], thousands)).toEqual(['0', '−3.9k', '−7.8k']);
    expect(drawdownTickLabels([0, -250, -500], thousands)).toEqual(['0', '−250', '−500']);
    expect(drawdownTickLabels([-1000, -1001], thousands)).toEqual(['−1k', '−1.001k']);
  });
});

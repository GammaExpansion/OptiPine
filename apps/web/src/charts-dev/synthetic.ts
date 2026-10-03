import type { MarketBar } from '@pine/engine';

/** Fixed end, seed and hourly spacing make screenshots and large-data checks repeatable. */
export function syntheticBars(count = 20_496): MarketBar[] {
  const end = Date.UTC(2025, 4, 4, 23) / 1000;
  let seed = 2025;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  let previous = 94_000;
  return Array.from({ length: count }, (_, index) => {
    const open = previous;
    const close =
      94_000 +
      index * 0.08 +
      950 * Math.sin(index / 21) +
      600 * Math.sin(index / 79) +
      (random() - 0.5) * 200;
    const high = Math.max(open, close) + 50 + random() * 100;
    const low = Math.min(open, close) - 50 - random() * 100;
    previous = close;
    return {
      time: end - (count - index - 1) * 3600,
      open,
      high,
      low,
      close,
      volume: 20 + random() * 80,
    };
  });
}

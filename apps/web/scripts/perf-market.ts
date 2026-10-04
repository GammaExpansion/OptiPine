import type { MarketBar } from '@pine/engine';

/** Aggregate only complete UTC buckets; prices and volume all come from the hourly recording. */
export function aggregateHours(bars: readonly MarketBar[], hours: number): MarketBar[] {
  if (!Number.isInteger(hours) || hours < 1)
    throw new Error('Expected a positive integer hour count');
  const groups = new Map<number, MarketBar[]>();
  for (const bar of bars) {
    const time = Math.floor(bar.time / (hours * 3600)) * hours * 3600;
    const group = groups.get(time) ?? [];
    group.push(bar);
    groups.set(time, group);
  }
  return [...groups].flatMap(([time, group]) => {
    if (group.length !== hours || group.some((bar, index) => bar.time !== time + index * 3600))
      return [];
    return [
      {
        time,
        open: group[0].open,
        high: Math.max(...group.map((bar) => bar.high)),
        low: Math.min(...group.map((bar) => bar.low)),
        close: group.at(-1)!.close,
        volume: group.reduce((sum, bar) => sum + bar.volume, 0),
      },
    ];
  });
}

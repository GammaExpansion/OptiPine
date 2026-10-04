import { consecutiveLossesMetric, scoreMetric } from '@pine/optimizer';
import type { OptimizationTrial } from '@pine/workers';
import { selectionRecords } from './walk-forward.ts';

const batchSize = 32;
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * A first report-name lookup parses every metric in a trial. Keep those lookups in small tasks
 * when a window finishes; a few thousand synchronous lookups otherwise block the page for
 * hundreds of milliseconds. The analysis Worker still performs selection on the compact records.
 */
export async function windowSelectionRecords(
  trials: readonly OptimizationTrial[],
  metrics: readonly string[],
  cache: Map<string, readonly (number | null)[]>,
  yieldToHost: () => Promise<void> = yieldTask,
) {
  const missing = metrics
    .filter(
      (metric) => metric !== consecutiveLossesMetric && cache.get(metric)?.length !== trials.length,
    )
    .map((metric) => ({ metric, values: new Array<number | null>(trials.length) }));
  if (missing.length) {
    for (let start = 0; start < trials.length; start += batchSize) {
      if (trials.length > batchSize) await yieldToHost();
      for (let index = start; index < Math.min(trials.length, start + batchSize); index++)
        for (const column of missing)
          column.values[index] = scoreMetric(trials[index].metrics, column.metric);
    }
    for (const column of missing) cache.set(column.metric, column.values);
  }
  return selectionRecords(trials, metrics, cache);
}

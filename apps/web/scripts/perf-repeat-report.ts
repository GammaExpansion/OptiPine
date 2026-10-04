import { readFile } from 'node:fs/promises';
import { statistics } from './perf-statistics.ts';

const directories = process.argv.slice(2);
if (!directories.length)
  throw new Error('Usage: node scripts/perf-repeat-report.ts <report directory> [...]');
type Observation = {
  name: string;
  tasks: { max: number | null; count: number };
  frames: { over50: number };
  errors: string[];
  interactionErrors: string[];
};
const byScenario = new Map<string, Observation[]>();
for (const directory of directories) {
  const report: { reports: Observation[] } = JSON.parse(
    await readFile(`${directory}/report.json`, 'utf8'),
  );
  for (const observation of report.reports) {
    if (observation.errors.length || observation.interactionErrors.length)
      throw new Error(`Invalid repetition: ${directory}/${observation.name}`);
    const group = byScenario.get(observation.name) ?? [];
    group.push(observation);
    byScenario.set(observation.name, group);
  }
}
console.log(
  JSON.stringify(
    Object.fromEntries(
      [...byScenario].map(([name, observations]) => {
        if (observations.length !== directories.length)
          throw new Error(`Missing repetition for ${name}`);
        // Zero means no task crossed the long-task threshold, not that the page did no work.
        const samples = {
          longTaskMaxMs: observations.map((item) => item.tasks.max ?? 0),
          longTaskCount: observations.map((item) => item.tasks.count),
          framesOver50: observations.map((item) => item.frames.over50),
        };
        return [
          name,
          Object.fromEntries(
            Object.entries(samples).map(([metric, values]) => {
              const result = statistics(values);
              return [metric, { values, median: result.p50, max: result.max }];
            }),
          ),
        ];
      }),
    ),
    null,
    2,
  ),
);

import { readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { SourceMap } from 'node:module';
import { basename, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import {
  longestTasks,
  taskSamples,
  traceEventLine,
  type Profile,
  type TraceEvent,
} from './perf-trace.ts';

const prefix = process.argv[2];
if (!prefix) throw new Error('Usage: node scripts/perf-trace-report.ts <scenario file prefix>');
// CDP's JSON stream writes one event per line. Read incrementally: a full-run trace can exceed
// V8's string limit. Worker events are irrelevant to main-thread task attribution.
const events: TraceEvent[] = [];
const mainThreads = new Set<string>();
for await (const line of createInterface({ input: createReadStream(`${prefix}.trace.json`) })) {
  const event = traceEventLine(line);
  if (!event) continue;
  const key = `${event.pid}:${event.tid}`;
  if (event.name === 'thread_name' && event.args?.name === 'CrRendererMain') mainThreads.add(key);
  if (mainThreads.has(key) && (event.ph === 'X' || event.name.startsWith('perf-live-')))
    events.push(event);
}
const profile: Profile = JSON.parse(await readFile(`${prefix}.cpuprofile`, 'utf8'));
const maps = new Map<string, SourceMap | null>();
for (const node of profile.nodes) {
  const url = node.callFrame.url;
  if (!url || maps.has(url)) continue;
  try {
    maps.set(
      url,
      new SourceMap(
        JSON.parse(await readFile(`${dirname(prefix)}/assets/${basename(url)}.map`, 'utf8')),
      ),
    );
  } catch {
    maps.set(url, null);
  }
}
function location(frame: Profile['nodes'][number]['callFrame']) {
  const mapped = maps.get(frame.url)?.findEntry(frame.lineNumber, frame.columnNumber);
  const entry = mapped && 'originalSource' in mapped ? mapped : undefined;
  const name = entry && 'name' in entry && typeof entry.name === 'string' ? entry.name : '';
  return {
    function: name || frame.functionName || '(anonymous)',
    module: entry?.originalSource ?? frame.url,
    line: (entry?.originalLine ?? frame.lineNumber) + 1,
    column: (entry?.originalColumn ?? frame.columnNumber) + 1,
  };
}
const report = longestTasks(events).map(({ task, afterStartMs, events }) => {
  const samples = taskSamples(profile, task);
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  return {
    afterStartMs,
    wallMs: (task.dur ?? 0) / 1_000,
    threadMs: (task.tdur ?? 0) / 1_000,
    timeline: events
      .sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0))
      .slice(0, 20)
      .map((event) => ({ name: event.name, ms: (event.dur ?? 0) / 1_000, args: event.args })),
    self: [...samples]
      .sort((a, b) => b.selfUs - a.selfUs)
      .slice(0, 15)
      .map((node) => ({
        ...location(node.callFrame),
        ms: node.selfUs / 1_000,
        parent: node.parent ? location(nodes.get(node.parent)!.callFrame) : null,
      })),
    inclusive: [...samples]
      .sort((a, b) => b.inclusiveUs - a.inclusiveUs)
      .slice(0, 20)
      .map((node) => ({ ...location(node.callFrame), ms: node.inclusiveUs / 1_000 })),
    application: [...samples]
      .filter((node) => /\/(src|packages)\//.test(location(node.callFrame).module))
      .sort((a, b) => b.inclusiveUs - a.inclusiveUs)
      .slice(0, 15)
      .map((node) => ({ ...location(node.callFrame), ms: node.inclusiveUs / 1_000 })),
  };
});
await writeFile(`${prefix}-attribution.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

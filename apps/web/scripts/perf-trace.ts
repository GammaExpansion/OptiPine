export type TraceEvent = {
  name: string;
  ph: string;
  pid: number;
  tid: number;
  ts: number;
  dur?: number;
  tdur?: number;
  args?: { name?: string; data?: Record<string, unknown> };
};

export type Profile = {
  startTime: number;
  nodes: {
    id: number;
    callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
    children?: number[];
  }[];
  samples: number[];
  timeDeltas: number[];
};

/** CDP ReturnAsStream JSON uses one event per line, with metadata after the final event. */
export function traceEventLine(line: string): TraceEvent | null {
  if (!line.startsWith('{"args":')) return null;
  return JSON.parse(line.replace(/\],"metadata":$/, '').replace(/,$/, ''));
}

/** Trace and V8 profile timestamps share Chrome's monotonic clock, in microseconds. */
export function longestTasks(events: readonly TraceEvent[], count = 5) {
  const start = events.find((event) => event.name === 'perf-live-begin');
  const end = events.find((event) => event.name === 'perf-live-end');
  if (!start || !end) throw new Error('Trace is missing live measurement marks');
  const main = events.filter((event) => event.pid === start.pid && event.tid === start.tid);
  return main
    .filter(
      (event) =>
        event.name === 'RunTask' && event.ph === 'X' && event.ts >= start.ts && event.ts < end.ts,
    )
    .sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0))
    .slice(0, count)
    .map((task) => ({
      task,
      afterStartMs: (task.ts - start.ts) / 1_000,
      events: main.filter(
        (event) =>
          event !== task &&
          event.ph === 'X' &&
          event.ts >= task.ts &&
          event.ts < task.ts + (task.dur ?? 0),
      ),
    }));
}

/** Sample weights are clipped to the task; inclusive and self weights are distinct. */
export function taskSamples(profile: Profile, task: TraceEvent) {
  const parents = new Map<number, number>();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parents.set(child, node.id);
  const weights = new Map<number, { selfUs: number; inclusiveUs: number }>();
  let at = profile.startTime;
  for (let index = 0; index < profile.samples.length; index++) {
    const next = at + profile.timeDeltas[index];
    const weight = Math.max(0, Math.min(next, task.ts + (task.dur ?? 0)) - Math.max(at, task.ts));
    at = next;
    if (!weight) continue;
    let id: number | undefined = profile.samples[index];
    let self = true;
    while (id !== undefined) {
      const entry = weights.get(id) ?? { selfUs: 0, inclusiveUs: 0 };
      if (self) entry.selfUs += weight;
      entry.inclusiveUs += weight;
      weights.set(id, entry);
      id = parents.get(id);
      self = false;
    }
  }
  return profile.nodes.flatMap((node) => {
    const weight = weights.get(node.id);
    return weight ? [{ ...node, ...weight, parent: parents.get(node.id) }] : [];
  });
}

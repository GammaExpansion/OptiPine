import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { longestTasks, taskSamples, traceEventLine, type TraceEvent } from './perf-trace.ts';

const task: TraceEvent = { name: 'RunTask', ph: 'X', pid: 1, tid: 2, ts: 10, dur: 20 };

test('CDP stream lines preserve the final event and ignore the envelope and metadata', () => {
  const event = { args: {}, ...task };
  for (const suffix of [',', '],"metadata":'])
    assert.deepEqual(traceEventLine(JSON.stringify(event) + suffix), event);
  assert.equal(traceEventLine('{"traceEvents":['), null);
  assert.equal(traceEventLine('{"clock-domain":"WIN_QPC"}'), null);
});

test('trace selection excludes other threads and work outside the marked measurement', () => {
  const child = { ...task, name: 'Layout', ts: 12, dur: 5 };
  const results = longestTasks([
    { ...task, name: 'perf-live-begin', ph: 'I', ts: 9 },
    { ...task, name: 'perf-live-end', ph: 'I', ts: 40 },
    { ...task, tid: 3, dur: 500 },
    { ...task, ts: 0, dur: 100 },
    { ...task, ts: 45, dur: 100 },
    task,
    child,
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].task, task);
  assert.deepEqual(results[0].events, [child]);
  assert.throws(() => longestTasks([]), /missing/);
});

test('samples are clipped at both boundaries without double-counting parent self time', () => {
  const callFrame = { functionName: '', url: '', lineNumber: 0, columnNumber: 0 };
  const weights = taskSamples(
    {
      startTime: 0,
      nodes: [
        { id: 1, callFrame, children: [2] },
        { id: 2, callFrame },
      ],
      samples: [2, 1, 2],
      timeDeltas: [15, 10, 15],
    },
    task,
  );
  assert.deepEqual(
    weights.map(({ selfUs, inclusiveUs }) => ({ selfUs, inclusiveUs })),
    [
      { selfUs: 10, inclusiveUs: 20 },
      { selfUs: 10, inclusiveUs: 10 },
    ],
  );
});

test('trace report joins the renderer timeline to source-mapped CPU samples', () => {
  const root = mkdtempSync(join(tmpdir(), 'pine-perf-trace-'));
  const prefix = join(root, 'scenario');
  try {
    mkdirSync(join(root, 'assets'));
    writeFileSync(
      join(root, 'assets/app.js.map'),
      JSON.stringify({
        version: 3,
        sources: ['src/draw.ts'],
        names: ['drawChart'],
        mappings: 'AAAAA',
      }),
    );
    const events = [
      { ...task, ph: 'M', name: 'thread_name', args: { name: 'CrRendererMain' } },
      { ...task, ph: 'I', name: 'perf-live-begin', ts: 0 },
      task,
      { ...task, tid: 3, dur: 999 },
      { ...task, name: 'Layout', ts: 12, dur: 3 },
      { ...task, ph: 'I', name: 'perf-live-end', ts: 40 },
    ];
    writeFileSync(
      `${prefix}.trace.json`,
      '{"traceEvents":[\n' +
        events.map((event) => JSON.stringify({ args: {}, ...event })).join(',\n') +
        '],"metadata":\n{}',
    );
    writeFileSync(
      `${prefix}.cpuprofile`,
      JSON.stringify({
        startTime: 0,
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'a',
              url: 'http://localhost/assets/app.js',
              lineNumber: 0,
              columnNumber: 0,
            },
          },
        ],
        samples: [1],
        timeDeltas: [40],
      }),
    );
    const script = fileURLToPath(new URL('./perf-trace-report.ts', import.meta.url));
    execFileSync(process.execPath, [script, prefix], { stdio: 'pipe' });
    const result = JSON.parse(readFileSync(`${prefix}-attribution.json`, 'utf8'));
    assert.equal(result.length, 1);
    assert.equal(result[0].wallMs, 0.02);
    assert.equal(result[0].self[0].function, 'drawChart');
    assert.equal(result[0].self[0].module, 'src/draw.ts');
    assert.equal(result[0].self[0].ms, 0.02);
    assert.equal(result[0].timeline[0].name, 'Layout');
  } finally {
    rmSync(root, { recursive: true });
  }
});

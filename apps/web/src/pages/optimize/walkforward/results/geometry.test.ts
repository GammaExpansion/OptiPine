import { expect, it, vi } from 'vitest';
import { equitySegments, summaryGeometry, valueScale, windowSeries } from './geometry.ts';
import { drawSummary, type ChartCopy } from './draw.ts';
import { resultsFixture } from './fixture.ts';
import { fixtureMap } from '../stability/fixture.ts';

it('breaks stitched lines at failed/null/nonfinite samples and preserves real bar times', () => {
  expect(
    equitySegments(
      [1, 2, 5, 6, 10, 11],
      [100, 110, null, 130, NaN, 150],
      (n) => n * 2,
      (n) => n / 10,
    ),
  ).toEqual([
    [
      { x: 2, y: 10 },
      { x: 4, y: 11 },
    ],
    [{ x: 12, y: 13 }],
    [{ x: 22, y: 15 }],
  ]);
  expect(
    equitySegments(
      [],
      [1],
      (n) => n,
      (n) => n,
    ),
  ).toEqual([]);
  const view = resultsFixture();
  const series = windowSeries(view, view.windows[5], 'oos');
  expect(series.times).toHaveLength(34);
  expect(series.times[0]).toBe(view.windows[5].plan.outOfSampleStart);
  expect(series.times.at(-1)).toBe(view.windows[5].plan.outOfSampleEnd - 86400);
  expect(windowSeries(view, view.windows[0], 'is').times).toHaveLength(365);
});

it('keeps flat and empty scales finite and projects anchored and partial windows onto one time axis', () => {
  for (const values of [[100, 100], [], [null, NaN]]) {
    const scale = valueScale(values, 10, 100);
    expect(Number.isFinite(scale.y(100))).toBe(true);
    expect(scale.max).toBeGreaterThan(scale.min);
  }
  const view = resultsFixture();
  const geometry = summaryGeometry(view.windows, 1104, 330, 'stitched');
  expect(geometry.lanes[0].isEnd).toBe(geometry.lanes[0].oosStart);
  expect(geometry.lanes[5].oosEnd - geometry.lanes[5].oosStart).toBeLessThan(
    geometry.lanes[0].oosEnd - geometry.lanes[0].oosStart,
  );
  const anchored = view.windows.map((window) => ({
    ...window,
    plan: { ...window.plan, inSampleStart: view.windows[0].plan.inSampleStart },
  }));
  const lanes = summaryGeometry(anchored, 1104, 330, 'windows').lanes;
  expect(new Set(lanes.map((lane) => lane.isStart)).size).toBe(1);
  expect(lanes[5].isEnd).toBeGreaterThan(lanes[0].isEnd);
});

it('draws dashed IS and solid OOS equity, selected lanes, and waiting states from the snapshot', () => {
  const context = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 36 }),
  };
  const view = resultsFixture('live');
  const copy: ChartCopy = {
    windows: view.windows.map((window) => ({
      label: String(window.plan.index),
      net: 'net',
      compact: 'compact',
      is: 'is',
      equity: 'equity',
      status: window.status,
    })),
    ticks: [{ time: view.times[180], label: 'date' }],
    value: String,
  };
  drawSummary(context as unknown as CanvasRenderingContext2D, view, 'windows', 1104, 330, copy);
  expect(context.setLineDash).toHaveBeenCalledWith([3, 2]);
  expect(context.setLineDash).toHaveBeenCalledWith([]);
  expect(context.strokeRect).toHaveBeenCalledTimes(1);
  expect(context.fillText.mock.calls.some(([text]) => text === 'waiting')).toBe(true);
  expect(context.fillText.mock.calls.some(([text]) => text === 'running')).toBe(true);
  drawSummary(context as unknown as CanvasRenderingContext2D, view, 'stitched', 1104, 330, copy);
  expect(context.arc).toHaveBeenCalledTimes(1);
  expect(context.fill).toHaveBeenCalled();
});

it('builds consistent complete, live and flat fixtures without importing a production hook', () => {
  for (const scenario of ['complete', 'live', 'flat'] as const) {
    const view = resultsFixture(scenario);
    expect(view.equity.times).toHaveLength(view.equity.values.length);
    expect(view.equity.values.at(-1)).toBe(100000 + view.totals.outOfSampleNet!);
    for (const window of view.windows) {
      if (window.status === 'waiting' || window.status === 'running') {
        expect(window.outOfSampleEquity).toEqual([]);
        expect(window.parameters).toBeNull();
      } else expect(window.outOfSampleEquity).toHaveLength(window.plan.outOfSampleBars);
    }
  }
  const view = resultsFixture();
  expect(fixtureMap(view, { surface: 'mean' }).panel.cells.map((cell) => cell.value)).not.toEqual(
    view.map!.panel.cells.map((cell) => cell.value),
  );
});

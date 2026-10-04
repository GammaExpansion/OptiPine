import { expect, it, vi } from 'vitest';
import type { IChartApi } from 'lightweight-charts';
import { rangePrimitive, windowBands, windowView } from './rangePrimitive.ts';

const hour = 3600;
// Ten hourly bars from hour 0; the window's IS is hours 2–5 and its OOS hours 6–7.
const times = Array.from({ length: 10 }, (_, index) => index * hour);
const ranges = {
  inSample: { start: 2 * hour, end: 6 * hour },
  outOfSample: { start: 6 * hour, end: 8 * hour },
};

it('places a window on the bars as edges between them, and frames its OOS range first', () => {
  expect(windowBands(times, ranges)).toEqual({ from: 2, split: 6, to: 8 });
  // A partial final window ends with the data.
  expect(
    windowBands(times, { ...ranges, outOfSample: { start: 6 * hour, end: 20 * hour } }),
  ).toEqual({ from: 2, split: 6, to: 10 });
  expect(
    windowBands(times, { inSample: { start: 0, end: 0 }, outOfSample: { start: 0, end: 0 } }),
  ).toBeNull();
  // The split a fifth of the way in, the OOS range after it, within the window and the width.
  expect(windowView({ from: 2, split: 6, to: 8 }, 100)).toEqual({ from: 5.5, to: 8 });
  expect(windowView({ from: 0, split: 1000, to: 3000 }, 1000)).toEqual({ from: 800, to: 1800 });
  expect(windowView({ from: 5.9, split: 6, to: 8 }, 100)).toEqual({ from: 5.9, to: 8.4 });
});

it('shades the IS and OOS bands behind the candles with the split line and labels', () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
  const update = vi.fn();
  const chart = {
    // Whole bars only, as Lightweight Charts places them: a fraction has no coordinate.
    timeScale: () => ({
      logicalToCoordinate: (logical: number) => (Number.isInteger(logical) ? logical * 10 : 0),
    }),
  } as unknown as IChartApi;
  const ranged = rangePrimitive(chart, () => times, {
    inSample: 'blue',
    outOfSample: 'amber',
    split: 'orange',
    font: 'Barlow',
    labels: { inSample: 'IS', outOfSample: 'OOS' },
  });
  ranged.primitive.attached!({ requestUpdate: update } as never);
  const view = ranged.primitive.paneViews!()[0];
  expect(view.zOrder!()).toBe('bottom');
  const draw = () =>
    view.renderer()!.draw({
      useMediaCoordinateSpace: (callback: (scope: unknown) => void) =>
        callback({ context, mediaSize: { width: 200, height: 100 } }),
    } as never);
  draw();
  expect(context.fillRect).not.toHaveBeenCalled();
  ranged.setRanges(ranges);
  expect(update).toHaveBeenCalledTimes(1);
  draw();
  expect(context.fillRect.mock.calls).toEqual([
    [15, 0, 40, 100],
    [55, 0, 20, 100],
  ]);
  expect(context.moveTo).toHaveBeenCalledWith(55.5, 0);
  expect(context.fillText.mock.calls).toEqual([
    ['IS', 47, 94],
    ['OOS', 63, 94],
  ]);
});

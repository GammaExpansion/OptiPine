// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { IChartApi, ISeriesApi, SeriesType, Logical } from 'lightweight-charts';
import type { PlotShape } from '@pine/engine';
import type { PlotMarker } from './model.ts';
import { drawPlotMarker, plotPrimitive } from './plotPrimitive.ts';

function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
  };
}
const marker: PlotMarker = {
  time: 50,
  value: 30,
  location: 'absolute',
  color: '#12345680',
  size: 'tiny',
};

it('draws distinct Pine shapes and verbatim characters/text with their size and alpha', () => {
  const shapes: PlotShape[] = [
    'triangleup',
    'triangledown',
    'arrowup',
    'arrowdown',
    'circle',
    'square',
    'diamond',
    'cross',
    'xcross',
    'flag',
    'labelup',
    'labeldown',
  ];
  const geometries = shapes.map((shape) => {
    const ctx = context();
    drawPlotMarker(ctx as unknown as CanvasRenderingContext2D, { ...marker, shape }, 10, 20);
    expect(ctx.translate).toHaveBeenCalledWith(10, 20);
    expect(ctx.fillStyle).toBe('#12345680');
    return JSON.stringify([
      ctx.moveTo.mock.calls,
      ctx.lineTo.mock.calls,
      ctx.rect.mock.calls,
      ctx.arc.mock.calls,
      ctx.rotate.mock.calls,
    ]);
  });
  expect(new Set(geometries).size).toBe(shapes.length);
  const ctx = context();
  drawPlotMarker(
    ctx as unknown as CanvasRenderingContext2D,
    { ...marker, char: '★', text: '<Buy>', location: 'belowbar', size: 'huge' },
    0,
    0,
  );
  expect(ctx.fillText.mock.calls).toEqual([
    ['★', 0, 0],
    ['<Buy>', 0, 23],
  ]);
  expect(ctx.arc).not.toHaveBeenCalled();
});

it('culls 100,000 offscreen signals and anchors above/below, absolute and pane-edge locations', () => {
  const chart = {
    timeScale: () => ({
      getVisibleRange: () => ({ from: 50, to: 54 }),
      timeToCoordinate: (time: number) => time - 50,
    }),
  } as unknown as IChartApi;
  const priceToCoordinate = vi.fn((price: number) => price);
  const series = { priceToCoordinate } as unknown as ISeriesApi<SeriesType>;
  const locations = ['abovebar', 'belowbar', 'absolute', 'top', 'bottom'] as const;
  const markers = Array.from({ length: 100_000 }, (_, time) => ({
    ...marker,
    time,
    shape: 'circle' as const,
    location: locations[time % 5],
  }));
  const primitive = plotPrimitive(chart, series, markers);
  const ctx = context();
  primitive.paneViews!()[0]
    .renderer()!
    .draw({
      useMediaCoordinateSpace: (callback: (scope: unknown) => void) =>
        callback({ context: ctx, mediaSize: { height: 100, width: 100 } }),
    } as never);
  expect(ctx.translate.mock.calls).toEqual([
    [0, 19],
    [1, 41],
    [2, 30],
    [3, 11],
    [4, 89],
  ]);
  expect(priceToCoordinate).toHaveBeenCalledTimes(5);
  const spaced = plotPrimitive(chart, series, markers, [
    { time: 51, location: 'abovebar' },
    { time: 50, location: 'belowbar' },
  ]);
  ctx.translate.mockClear();
  spaced.paneViews!()[0]
    .renderer()!
    .draw({
      useMediaCoordinateSpace: (callback: (scope: unknown) => void) =>
        callback({ context: ctx, mediaSize: { height: 100, width: 100 } }),
    } as never);
  expect(ctx.translate.mock.calls).toEqual([
    [0, -5],
    [1, 65],
    [2, 30],
    [3, 11],
    [4, 89],
  ]);
  expect(spaced.autoscaleInfo!(0 as Logical, 100 as Logical)).toEqual({
    priceRange: null,
    margins: { above: 41, below: 41 },
  });
});

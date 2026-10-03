import { expect, it, vi } from 'vitest';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { pointLabelPrimitive } from './pointLabelPrimitive.ts';

it('keeps peak text inside either edge, tracks price scaling, and hides offscreen points', () => {
  let x = 0;
  let y = 30;
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: () => ({ width: 70 }),
  };
  const primitive = pointLabelPrimitive(
    { timeScale: () => ({ timeToCoordinate: () => x }) } as unknown as IChartApi,
    { priceToCoordinate: () => y } as unknown as ISeriesApi<'Area'>,
    { time: 1, value: 100000, text: 'Peak 100,000' },
    { color: 'gray', background: 'black', font: 'Barlow' },
  );
  const draw = () =>
    primitive.paneViews!()[0]
      .renderer()!
      .draw({
        useMediaCoordinateSpace: (callback: (scope: unknown) => void) =>
          callback({ context, mediaSize: { width: 200, height: 100 } }),
      } as never);
  draw();
  expect(context.fillText).toHaveBeenLastCalledWith('Peak 100,000', 4, 9);
  expect(context.arc).toHaveBeenLastCalledWith(0, 30, 3, 0, Math.PI * 2);
  x = 198;
  y = 10;
  draw();
  expect(context.fillText).toHaveBeenLastCalledWith('Peak 100,000', 126, 3);
  x = -1;
  draw();
  expect(context.fillText).toHaveBeenCalledTimes(2);
});

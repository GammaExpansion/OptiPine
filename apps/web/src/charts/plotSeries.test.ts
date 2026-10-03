// @vitest-environment node
import { expect, it, vi } from 'vitest';
import {
  AreaSeries,
  HistogramSeries,
  LineSeries,
  LineType,
  type IChartApi,
} from 'lightweight-charts';
import { mapPlots } from './model.ts';
import { addPlotSeries } from './plotSeries.ts';

it('chooses native series, applies width and steps, and carries colours into every area field', () => {
  const setData = vi.fn();
  const applyOptions = vi.fn();
  const addSeries = vi.fn((..._args: unknown[]) => ({
    setData,
    priceScale: () => ({ applyOptions }),
  }));
  const chart = { addSeries } as unknown as IChartApi;
  const bars = [1, 2, 3].map((time) => ({ time, open: 1, high: 3, low: 0, close: 2, volume: 1 }));
  for (const [style, definition] of [
    ['histogram', HistogramSeries],
    ['columns', HistogramSeries],
    ['area', AreaSeries],
    ['circles', LineSeries],
    ['stepline', LineSeries],
  ] as const) {
    const [plot] = mapPlots(bars, [
      {
        title: 'p',
        values: [1, 2, 3],
        style: { kind: 'plot', style, linewidth: 6, color: '#123456' },
        colors: ['#ffffff80', null, '#123456'],
      },
    ]);
    addPlotSeries(chart, plot, 0.01);
    expect(addSeries.mock.calls.at(-1)?.[0]).toBe(definition);
    const options = (addSeries.mock.calls.at(-1) as unknown[])[1];
    if (definition !== HistogramSeries) expect(options).toMatchObject({ lineWidth: 6 });
    if (style === 'circles')
      expect(options).toMatchObject({
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 6,
      });
    if (style === 'stepline') expect(options).toMatchObject({ lineType: LineType.WithSteps });
    expect(setData.mock.calls.at(-1)?.[0][1]).toMatchObject(
      style === 'area'
        ? {
            color: 'transparent',
            lineColor: 'transparent',
            topColor: 'transparent',
            bottomColor: 'transparent',
          }
        : { color: 'transparent' },
    );
  }
});

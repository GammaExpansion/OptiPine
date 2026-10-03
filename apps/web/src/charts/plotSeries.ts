import {
  AreaSeries,
  HistogramSeries,
  LineSeries,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type LineWidth,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { mapPlots } from './model.ts';
import { priceFormat } from './formatting.ts';

/** Line, area and histogram series share the engine's colour and bar alignment. */
export function addPlotSeries(
  chart: IChartApi,
  plot: ReturnType<typeof mapPlots>[number],
  mintick: number,
): ISeriesApi<SeriesType> {
  const common = {
    priceLineVisible: false,
    lastValueVisible: false,
    priceFormat: priceFormat(plot.pane === 0 ? mintick : 0.01),
  };
  // The library's type lists 1–4, but its canvas renderer accepts any positive pixel width.
  const width = plot.linewidth as LineWidth;
  const points = plot.points.map((point) => ({ ...point, time: point.time as UTCTimestamp }));
  let series: ISeriesApi<SeriesType, Time>;
  if (plot.kind === 'histogram' || plot.kind === 'columns') {
    series = chart.addSeries(HistogramSeries, { ...common, color: plot.color, base: 0 }, plot.pane);
    series.setData(points);
  } else if (plot.kind === 'area') {
    series = chart.addSeries(
      AreaSeries,
      {
        ...common,
        lineColor: plot.color,
        topColor: plot.color,
        bottomColor: plot.color,
        lineWidth: width,
      },
      plot.pane,
    );
    series.setData(
      points.map((point) => ({
        ...point,
        lineColor: point.color,
        topColor: point.color,
        bottomColor: point.color,
      })),
    );
  } else {
    series = chart.addSeries(
      LineSeries,
      {
        ...common,
        color: plot.color,
        lineWidth: width,
        lineType: plot.stepped ? LineType.WithSteps : LineType.Simple,
        lineVisible: plot.kind === 'line',
        pointMarkersVisible: plot.kind === 'circles',
        pointMarkersRadius: plot.kind === 'circles' ? plot.linewidth : undefined,
        crosshairMarkerVisible: plot.kind === 'line' || plot.kind === 'circles',
        ...(plot.kind === 'markers' && !plot.absolute ? { priceScaleId: 'signals' } : {}),
      },
      plot.pane,
    );
    series.setData(points);
  }
  if (plot.pane === 1)
    series
      .priceScale()
      .applyOptions({ entireTextOnly: true, scaleMargins: { top: 0.1, bottom: 0.1 } });
  return series;
}

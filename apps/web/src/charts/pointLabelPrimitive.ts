import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';

/** Keep the annotation inside its pane while its dot stays anchored to the actual data point. */
export function pointLabelPrimitive(
  chart: IChartApi,
  series: ISeriesApi<'Area'>,
  point: { time: number; value: number; text: string },
  style: { color: string; background: string; font: string },
): ISeriesPrimitive<Time> {
  return {
    paneViews: () => [
      {
        zOrder: () => 'top',
        renderer: () => ({
          draw(target) {
            const x = chart.timeScale().timeToCoordinate(point.time as UTCTimestamp);
            const y = series.priceToCoordinate(point.value);
            if (x === null || y === null) return;
            target.useMediaCoordinateSpace(({ context, mediaSize }) => {
              if (x < 0 || x > mediaSize.width || y < 0 || y > mediaSize.height) return;
              context.save();
              context.font = `11px ${style.font}`;
              const width = context.measureText(point.text).width;
              const left = Math.max(4, Math.min(x - width / 2, mediaSize.width - width - 4));
              const top = Math.max(2, y - 22);
              context.fillStyle = style.background;
              context.fillRect(left - 2, top, width + 4, 15);
              context.fillStyle = style.color;
              context.textAlign = 'left';
              context.textBaseline = 'top';
              context.fillText(point.text, left, top + 1);
              context.beginPath();
              context.arc(x, y, 3, 0, Math.PI * 2);
              context.fill();
              context.restore();
            });
          },
        }),
      },
    ],
  };
}

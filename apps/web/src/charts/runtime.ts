import {
  ColorType,
  CrosshairMode,
  TickMarkType,
  type DeepPartial,
  type ChartOptions,
  type IChartApi,
  type Time,
} from 'lightweight-charts';

export function chartTheme(element: HTMLElement) {
  const css = getComputedStyle(element);
  const token = (name: string) => css.getPropertyValue(`--${name}`).trim();
  return {
    canvas: token('canvas'),
    panel: token('panel'),
    text: token('caption'),
    divider: token('divider'),
    profit: token('profit'),
    loss: token('loss'),
    primary: token('primary'),
    secondary: token('secondary'),
    font: token('font-body'),
  };
}

export function timeFormat(timezone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

export function chartOptions(element: HTMLElement, timezone: string): DeepPartial<ChartOptions> {
  const theme = chartTheme(element);
  const format = timeFormat(timezone);
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
  });
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: theme.canvas },
      textColor: theme.text,
      fontFamily: theme.font,
      fontSize: 11,
      attributionLogo: true,
      panes: { separatorColor: theme.divider, separatorHoverColor: theme.secondary },
    },
    grid: { vertLines: { color: theme.divider }, horzLines: { color: theme.divider } },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: {
      borderColor: theme.divider,
      minimumWidth: 76,
      scaleMargins: { top: 0.12, bottom: 0.16 },
    },
    timeScale: {
      borderColor: theme.divider,
      timeVisible: true,
      secondsVisible: false,
      tickMarkFormatter: (time: Time, kind: TickMarkType) => {
        const value = new Date(Number(time) * 1000);
        return kind >= TickMarkType.Time ? clock.format(value) : date.format(value);
      },
    },
    localization: {
      locale: 'en-US',
      timeFormatter: (time: Time) => format.format(Number(time) * 1000),
    },
  };
}

/** Keyboard zoom uses the same logical range as pointer zoom, with no data updates. */
export function zoomChart(chart: IChartApi, factor: number) {
  const range = chart.timeScale().getVisibleLogicalRange();
  if (!range) return;
  const center = (range.from + range.to) / 2;
  const half = Math.max(3, ((range.to - range.from) * factor) / 2);
  chart.timeScale().setVisibleLogicalRange({ from: center - half, to: center + half });
}

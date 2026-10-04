import {
  ColorType,
  CrosshairMode,
  TickMarkType,
  type DeepPartial,
  type ChartOptions,
  type IChartApi,
  type Time,
  type TickMarkFormatter,
} from 'lightweight-charts';
import type { Language } from '../i18n/translate.ts';

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
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return {
    format(value: number) {
      const parts = Object.fromEntries(
        date.formatToParts(value).map(({ type, value }) => [type, value]),
      );
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    },
  };
}

/** The library clips scrollable edge ticks; omit labels whose complete text cannot fit. */
export function keepTimeLabelsInside(chart: IChartApi, format: TickMarkFormatter) {
  const scale = chart.timeScale();
  const options = chart.options();
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `600 ${options.layout.fontSize}px ${options.layout.fontFamily}`;
  const refresh = () =>
    chart.applyOptions({
      timeScale: {
        tickMarkFormatter: (time: Time, kind: TickMarkType, locale: string) => {
          const label = format(time, kind, locale);
          const x = scale.timeToCoordinate(time);
          if (label === null || x === null) return label;
          const half = measure.measureText(label).width / 2 + 2;
          return x < half || x + half > scale.width() ? '' : label;
        },
      },
    });
  scale.subscribeVisibleLogicalRangeChange(refresh);
  scale.subscribeSizeChange(refresh);
  refresh();
  return () => {
    scale.unsubscribeVisibleLogicalRangeChange(refresh);
    scale.unsubscribeSizeChange(refresh);
  };
}

/** The locale a chart's day ticks follow: "Sep 28" in English, "9月28日" in Chinese. */
const chartLocales: Record<Language, string> = { en: 'en-US', zh: 'zh-CN' };

export function chartOptions(
  element: HTMLElement,
  timezone: string,
  language: Language,
): DeepPartial<ChartOptions> & { timeScale: { tickMarkFormatter: TickMarkFormatter } } {
  const theme = chartTheme(element);
  const format = timeFormat(timezone);
  const locale = chartLocales[language];
  const date = new Intl.DateTimeFormat(locale, {
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
      locale,
      timeFormatter: (time: Time) => format.format(Number(time) * 1000),
    },
  } satisfies DeepPartial<ChartOptions>;
}

/** Keyboard zoom uses the same logical range as pointer zoom, with no data updates. */
export function zoomChart(chart: IChartApi, factor: number) {
  const range = chart.timeScale().getVisibleLogicalRange();
  if (!range) return;
  const center = (range.from + range.to) / 2;
  const half = Math.max(3, ((range.to - range.from) * factor) / 2);
  chart.timeScale().setVisibleLogicalRange({ from: center - half, to: center + half });
}

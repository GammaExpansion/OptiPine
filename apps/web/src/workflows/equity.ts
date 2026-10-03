import { dateParts } from '@pine/engine/calendar';

export interface EquityInput {
  /** Account equity after each bar, open positions marked to the close (`runWithEquity`). */
  readonly equity: readonly number[];
  /** Bar open times in Unix seconds, aligned with `equity`. */
  readonly times: readonly number[];
  readonly initialCapital: number;
  /** The symbol's IANA time zone: trading days and months are counted in it. */
  readonly timezone: string;
}

export interface EquityPoint {
  readonly time: number;
  readonly equity: number;
}

/** The largest decline of bar-close equity from a preceding peak. */
export interface MaxDrawdown {
  /** The decline as a positive amount. */
  readonly amount: number;
  /** The decline as a percentage of the peak. */
  readonly percent: number;
  /**
   * Where the decline started: the initial capital at the first bar when equity never rose
   * above it.
   */
  readonly peak: EquityPoint;
  readonly trough: EquityPoint;
  /** The first bar back at the peak, or null while the drawdown lasts ("no new high"). */
  readonly recovery: EquityPoint | null;
  /** Whole days from the peak to the recovery, or to the last bar while the drawdown lasts. */
  readonly durationDays: number;
}

export interface DailyPnl {
  /** The calendar day in the symbol's time zone, `YYYY-MM-DD`. */
  readonly date: string;
  /** ISO weekday, 1 for Monday to 7 for Sunday: the calendar strip's row. */
  readonly weekday: number;
  /** Change of equity from the previous trading day's last bar; null on a day without bars. */
  readonly pnl: number | null;
  /** `pnl` as a percentage of the previous trading day's closing equity. */
  readonly percent: number | null;
}

export interface PeriodReturn {
  /** `YYYY-MM` for a month, `YYYY` for a year, in the symbol's time zone. */
  readonly period: string;
  /** Null for a period without bars. */
  readonly pnl: number | null;
  readonly percent: number | null;
}

/** The Equity tab's figures and series (B5). */
export interface EquitySummary {
  readonly endingEquity: number;
  /** Ending equity against the initial capital, in percent. */
  readonly totalReturn: number;
  /** Time from the first to the last bar in years of 365 days, as the engine's CAGR uses. */
  readonly years: number;
  /** Compound annual growth of the ending equity over `years`, in percent; null when undefined. */
  readonly annualizedReturn: number | null;
  readonly maxDrawdown: MaxDrawdown | null;
  /** Net change of equity over the max drawdown amount. */
  readonly returnOverMaxDrawdown: number | null;
  readonly winningDays: number;
  readonly losingDays: number;
  readonly bestDay: DailyPnl | null;
  readonly worstDay: DailyPnl | null;
  /** Per bar, equity minus its running peak (zero or negative). */
  readonly drawdown: readonly number[];
  /** Per bar, the same as a percentage of the running peak. */
  readonly drawdownPercent: readonly number[];
  /** Every calendar day from the first bar's to the last bar's, for the P&L calendar. */
  readonly days: readonly DailyPnl[];
  readonly months: readonly PeriodReturn[];
  readonly yearly: readonly PeriodReturn[];
}

const DAY = 86_400;
const pad = (value: number) => String(value).padStart(2, '0');
const isoDate = (parts: Record<string, number>) =>
  `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
/** Local wall-clock time minus UTC, in milliseconds, at `ms`. */
const offsetOf = (parts: Record<string, number>, ms: number) =>
  Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - ms;

/**
 * The calendar date of each time (Unix seconds, ascending) in `timezone`. A bar's date holds
 * until the next local midnight, so the time zone database is consulted twice per day rather
 * than once per bar.
 */
export function localDates(times: readonly number[], timezone: string): string[] {
  const dates: string[] = [];
  let end = -Infinity;
  let date = '';
  for (const time of times) {
    if (time >= end) {
      const parts = dateParts(time * 1000, timezone);
      const offset = offsetOf(parts, time * 1000);
      date = isoDate(parts);
      // The next midnight at this bar's UTC offset ends the date, provided the offset still
      // holds just before it. After a clock change later that day, the remaining bars of the
      // day look their date up one by one.
      end = (Date.UTC(parts.year, parts.month - 1, parts.day + 1) - offset) / 1000;
      if (offsetOf(dateParts((end - 1) * 1000, timezone), (end - 1) * 1000) !== offset) end = time;
    }
    dates.push(date);
  }
  return dates;
}

/** Closing equity per date with bars, in order. */
function dailyCloses(input: EquityInput): Map<string, number> {
  const closes = new Map<string, number>();
  localDates(input.times, input.timezone).forEach((date, index) =>
    closes.set(date, input.equity[index]),
  );
  return closes;
}

function* calendarDays(first: string, last: string): Generator<{ date: string; weekday: number }> {
  const [year, month, day] = first.split('-').map(Number);
  for (let offset = 0; ; offset++) {
    const value = new Date(Date.UTC(year, month - 1, day + offset));
    const date = value.toISOString().slice(0, 10);
    yield { date, weekday: value.getUTCDay() || 7 };
    if (date >= last) return;
  }
}

const change = (close: number, previous: number) => ({
  pnl: close - previous,
  percent: previous === 0 ? null : ((close - previous) * 100) / previous,
});

function dailyPnl(closes: Map<string, number>, initialCapital: number): DailyPnl[] {
  const dates = [...closes.keys()];
  const days: DailyPnl[] = [];
  let previous = initialCapital;
  for (const { date, weekday } of calendarDays(dates[0], dates.at(-1)!)) {
    const close = closes.get(date);
    if (close === undefined) {
      days.push({ date, weekday, pnl: null, percent: null });
      continue;
    }
    days.push({ date, weekday, ...change(close, previous) });
    previous = close;
  }
  return days;
}

/** Returns per month or year, from the last close of each period to the next. */
function periodReturns(
  closes: Map<string, number>,
  initialCapital: number,
  length: 4 | 7,
): PeriodReturn[] {
  const ends = new Map<string, number>();
  for (const [date, close] of closes) ends.set(date.slice(0, length), close);
  const keys = [...ends.keys()];
  const periods: PeriodReturn[] = [];
  let previous = initialCapital;
  let [year, month = 1] = keys[0].split('-').map(Number);
  for (;;) {
    const period = length === 4 ? String(year) : `${year}-${pad(month)}`;
    const close = ends.get(period);
    if (close === undefined) periods.push({ period, pnl: null, percent: null });
    else {
      periods.push({ period, ...change(close, previous) });
      previous = close;
    }
    if (period >= keys.at(-1)!) return periods;
    if (length === 4 || month === 12) {
      year++;
      month = 1;
    } else month++;
  }
}

function maxDrawdownOf(input: EquityInput): {
  drawdown: number[];
  drawdownPercent: number[];
  maxDrawdown: MaxDrawdown | null;
} {
  const { equity, times, initialCapital } = input;
  const drawdown: number[] = [];
  const drawdownPercent: number[] = [];
  let peak: EquityPoint = { time: times[0], equity: initialCapital };
  let amount = 0;
  let start = peak;
  let troughIndex = -1;
  for (let index = 0; index < equity.length; index++) {
    const value = equity[index];
    // An equal value moves the peak forward, so a flat stretch at the high is not counted.
    if (value >= peak.equity) peak = { time: times[index], equity: value };
    const decline = peak.equity - value;
    drawdown.push(value - peak.equity);
    drawdownPercent.push(peak.equity > 0 ? ((value - peak.equity) * 100) / peak.equity : 0);
    if (decline > amount) {
      amount = decline;
      start = peak;
      troughIndex = index;
    }
  }
  if (troughIndex < 0) return { drawdown, drawdownPercent, maxDrawdown: null };
  let recovery: EquityPoint | null = null;
  for (let index = troughIndex + 1; index < equity.length && !recovery; index++)
    if (equity[index] >= start.equity) recovery = { time: times[index], equity: equity[index] };
  return {
    drawdown,
    drawdownPercent,
    maxDrawdown: {
      amount,
      percent: start.equity > 0 ? (amount * 100) / start.equity : 0,
      peak: start,
      trough: { time: times[troughIndex], equity: equity[troughIndex] },
      recovery,
      durationDays: Math.floor(((recovery?.time ?? times.at(-1)!) - start.time) / DAY),
    },
  };
}

/**
 * The Equity tab from bar-close equity. Its drawdown compares the marked equity the tab draws with
 * that equity's own peaks, so it differs from the report's intrabar max drawdown, which compares
 * intrabar equity with realized-balance peaks. Returns null without equity (an indicator).
 */
export function equitySummary(input: EquityInput): EquitySummary | null {
  const { equity, times, initialCapital } = input;
  if (!equity.length || equity.length !== times.length) return null;
  const endingEquity = equity.at(-1)!;
  const years = (times.at(-1)! - times[0]) / (365 * DAY);
  const { drawdown, drawdownPercent, maxDrawdown } = maxDrawdownOf(input);
  const closes = dailyCloses(input);
  const days = dailyPnl(closes, initialCapital);
  let winningDays = 0;
  let losingDays = 0;
  let bestDay: DailyPnl | null = null;
  let worstDay: DailyPnl | null = null;
  for (const day of days) {
    if (day.pnl === null) continue;
    if (day.pnl > 0) winningDays++;
    if (day.pnl < 0) losingDays++;
    if (!bestDay || day.pnl > bestDay.pnl!) bestDay = day;
    if (!worstDay || day.pnl < worstDay.pnl!) worstDay = day;
  }
  return {
    endingEquity,
    totalReturn: ((endingEquity - initialCapital) * 100) / initialCapital,
    years,
    annualizedReturn:
      years > 0 && endingEquity > 0 && initialCapital > 0
        ? ((endingEquity / initialCapital) ** (1 / years) - 1) * 100
        : null,
    maxDrawdown,
    returnOverMaxDrawdown: maxDrawdown
      ? (endingEquity - initialCapital) / maxDrawdown.amount
      : null,
    winningDays,
    losingDays,
    bestDay,
    worstDay,
    drawdown,
    drawdownPercent,
    days,
    months: periodReturns(closes, initialCapital, 7),
    yearly: periodReturns(closes, initialCapital, 4),
  };
}

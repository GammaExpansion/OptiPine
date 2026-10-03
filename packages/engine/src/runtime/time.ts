import { SYMBOL_DEFAULTS } from './symbol-info.ts';
import type { RunInput } from '../types.ts';
import { Calendar } from '../calendar.ts';

const formatters = new Map<string, Intl.DateTimeFormat>();
export function dateParts(time: number, zone = 'UTC'): Record<string, number> {
  const fixed = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(zone);
  if (fixed)
    return dateParts(
      time + (fixed[1] === '-' ? -1 : 1) * (+fixed[2] * 60 + +(fixed[3] ?? 0)) * 60000,
      'UTC',
    );
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    });
    formatters.set(zone, formatter);
  }
  const p: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(time)))
    if (part.type !== 'literal') p[part.type] = +part.value;
  const day = Date.UTC(p.year, p.month - 1, p.day);
  p.dayofweek = new Date(day).getUTCDay() + 1;
  const thursday = new Date(day);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  p.weekofyear = Math.ceil(
    ((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7,
  );
  return p;
}
export function zonedTimestamp(
  zone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let result = target;
  for (let i = 0; i < 3; i++) {
    const p = dateParts(result, zone);
    result += target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return result;
}
export function timeframeSeconds(tf: string): number {
  const m = /^(\d*)([STDW M]?)$/.exec(tf.replace(' ', ''));
  if (!m) return NaN;
  return +(m[1] || 1) * ({ S: 1, T: 0, D: 86400, W: 604800, M: 2592000, '': 60 }[m[2]] ?? NaN);
}
export class Clock {
  input: RunInput;
  readonly calendar: Calendar;
  index = 0;
  zone: string;
  start: number;
  end: number;
  cache = new Map<string, unknown>();
  private currentParts?: Record<string, number>;
  private currentVwapAnchor?: boolean;
  /** The previous bar's day alignment was the last one computed; reuse it. */
  private lastDayAlignment?: { time: number; value: number };
  constructor(input: RunInput) {
    this.input = input;
    this.calendar = new Calendar(input.sessionCalendar);
    this.zone = String(input.syminfo.timezone ?? SYMBOL_DEFAULTS.timezone);
    const session = String(input.syminfo.session_hours ?? SYMBOL_DEFAULTS.session_hours).split(
      ':',
    )[0];
    const [start, end] = session.split('-');
    const minute = (x: string) => +x.slice(0, 2) * 60 + +x.slice(2, 4);
    this.start = minute(start);
    this.end = minute(end) || 1440;
  }
  get time(): number {
    return this.input.bars[this.index].time * 1000;
  }
  get parts(): Record<string, number> {
    return (this.currentParts ??= dateParts(this.time, this.zone));
  }
  setIndex(index: number): void {
    this.index = index;
    this.cache.clear();
    this.currentParts = undefined;
    this.currentVwapAnchor = undefined;
  }
  dayStart(time = this.time, sessionStart = this.start, zone = this.zone): number {
    const p = dateParts(time, zone);
    return zonedTimestamp(zone, p.year, p.month, p.day, 0, sessionStart);
  }
  closeTime(): number {
    const period = this.calendar.periodAt(this.input.timeframe, this.time / 1000);
    if (period) return period.close * 1000;
    const session = this.calendar.at(this.time / 1000);
    const nominalClose = this.time + timeframeSeconds(this.input.timeframe) * 1000;
    if (session === null) return nominalClose;
    if (session) return Math.min(nominalClose, session.close * 1000);
    return Math.min(nominalClose, this.dayStart(this.time, this.end));
  }
  /** Automatic VWAP resets after a missing daily timestamp, not on its first occurrence. */
  vwapAnchor(): boolean {
    if (this.currentVwapAnchor !== undefined) return this.currentVwapAnchor;
    if (this.index === 0) return (this.currentVwapAnchor = true);
    const previousTime = this.input.bars[this.index - 1].time * 1000;
    const previous =
      this.lastDayAlignment?.time === previousTime
        ? this.lastDayAlignment.value
        : this.implicitAligned('D', previousTime);
    const current = this.implicitAligned('D', this.time);
    this.lastDayAlignment = { time: this.time, value: current };
    return (this.currentVwapAnchor =
      !Number.isFinite(previous) || (Number.isFinite(current) && current !== previous));
  }
  get(name: string, version: number): unknown {
    if (this.cache.has(name)) return this.cache.get(name);
    const p = this.parts,
      last = this.input.bars.length - 1,
      tf = this.input.timeframe,
      sec = timeframeSeconds(tf),
      tail = Boolean(this.input.realtimeTail),
      history = !tail || this.index < last;
    const session = this.calendar.at(this.time / 1000);
    let value: unknown;
    switch (name) {
      case 'time':
        value = this.time;
        break;
      case 'time_close':
        value = this.closeTime();
        break;
      case 'time_tradingday':
        value =
          session === null
            ? NaN
            : session
              ? Date.parse(session.tradingDay + 'T00:00:00Z')
              : Date.UTC(p.year, p.month - 1, p.day);
        break;
      case 'year':
      case 'month':
      case 'hour':
      case 'minute':
      case 'second':
      case 'weekofyear':
      case 'dayofweek':
        value = p[name];
        break;
      case 'dayofmonth':
        value = p.day;
        break;
      case 'last_bar_index':
        value = last;
        break;
      case 'last_bar_time':
        value = this.input.bars[last].time * 1000;
        break;
      case 'timeframe.period':
        value = version === 6 && /^[DWM]$/.test(tf) ? `1${tf}` : tf;
        break;
      case 'timeframe.multiplier':
        value = parseInt(tf, 10) || 1;
        break;
      case 'timeframe.isintraday':
        value = sec < 86400;
        break;
      case 'timeframe.isdaily':
        value = /D$/.test(tf);
        break;
      case 'timeframe.isweekly':
        value = /W$/.test(tf);
        break;
      case 'timeframe.ismonthly':
        value = /M$/.test(tf);
        break;
      case 'timeframe.isdwm':
        value = /[DWM]$/.test(tf);
        break;
      case 'timeframe.isminutes':
        value = /^\d+$/.test(tf);
        break;
      case 'timeframe.isseconds':
        value = /S$/.test(tf);
        break;
      case 'session.isfirstbar':
      case 'session.isfirstbar_regular':
        value =
          session === null
            ? false
            : session
              ? this.time === session.open * 1000 || sec >= 86400
              : this.time === this.dayStart() || sec >= 86400;
        break;
      case 'session.islastbar':
      case 'session.islastbar_regular':
        value =
          session === null
            ? false
            : session
              ? this.closeTime() === session.close * 1000 || sec >= 86400
              : this.closeTime() === this.dayStart(this.time, this.end) || sec >= 86400;
        break;
      case 'session.ismarket':
        value = p.hour * 60 + p.minute >= this.start && p.hour * 60 + p.minute < this.end;
        break;
      case 'session.ispremarket':
        value = p.hour * 60 + p.minute < this.start;
        break;
      case 'session.ispostmarket':
        value = p.hour * 60 + p.minute >= this.end;
        break;
      case 'barstate.isfirst':
        value = this.index === 0;
        break;
      case 'barstate.islast':
        value = this.index === last;
        break;
      case 'barstate.isconfirmed':
      case 'barstate.ishistory':
        value = history;
        break;
      case 'barstate.isrealtime':
        value = !history;
        break;
      case 'barstate.isnew':
        value = history;
        break;
      case 'barstate.islastconfirmedhistory':
        value = this.index === last - (tail ? 1 : 0);
        break;
      default:
        return undefined;
    }
    this.cache.set(name, value);
    return value;
  }
  call(name: string, args: any[]): unknown {
    if (
      [
        'year',
        'month',
        'dayofmonth',
        'dayofweek',
        'hour',
        'minute',
        'second',
        'weekofyear',
      ].includes(name)
    )
      return dateParts(Number(args[0]), args[1] ?? this.zone)[name === 'dayofmonth' ? 'day' : name];
    if (name === 'timestamp') {
      if (args.length === 1) {
        const text = String(args[0]).trim();
        // The string overload defaults to UTC, independently of the exchange
        // and host timezone. Accept both a space and ISO's T before the clock.
        const iso = text.match(
          /^(\d{4}-\d\d-\d\d)(?:[ T](\d\d:\d\d(?::\d\d(?:\.\d+)?)?))?(?:\s*(Z|[+-]\d\d:?\d\d))?$/i,
        );
        if (iso) return Date.parse(`${iso[1]}T${iso[2] ?? '00:00:00'}${iso[3] ?? 'Z'}`);
        // Pine also accepts textual dates and explicit GMT/UTC offsets.
        return Date.parse(
          /(?:GMT|UTC|Z|[+-]\d{4}|[+-]\d\d:\d\d)\s*$/i.test(text) || /(?:GMT|UTC)[+-]/i.test(text)
            ? text
            : `${text} UTC`,
        );
      }
      const zone = typeof args[0] === 'string' ? args.shift() : this.zone;
      return zonedTimestamp(zone, ...(args as [number, number, number, number, number, number]));
    }
    if (name === 'timeframe.in_seconds') return timeframeSeconds(args[0] ?? this.input.timeframe);
    if (name === 'timeframe.from_seconds') {
      const s = +args[0];
      return s < 60 ? `${s}S` : s < 86400 ? `${Math.round(s / 60)}` : `${Math.round(s / 86400)}D`;
    }
    if (name === 'timeframe.change') {
      if (this.index === 0) return false;
      const current = this.implicitAligned(String(args[0]), this.time);
      const previous = this.implicitAligned(
        String(args[0]),
        this.input.bars[this.index - 1].time * 1000,
      );
      return Number.isFinite(current) && Number.isFinite(previous) && current !== previous;
    }
    if (name === 'time' || name === 'time_close') {
      const tf = args[0] || this.input.timeframe,
        session = args[1],
        zone = args[2] ?? this.zone;
      let sessionStart = this.start;
      let sessionEnd = this.end;
      if (!session) {
        const period = this.calendar.periodAt(tf, this.time / 1000);
        if (period === null) return NaN;
        if (period) return (name === 'time' ? period.open : period.close) * 1000;
      }
      if (!session && !/[WM]$/.test(tf)) {
        const observed = this.calendar.at(this.time / 1000);
        if (observed === null) return NaN;
        if (observed) {
          const width = timeframeSeconds(tf) * 1000;
          const aligned = this.implicitAligned(tf, this.time);
          return name === 'time' ? aligned : Math.min(aligned + width, observed.close * 1000);
        }
      }
      if (session) {
        const [hours, days = '1234567'] = String(session).split(':'),
          [start, end] = hours.split('-'),
          toMinute = (s: string) => +s.slice(0, 2) * 60 + +s.slice(2);
        const p = dateParts(this.time, zone),
          current = p.hour * 60 + p.minute,
          lo = toMinute(start),
          hi = toMinute(end);
        sessionStart = lo;
        sessionEnd = hi || 1440;
        if (
          !days.includes(String(p.dayofweek)) ||
          (lo !== hi && !(lo < hi ? current >= lo && current < hi : current >= lo || current < hi))
        )
          return NaN;
      }
      const aligned = this.aligned(tf, this.time, zone, sessionStart);
      if (name === 'time') return aligned;
      return /D$/.test(tf)
        ? this.dayStart(this.time, sessionEnd, zone)
        : Math.min(
            aligned + timeframeSeconds(tf) * 1000,
            this.dayStart(this.time, sessionEnd, zone),
          );
    }
    if (name === 'str.format_time') {
      const p = dateParts(+args[0], args[2] ?? this.zone);
      const fields: Record<string, string> = {
        yyyy: String(p.year),
        MM: String(p.month).padStart(2, '0'),
        dd: String(p.day).padStart(2, '0'),
        HH: String(p.hour).padStart(2, '0'),
        mm: String(p.minute).padStart(2, '0'),
        ss: String(p.second).padStart(2, '0'),
      };
      return String(args[1] ?? 'yyyy-MM-dd HH:mm:ss').replace(
        /yyyy|MM|dd|HH|mm|ss/g,
        (key) => fields[key],
      );
    }
    return undefined;
  }
  private implicitAligned(tf: string, time: number): number {
    const period = this.calendar.periodAt(tf, time / 1000);
    if (period === null) return NaN;
    if (period) return period.open * 1000;
    if (!/[WM]$/.test(tf)) {
      const session = this.calendar.at(time / 1000);
      if (session === null) return NaN;
      if (session) {
        const open = session.open * 1000;
        const width = timeframeSeconds(tf) * 1000;
        return /D$/.test(tf) ? open : open + Math.floor((time - open) / width) * width;
      }
    }
    return this.aligned(tf, time);
  }
  aligned(tf: string, time: number, zone = this.zone, sessionStart = this.start): number {
    const p = dateParts(time, zone),
      start = this.dayStart(time, sessionStart, zone);
    if (/D$/.test(tf)) return start;
    if (/W$/.test(tf))
      return zonedTimestamp(
        zone,
        p.year,
        p.month,
        p.day - ((p.dayofweek + 5) % 7),
        0,
        sessionStart,
      );
    if (/M$/.test(tf)) return zonedTimestamp(zone, p.year, p.month, 1, 0, sessionStart);
    const width = timeframeSeconds(tf) * 1000;
    return start + Math.floor((time - start) / width) * width;
  }
}

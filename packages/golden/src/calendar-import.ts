import { Calendar } from '@pine/engine/calendar';
import type { CalendarPeriod, SessionCalendar, TradingSession } from '@pine/engine';
import { dateParts, zonedTimestamp } from '@pine/engine/calendar';
import { parseCsv } from './csv.ts';

const fields = [
  'session_open',
  'session_close',
  'session_trading_day',
  'calendar_week_open',
  'calendar_week_close',
  'calendar_month_open',
  'calendar_month_close',
] as const;

/** Convert an independent calendar-only probe, ignoring chart prices and other study columns. */
export function importCalendarChart(csvText: string, timezone: string): SessionCalendar {
  const [headers, ...rows] = parseCsv(csvText);
  if (!headers) throw new Error('Calendar chart is empty');
  const columns = fields.map((field) => {
    const index = headers.indexOf(field);
    if (index < 0 || headers.lastIndexOf(field) !== index)
      throw new Error(`Calendar chart requires one ${field} column`);
    return index;
  });
  const sessions: TradingSession[] = [];
  const weekly = new Map<number, CalendarPeriod>();
  const monthly = new Map<number, CalendarPeriod>();
  const append = (periods: Map<number, CalendarPeriod>, period: CalendarPeriod): void => {
    const previous = periods.get(period.from);
    if (
      previous &&
      (previous.to !== period.to ||
        previous.open !== period.open ||
        previous.close !== period.close)
    )
      throw new Error('Calendar probe disagrees about one period boundary');
    periods.set(period.from, period);
  };
  for (let index = 0; index < rows.length; index++) {
    const values = columns.map((column) => {
      const value = rows[index][column];
      if (value === undefined || value.trim() === '' || !Number.isFinite(Number(value)))
        throw new Error(`Invalid calendar timestamp at row ${index + 2}`);
      return Number(value) / 1000;
    });
    const [open, close, tradingDay, weekOpen, weekClose, monthOpen, monthClose] = values;
    const date = new Date(tradingDay * 1000);
    if (
      date.getUTCHours() ||
      date.getUTCMinutes() ||
      date.getUTCSeconds() ||
      date.getUTCMilliseconds()
    )
      throw new Error(`Trading day must identify UTC midnight at row ${index + 2}`);
    const assignment = date.toISOString().slice(0, 10);
    sessions.push({ open, close, tradingDay: assignment });
    const parts = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
    const monday = parts.day - ((date.getUTCDay() + 6) % 7);
    append(weekly, {
      from: zonedTimestamp(timezone, parts.year, parts.month, monday) / 1000,
      to: zonedTimestamp(timezone, parts.year, parts.month, monday + 7) / 1000,
      open: weekOpen,
      close: weekClose,
    });
    append(monthly, {
      from: zonedTimestamp(timezone, parts.year, parts.month, 1) / 1000,
      to: zonedTimestamp(timezone, parts.year, parts.month + 1, 1) / 1000,
      open: monthOpen,
      close: monthClose,
    });
  }
  if (!sessions.length) throw new Error('Calendar chart contains no sessions');
  const last = dateParts(sessions.at(-1)!.open * 1000, timezone);
  const schedule: SessionCalendar = {
    from: sessions[0].open,
    to: zonedTimestamp(timezone, last.year, last.month, last.day + 1) / 1000,
    sessions,
    periods: { '1W': [...weekly.values()], '1M': [...monthly.values()] },
  };
  // Validate ordering and period coverage before the adapter writes usable market metadata.
  new Calendar(schedule);
  return schedule;
}

import type { CalendarPeriod, SessionCalendar, TradingSession } from './types.ts';

/** undefined means no coverage; null is a known nontrading instant inside coverage. */
export type SessionAtTime = Readonly<TradingSession> | null | undefined;
export type PeriodAtTime = Readonly<CalendarPeriod> | null | undefined;

/** Shared market-calendar lookup; it contains no exchange-specific date rules. */
export class Calendar {
  private readonly schedule?: SessionCalendar;

  constructor(schedule?: SessionCalendar) {
    if (!schedule) return;
    if (
      !Number.isFinite(schedule.from) ||
      !Number.isFinite(schedule.to) ||
      schedule.from >= schedule.to
    )
      throw new Error('Session calendar requires a finite, increasing coverage interval');
    let previousClose = -Infinity;
    const sessions = schedule.sessions.map((session) => {
      if (
        !Number.isFinite(session.open) ||
        !Number.isFinite(session.close) ||
        session.open >= session.close
      )
        throw new Error('Trading sessions require a finite opening before their closing instant');
      if (session.open < previousClose)
        throw new Error('Trading sessions must be sorted and nonoverlapping');
      if (session.open >= schedule.to || session.close <= schedule.from)
        throw new Error('Trading sessions must intersect the calendar coverage interval');
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(session.tradingDay) ||
        !Number.isFinite(Date.parse(session.tradingDay + 'T00:00:00Z')) ||
        new Date(session.tradingDay + 'T00:00:00Z').toISOString().slice(0, 10) !==
          session.tradingDay
      )
        throw new Error('Trading sessions require a valid YYYY-MM-DD trading date');
      previousClose = session.close;
      return Object.freeze({ ...session });
    });
    const periods: Record<string, readonly CalendarPeriod[]> = {};
    for (const [timeframe, supplied] of Object.entries(schedule.periods ?? {})) {
      if (!/^[1-9]\d*[DWM]$/.test(timeframe))
        throw new Error('Calendar period keys require a canonical timeframe such as 1W');
      let previousEnd = -Infinity;
      periods[timeframe] = supplied.map((period) => {
        if (
          ![period.from, period.to, period.open, period.close].every(Number.isFinite) ||
          period.from >= period.to ||
          period.open >= period.close
        )
          throw new Error('Calendar periods require finite, increasing intervals');
        if (period.from < previousEnd)
          throw new Error('Calendar periods must be sorted and nonoverlapping');
        if (period.from >= schedule.to || period.to <= schedule.from)
          throw new Error('Calendar periods must intersect the calendar coverage interval');
        previousEnd = period.to;
        return Object.freeze({ ...period });
      });
    }
    this.schedule = { from: schedule.from, to: schedule.to, sessions, periods };
  }

  at(time: number): SessionAtTime {
    const schedule = this.schedule;
    if (!schedule || !Number.isFinite(time) || time < schedule.from || time >= schedule.to)
      return undefined;
    let from = 0;
    let to = schedule.sessions.length;
    while (from < to) {
      const middle = Math.floor((from + to) / 2);
      if (schedule.sessions[middle].open <= time) from = middle + 1;
      else to = middle;
    }
    const session = schedule.sessions[from - 1];
    return session && time < session.close ? session : null;
  }

  periodAt(timeframe: string, time: number): PeriodAtTime {
    const schedule = this.schedule;
    if (!schedule || !Number.isFinite(time)) return undefined;
    const key = /^[DWM]$/.test(timeframe) ? `1${timeframe}` : timeframe;
    const periods = schedule.periods?.[key];
    if (!periods) return undefined;
    let from = 0;
    let to = periods.length;
    while (from < to) {
      const middle = Math.floor((from + to) / 2);
      if (periods[middle].from <= time) from = middle + 1;
      else to = middle;
    }
    const period = periods[from - 1];
    // A collected weekly/monthly interval can extend beyond the last observed
    // daily session. Its own bounds preserve that independent provider metadata.
    if (period && time < period.to) return period;
    return time < schedule.from || time >= schedule.to ? undefined : null;
  }
}

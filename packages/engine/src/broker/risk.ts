export interface RiskHalt {
  reason: string;
  permanent: boolean;
  /** Completed-period rules commit their liquidation with the next opening fills. */
  execution?: 'period-boundary';
}

interface LossLimit {
  cash: number;
  percent: number;
}

/** Account risk state belongs to a single run; callers supply trading-day boundaries. */
export class RiskLimits {
  private readonly drawdown: LossLimit = { cash: Infinity, percent: Infinity };
  private readonly intraday: LossLimit = { cash: Infinity, percent: Infinity };
  private peak: number;
  private dayStart: number;
  private consecutiveLossDays = 0;
  private maxLossDays = Infinity;
  private hasDay = false;
  private permanent = false;
  private daily = false;

  constructor(initialCapital: number) {
    this.peak = initialCapital;
    this.dayStart = initialCapital;
  }

  get halted(): boolean {
    return this.permanent || this.daily;
  }

  setLoss(kind: 'drawdown' | 'intraday', value: unknown, type: unknown): void {
    const amount = Number(value);
    const unit = String(type).split('.').at(-1);
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      (unit !== 'cash' && unit !== 'percent_of_equity') ||
      (unit === 'percent_of_equity' && amount > 100)
    )
      throw Object.assign(new Error(`Invalid strategy risk ${kind} limit`), { kind: 'runtime' });
    const key = unit === 'cash' ? 'cash' : 'percent';
    // Multiple declarations remain active; the first threshold reached wins.
    this[kind][key] = Math.min(this[kind][key], amount);
  }

  setLosingDays(value: unknown): void {
    const count = Number(value);
    if (!Number.isInteger(count) || count <= 0)
      throw Object.assign(new Error('Consecutive losing days must be a positive integer'), {
        kind: 'runtime',
      });
    this.maxLossDays = Math.min(this.maxLossDays, count);
  }

  beginDay(equity: number): RiskHalt | undefined {
    if (this.hasDay) {
      this.consecutiveLossDays = equity < this.dayStart ? this.consecutiveLossDays + 1 : 0;
    }
    this.hasDay = true;
    this.dayStart = equity;
    this.daily = false;
    if (!this.permanent && this.consecutiveLossDays >= this.maxLossDays)
      return {
        ...this.halt('Close Position (Max consecutive loss days)', true),
        execution: 'period-boundary',
      };
    return undefined;
  }

  observe(equity: number, balance = equity): RiskHalt | undefined {
    // Native cash and percent drawdown captures trade through unrealized losses and
    // only stop after a realized balance decline; floating peaks are not anchors.
    this.peak = Math.max(this.peak, balance);
    if (this.permanent) return undefined;
    if (
      equity <= 0 &&
      (Number.isFinite(this.drawdown.percent) || Number.isFinite(this.intraday.percent))
    )
      return this.halt(
        Number.isFinite(this.drawdown.percent)
          ? 'Close Position (Maximum drawdown)'
          : 'Close Position (Maximum intraday loss)',
        true,
      );
    if (this.reached(this.drawdown, this.peak, balance))
      return this.halt('Close Position (Maximum drawdown)', true);
    // Both native intraday units measure loss from the session-opening equity;
    // profits made during the session provide room for later floating losses.
    // Native weekly cash captures disable this threshold for a period beginning
    // below zero, then restore it when a later period opens with positive equity.
    const intraday =
      this.dayStart < 0 ? { cash: Infinity, percent: this.intraday.percent } : this.intraday;
    if (!this.daily && this.reached(intraday, this.dayStart, equity))
      return this.halt('Close Position (Max intraday Loss)', false);
    return undefined;
  }

  private reached(limit: LossLimit, peak: number, equity: number): boolean {
    const loss = peak - equity;
    // Subtracting account balances can round an exact threshold slightly down.
    // Bound this comparison by the operands' floating-point rounding error.
    const error = Number.EPSILON * (Math.abs(peak) + Math.abs(equity));
    return (
      (Number.isFinite(limit.cash) &&
        (loss > 0 || limit.cash === 0) &&
        loss >= limit.cash - error) ||
      (Number.isFinite(limit.percent) &&
        (loss > 0 || limit.percent === 0) &&
        loss >= (peak * limit.percent) / 100 - error)
    );
  }

  private halt(reason: string, permanent: boolean): RiskHalt {
    this.permanent ||= permanent;
    this.daily = true;
    return { reason, permanent };
  }
}

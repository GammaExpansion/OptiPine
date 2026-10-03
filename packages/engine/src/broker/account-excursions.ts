export interface AccountExcursion {
  value: number;
  percent: number;
}

/** Account excursions compare observed equity with preceding realized-balance extrema. */
export class AccountExcursions {
  private peak: number;
  private trough: number;
  readonly drawdown: AccountExcursion = { value: 0, percent: 0 };
  readonly runup: AccountExcursion = { value: 0, percent: 0 };

  constructor(initialCapital: number) {
    this.peak = initialCapital;
    this.trough = initialCapital;
  }

  observe(balance: number, equity: number): void {
    this.peak = Math.max(this.peak, balance);
    this.trough = Math.min(this.trough, balance);
    const drawdown = this.peak - equity;
    const runup = equity - this.trough;
    this.drawdown.value = Math.max(this.drawdown.value, drawdown);
    this.runup.value = Math.max(this.runup.value, runup);
    if (this.peak !== 0)
      this.drawdown.percent = Math.max(this.drawdown.percent, (drawdown / this.peak) * 100);
    // A loss below a positive trough and negative equity is not a run-up, even
    // though dividing those two negative values would produce a positive ratio.
    if (runup > 0 && equity !== 0)
      this.runup.percent = Math.max(this.runup.percent, (runup / equity) * 100);
  }
}

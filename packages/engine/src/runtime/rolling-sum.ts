import { missing } from './numeric.ts';

/** Pine's moving sum retains the corrected operand, including its rounding history. */
export class RollingSum {
  readonly length: number;
  private operands: number[] = [];
  private cursor = 0;
  private total = 0;
  private correction = 0;

  constructor(length: number) {
    this.length = length;
  }

  private add(value: number): number {
    const corrected = value - this.correction;
    const next = this.total + corrected;
    this.correction = next - this.total - corrected;
    this.total = next;
    return corrected;
  }

  push(value: number): number {
    if (!missing(value)) {
      if (this.operands.length === this.length) this.add(-this.operands[this.cursor]);
      // Saving the raw input instead loses the delayed rounding seen in native captures.
      this.operands[this.cursor] = this.add(value);
      this.cursor = (this.cursor + 1) % this.length;
    }
    return this.operands.length === this.length ? this.total : NaN;
  }

  clone(): RollingSum {
    const copy = new RollingSum(this.length);
    copy.operands = [...this.operands];
    copy.cursor = this.cursor;
    copy.total = this.total;
    copy.correction = this.correction;
    return copy;
  }
}

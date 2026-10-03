import type { Trade } from '../types.ts';
import { reportNumber } from '../report-number.ts';

interface ClosedEquityAmount {
  value: number;
  percent: number | null;
}

export interface ClosedEquityPoint {
  /** reportNumber-projected cumulative closed profit, excluding capital and open profit. */
  value: number;
  /** Exit timestamp in Unix seconds, in reported trade order. */
  time: number;
}

export interface ClosedEquityCycle extends ClosedEquityAmount {
  start: number;
  end: number;
  days: number;
}

export interface ClosedEquitySummary {
  average: ClosedEquityAmount & { days: number };
  maximum: ClosedEquityAmount;
}

/**
 * Drawdowns end at their first lowest closed point before recovery to an equal or
 * higher peak. A one-step fall counts only when it exceeds 5% of the peak balance.
 * Retained troughs and the next retained peaks delimit the run-ups, which require
 * at least two closed-trade steps. The unfinished final phases are included. An
 * excluded final one-step decline preserves the preceding run-up peak.
 */
export function closedEquityCycles(
  points: readonly ClosedEquityPoint[],
  initialCapital: number,
): { runup: ClosedEquityCycle[]; drawdown: ClosedEquityCycle[] } {
  const drawdown: ClosedEquityCycle[] = [];
  const runup: ClosedEquityCycle[] = [];
  if (!points.length) return { runup, drawdown };

  const cycle = (start: number, end: number): ClosedEquityCycle => {
    const value = Math.abs(points[end].value - points[start].value);
    const balance = initialCapital + points[start].value;
    return {
      start,
      end,
      value,
      percent: balance === 0 ? null : (value / balance) * 100,
      days: (points[end].time - points[start].time) / 86400,
    };
  };
  let peak = 0;
  let trough = 0;
  const captureDrawdown = () => {
    if (trough === peak) return;
    const depth = points[peak].value - points[trough].value;
    if (trough - peak >= 2 || depth / (initialCapital + points[peak].value) > 0.05)
      drawdown.push(cycle(peak, trough));
  };
  for (let index = 1; index < points.length; index++) {
    if (points[index].value >= points[peak].value) {
      captureDrawdown();
      peak = trough = index;
    } else if (points[index].value < points[trough].value) {
      trough = index;
    }
  }
  captureDrawdown();

  const captureRunup = (start: number, end: number) => {
    if (end - start >= 2 && points[end].value > points[start].value) runup.push(cycle(start, end));
  };
  if (drawdown.length) {
    captureRunup(0, drawdown[0].start);
    for (let index = 0; index + 1 < drawdown.length; index++)
      captureRunup(drawdown[index].end, drawdown[index + 1].start);
  }
  const finalStart = drawdown.at(-1)?.end ?? 0;
  const excludedFinalDrawdown = trough !== peak && drawdown.at(-1)?.start !== peak;
  captureRunup(finalStart, excludedFinalDrawdown ? peak : points.length - 1);
  return { runup, drawdown };
}

/** Equal-weight means; the percentage maximum belongs to the largest cash cycle. */
export function summarizeClosedEquityCycles(
  cycles: readonly ClosedEquityCycle[],
): ClosedEquitySummary | null {
  if (!cycles.length) return null;
  let value = 0;
  let percent: number | null = 0;
  let days = 0;
  let maximum = cycles[0];
  for (const cycle of cycles) {
    value += cycle.value;
    percent = percent === null || cycle.percent === null ? null : percent + cycle.percent;
    days += cycle.days;
    if (cycle.value > maximum.value) maximum = cycle;
  }
  return {
    average: {
      value: value / cycles.length,
      percent: percent === null ? null : percent / cycles.length,
      days: days / cycles.length,
    },
    maximum: { value: maximum.value, percent: maximum.percent },
  };
}

export function closedEquityStatistics(
  trades: readonly Trade[],
  initialCapital: number,
): { runup: ClosedEquitySummary | null; drawdown: ClosedEquitySummary | null } {
  let cumulative = 0;
  const points: ClosedEquityPoint[] = [];
  for (const trade of trades) {
    if (trade.exitBar === null) continue;
    cumulative += trade.profit;
    // Convert each cumulative observation, preserving the raw running total.
    points.push({ value: reportNumber(cumulative), time: trade.exitTime! });
  }
  const cycles = closedEquityCycles(points, initialCapital);
  return {
    runup: summarizeClosedEquityCycles(cycles.runup),
    drawdown: summarizeClosedEquityCycles(cycles.drawdown),
  };
}

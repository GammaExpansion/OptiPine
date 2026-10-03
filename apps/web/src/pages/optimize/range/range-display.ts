import { message, type Message } from '@pine/messages';
import { formatDate } from '../../../i18n/translate.ts';
import type { WindowPlan } from '../../../workflows/optimize-session.ts';
import type { BarSpan, WalkForwardSettings } from '../../../workflows/optimize-setup.ts';

/** A span's first and last bar dates, 2023-01-02 – 2024-08-20. */
export function spanText(span: BarSpan): Message {
  return message('optimize.setup.dates', {
    start: formatDate(span.start * 1000),
    end: formatDate(span.end * 1000),
  });
}

/** The IS share of the bar, by bars, as the split takes them. */
export function inSampleShare(inSample: BarSpan, outOfSample: BarSpan): number {
  return (inSample.bars / (inSample.bars + outOfSample.bars)) * 100;
}

const months = (count: number): Message =>
  count === 1 ? message('optimize.setup.month') : message('optimize.setup.months', { count });

/** The walk-forward settings as the range bar states them (O3). */
export function walkForwardFacts(settings: WalkForwardSettings): {
  readonly inSample: Message;
  readonly outOfSample: Message;
  readonly step: Message;
} {
  return {
    inSample: message('optimize.setup.isLength', { months: months(settings.inSampleMonths) }),
    outOfSample: message('optimize.setup.oosLength', {
      months: months(settings.outOfSampleMonths),
    }),
    step: message(
      settings.anchored ? 'optimize.setup.stepAnchored' : 'optimize.setup.stepRolling',
      {
        months: months(settings.stepMonths),
      },
    ),
  };
}

/** One window's lane in the plan, as percentages of the time axis. */
export interface PlanLane {
  readonly window: WindowPlan;
  readonly inSample: { readonly left: number; readonly width: number };
  readonly outOfSample: { readonly left: number; readonly width: number };
}

export interface PlanTick {
  /** Percent along the axis. */
  readonly at: number;
  /** The month, as 2024-01. */
  readonly label: string;
}

const tickSteps = [1, 2, 3, 6, 12, 24, 60];
const maxTicks = 8;

/**
 * Month starts after `start` and before `end` (Unix seconds), `step` months apart and counted from
 * year 0, so six-month ticks fall on January and July.
 */
function monthStarts(start: number, end: number, step: number): number[] {
  const date = new Date(start * 1000);
  let index = Math.ceil((date.getUTCFullYear() * 12 + date.getUTCMonth() + 1) / step) * step;
  const ticks: number[] = [];
  for (; ; index += step) {
    const time = Date.UTC(Math.floor(index / 12), index % 12, 1) / 1000;
    if (time >= end) return ticks;
    ticks.push(time);
  }
}

/**
 * The window plan's lanes and month ticks (O3) over the time from the first window's IS start to
 * the last window's OOS end; the ticks keep to at most eight, a whole number of months apart.
 */
export function planGeometry(windows: readonly WindowPlan[]): {
  readonly lanes: readonly PlanLane[];
  readonly ticks: readonly PlanTick[];
} {
  if (!windows.length) return { lanes: [], ticks: [] };
  const start = Math.min(...windows.map((window) => window.inSampleStart));
  const end = Math.max(...windows.map((window) => window.outOfSampleEnd));
  const length = Math.max(1, end - start);
  const at = (time: number) => ((time - start) / length) * 100;
  const part = (from: number, to: number) => ({ left: at(from), width: at(to) - at(from) });
  const lanes = windows.map((window) => ({
    window,
    inSample: part(window.inSampleStart, window.inSampleEnd),
    outOfSample: part(window.outOfSampleStart, window.outOfSampleEnd),
  }));
  let ticks: number[] = [];
  for (const step of tickSteps) {
    ticks = monthStarts(start, end, step);
    if (ticks.length <= maxTicks) break;
  }
  return {
    lanes,
    ticks: ticks.map((time) => ({ at: at(time), label: formatDate(time * 1000).slice(0, 7) })),
  };
}

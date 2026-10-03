import { expect, test } from 'vitest';
import { translate } from '../../../i18n/translate.ts';
import type { WindowPlan } from '../../../workflows/optimize-session.ts';
import { defaultValidation } from '../../../workflows/optimize-setup.ts';
import {
  inSampleShare,
  planGeometry,
  spanText,
  walkForwardFacts,
  windowCount,
} from './range-display.ts';

const day = (year: number, month: number, date = 1) => Date.UTC(year, month - 1, date) / 1000;

test('a span reads as its first and last bar dates, and the split by bars', () => {
  const inSample = { start: day(2023, 1, 2), end: day(2024, 8, 20) + 82_800, bars: 14_341 };
  expect(translate(spanText(inSample), 'en')).toBe('2023-01-02 – 2024-08-20');
  expect(inSampleShare(inSample, { start: 0, end: 0, bars: 6_147 })).toBeCloseTo(70, 1);
});

test('walk-forward facts read as the range bar states them (O3)', () => {
  const facts = walkForwardFacts(defaultValidation.walkForward);
  expect(translate(facts.inSample, 'en')).toBe('IS 12 months');
  expect(translate(facts.outOfSample, 'en')).toBe('OOS 3 months');
  expect(translate(facts.step, 'en')).toBe('Step 3 months, IS rolls forward');
  const anchored = walkForwardFacts({
    inSampleMonths: 1,
    outOfSampleMonths: 1,
    stepMonths: 1,
    anchored: true,
  });
  expect(translate(anchored.step, 'en')).toBe('Step 1 month, IS anchored at the start');
  expect(translate(anchored.inSample, 'zh')).toBe('样本内 1 个月');
  expect(translate(windowCount(6), 'en')).toBe('6 windows');
  expect(translate(windowCount(1), 'en')).toBe('1 window');
});

/** Six rolling windows of 12 IS and 3 OOS months from 2023-01, as O3 plans them. */
const windows: WindowPlan[] = Array.from({ length: 6 }, (_, index) => ({
  index,
  inSampleStart: day(2023, 1 + 3 * index),
  inSampleEnd: day(2024, 1 + 3 * index),
  outOfSampleStart: day(2024, 1 + 3 * index),
  outOfSampleEnd: day(2024, 4 + 3 * index),
  inSampleStartIndex: 0,
  outOfSampleStartIndex: 0,
  inSampleBars: 0,
  outOfSampleBars: 0,
  partial: false,
  gapBefore: false,
}));

test('the plan lays each window on one time axis with at most eight month ticks', () => {
  const { lanes, ticks } = planGeometry(windows);
  expect(lanes).toHaveLength(6);
  expect(lanes[0].inSample.left).toBe(0);
  expect(lanes[5].outOfSample.left + lanes[5].outOfSample.width).toBeCloseTo(100, 6);
  expect(lanes[0].outOfSample.left).toBeCloseTo(lanes[0].inSample.width, 6);
  expect(ticks.map((tick) => tick.label)).toEqual(['2023-07', '2024-01', '2024-07', '2025-01']);
  expect(planGeometry([])).toEqual({ lanes: [], ticks: [] });
});

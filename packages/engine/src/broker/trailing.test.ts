import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order, Side } from './orders.ts';
import { activateTrailing, advanceTrailing } from './trailing.ts';

function order(side: Side, activation: number, offset = 5): Order {
  return {
    id: 'trail',
    kind: 'exit',
    side,
    trailPrice: activation,
    trailOffset: offset,
    comment: '',
    submitted: 0,
    immediate: false,
    sequence: 0,
  };
}

function near(actual: number | undefined, expected: number): void {
  assert.ok(
    actual !== undefined && Math.abs(actual - expected) < 1e-10,
    `${actual} != ${expected}`,
  );
}

test('a trail cannot initialize behind the activation threshold reached by an executable tick', () => {
  for (const scale of [1, 10]) {
    const long = order(-1, 12.38 * scale);
    activateTrailing(long, 12.38 * scale, {
      from: 12.3 * scale,
      to: 12.38 * scale,
      rawFrom: 12.302 * scale,
      rawTo: 12.377 * scale,
      opening: false,
    });
    advanceTrailing(long, 12.377 * scale, 0.01 * scale);
    near(long.stop, 12.33 * scale);
    const short = order(1, 12.22 * scale);
    activateTrailing(short, 12.22 * scale, {
      from: 12.3 * scale,
      to: 12.22 * scale,
      rawFrom: 12.302 * scale,
      rawTo: 12.223 * scale,
      opening: false,
    });
    advanceTrailing(short, 12.223 * scale, 0.01 * scale);
    near(short.stop, 12.27 * scale);
  }
});

test('repeated intrabar ticks and opening gaps retain their distinct observed prices', () => {
  const segment = { from: 50, to: 50, rawFrom: 50.003, rawTo: 50.003, opening: false };
  const repeated = order(1, 50.02);
  activateTrailing(repeated, 50, segment);
  advanceTrailing(repeated, 50.003, 0.01);
  near(repeated.stop, 50.05);
  const opening = order(1, 50.02);
  activateTrailing(opening, 50, { ...segment, opening: true });
  advanceTrailing(opening, 50.003, 0.01);
  near(opening.stop, 50.06);
});

test('a trail tightens on favorable observations and never loosens on a reversal', () => {
  const long = order(-1, 101);
  long.trailExtreme = 101;
  advanceTrailing(long, 101.237, 0.01);
  near(long.stop, 101.18);
  advanceTrailing(long, 100.5, 0.01);
  near(long.stop, 101.18);
  const short = order(1, 99);
  short.trailExtreme = 99;
  advanceTrailing(short, 98.763, 0.01);
  near(short.stop, 98.82);
  advanceTrailing(short, 99.5, 0.01);
  near(short.stop, 98.82);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { compareOrderEvents, nextOrderEvent } from './orders.ts';
import type { Order } from './orders.ts';

test('candidate inspection is pure and never advances trailing state into future prices', () => {
  const order: Order = {
    id: 'trail',
    kind: 'exit',
    side: -1,
    comment: '',
    sequence: 0,
    submitted: 0,
    immediate: false,
    trailPrice: 105,
    trailOffset: 2,
    trailExtreme: 106,
    stop: 104,
  };
  const copy = structuredClone(order);
  assert.equal(nextOrderEvent(order, 106, 120, false), undefined);
  assert.deepEqual(order, copy);
  assert.deepEqual(nextOrderEvent(order, 106, 100, false), { price: 104, stop: true });
});

test('stop-limit triggers before its limit becomes eligible', () => {
  const order: Order = {
    id: 'stop-limit',
    kind: 'entry',
    side: 1,
    comment: '',
    sequence: 0,
    submitted: 0,
    immediate: false,
    stop: 110,
    limit: 112,
  };
  assert.equal(nextOrderEvent(order, 100, 108, false), undefined);
  assert.deepEqual(nextOrderEvent(order, 100, 115, false), {
    price: 110,
    stop: true,
    activation: 'stop-limit',
  });
  assert.deepEqual(nextOrderEvent({ ...order, triggered: true }, 110, 115, false), {
    price: 110,
    stop: false,
  });
});

test('simultaneous price ordering is invariant when the price origin changes', () => {
  for (const shift of [-1000, 0, 1000]) {
    const make = (limit: number, sequence: number) => ({
      order: {
        id: String(sequence),
        kind: 'exit' as const,
        side: -1 as const,
        limit: limit + shift,
        comment: '',
        sequence,
        submitted: 0,
        immediate: false,
      },
      trigger: { price: 110 + shift, stop: false },
    });
    assert.ok(compareOrderEvents(make(104, 1), make(102, 0), 110 + shift) < 0);
  }
});

function limitOrder(side: 1 | -1, limit: number): Order {
  return {
    id: 'limit',
    kind: 'entry',
    side,
    limit,
    comment: '',
    sequence: 0,
    submitted: 0,
    immediate: false,
  };
}

test('limit verification requires the threshold and fills at the specified limit', () => {
  for (const side of [1, -1] as const) {
    const order = limitOrder(side, 100);
    assert.equal(nextOrderEvent(order, 100 + side * 5, 100, false, 2), undefined);
    assert.equal(nextOrderEvent(order, 100 + side * 5, 100 - side, false, 2), undefined);
    assert.deepEqual(nextOrderEvent(order, 100 + side * 5, 100 - side * 2, false, 2), {
      price: 100 - side * 2,
      fillPrice: 100,
      stop: false,
    });
    assert.deepEqual(nextOrderEvent(order, 100 - side * 5, 100 - side * 5, true, 2), {
      price: 100 - side * 5,
      stop: false,
    });
  }
});

test('opening gaps preserve price improvement with or without verification', () => {
  assert.deepEqual(nextOrderEvent(limitOrder(1, 100), 90, 90, true), {
    price: 90,
    stop: false,
  });
  assert.deepEqual(nextOrderEvent(limitOrder(-1, 100), 110, 110, true), {
    price: 110,
    stop: false,
  });
});

test('limit verification matches exact fractional ticks for both directions', () => {
  assert.deepEqual(nextOrderEvent(limitOrder(1, 0.07), 0.1, 0.01, false, 0.06, 0.01), {
    price: 0.01,
    fillPrice: 0.07,
    stop: false,
  });
  assert.deepEqual(nextOrderEvent(limitOrder(-1, 0.01), 0, 0.07, false, 0.06, 0.01), {
    price: 0.07,
    fillPrice: 0.01,
    stop: false,
  });
});

test('limit verification applies only after stop-limit activation', () => {
  const order: Order = { ...limitOrder(1, 112), stop: 110 };
  assert.deepEqual(nextOrderEvent(order, 100, 115, false, 3), {
    price: 110,
    stop: true,
    activation: 'stop-limit',
  });
  assert.equal(nextOrderEvent({ ...order, triggered: true }, 110, 115, false, 3), undefined);
  assert.deepEqual(nextOrderEvent({ ...order, triggered: true }, 115, 109, false, 3), {
    price: 109,
    fillPrice: 112,
    stop: false,
  });
});

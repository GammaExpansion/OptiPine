import assert from 'node:assert/strict';
import test from 'node:test';
import { tickDigits, tostring } from './format.ts';

test('mintick formatting keeps the decimals of ticks below 1e-6', () => {
  assert.equal(tickDigits(1e-7), 7);
  assert.equal(tickDigits(2.5e-7), 8);
  assert.equal(tickDigits(0.01), 2);
  assert.equal(tickDigits(1), 0);
  assert.equal(tostring(1.23e-7, 'format.mintick', 1e-7, 6), '0.0000001');
  assert.equal(tostring(0.5, 'format.mintick', 0.01, 6), '0.50');
});

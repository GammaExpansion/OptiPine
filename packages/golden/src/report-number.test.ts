import test from 'node:test';
import assert from 'node:assert/strict';
import { reportNumber } from './report-number.ts';
import { equalCell, REPORT_TOLERANCE } from './compare.ts';

test('report serialization takes the shortest round-trip float32 decimal with even ties', () => {
  assert.equal(reportNumber(140443.65), 140443.66);
  assert.equal(reportNumber(161810.13), 161810.12);
  assert.equal(reportNumber(-1422.5451), -1422.545);
  assert.equal(reportNumber(0.1), 0.1);
  assert.equal(reportNumber(1.234567891), 1.2345679);
  assert.equal(reportNumber(1234567891), 1234568000);
});

test('report conversion preserves sign symmetry and finite extremes without overflow', () => {
  for (const value of [0.1, 1.234567891, 140443.65, 161810.13, 1e-40]) {
    assert.equal(reportNumber(-value), -reportNumber(value));
    assert.equal(Math.fround(reportNumber(value)), Math.fround(value));
  }
  assert.equal(reportNumber(1e100), 1e100);
  assert.equal(reportNumber(Infinity), Infinity);
});

test('values within one float32 rounding cell have one stable report representation', () => {
  const bits = new DataView(new ArrayBuffer(4));
  const float = (value: number): number => {
    bits.setUint32(0, value);
    return bits.getFloat32(0);
  };
  for (let exponent = 10; exponent < 240; exponent += 7) {
    for (const mantissa of [0x12345, 0x456789, 0x765432]) {
      const pattern = (exponent << 23) | mantissa;
      const center = float(pattern);
      const below = float(pattern - 1);
      const above = float(pattern + 1);
      for (const value of [center - (center - below) / 4, center, center + (above - center) / 4]) {
        assert.equal(reportNumber(value), reportNumber(center));
        assert.equal(reportNumber(-value), -reportNumber(center));
        assert.equal(Math.fround(reportNumber(value)), center);
        assert.equal(reportNumber(reportNumber(value)), reportNumber(value));
      }
    }
  }
});

test('normalization does not admit neighboring float32 amounts outside report precision', () => {
  const bits = new DataView(new ArrayBuffer(4));
  for (const pattern of [0x48800001, 0x49345678, 0x4a654321]) {
    bits.setUint32(0, pattern);
    const left = reportNumber(bits.getFloat32(0));
    bits.setUint32(0, pattern + 1);
    const right = reportNumber(bits.getFloat32(0));
    assert.ok(right - left > 0.01);
    assert.equal(equalCell(left, right, REPORT_TOLERANCE), false);
    assert.equal(equalCell(-left, -right, REPORT_TOLERANCE), false);
  }
});

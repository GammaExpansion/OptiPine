import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import type { RunInput } from '@pine/engine';
import { isPackedInput, restoreInput, snapshotInput, transferInput } from './run-input.ts';

const input: RunInput = {
  bars: [
    { time: 1704067200, open: 0.1, high: 1e100, low: -0, close: Math.PI, volume: 1e-100 },
    { time: 1704070800, open: 3, high: 4, low: 1, close: 2, volume: 13 },
  ],
  syminfo: { timezone: 'Etc/UTC', custom: { value: 7 } },
  timeframe: '60',
  inputs: { Length: 2, nested: { value: 1 } },
  settings: { commission_value: 0.1 },
  historicalTicks: true,
  realtimeTail: false,
  strategyClosePending: true,
  sessionCalendar: {
    from: 1704067200,
    to: 1704153600,
    sessions: [{ open: 1704067200, close: 1704153600, tradingDay: '2024-01-01' }],
  },
};

test('packed bar transfer is exact and detaches only the per-Worker copy', () => {
  const snapshot = snapshotInput(input);
  for (let worker = 0; worker < 3; worker++) {
    const packet = transferInput(snapshot);
    const received = structuredClone(packet, { transfer: [packet.bars.buffer] });
    assert.equal(packet.bars.byteLength, 0);
    assert.equal(snapshot.bars.byteLength, input.bars.length * 6 * 8);
    assert.deepEqual(restoreInput(received), input);
  }
  assert.deepEqual(restoreInput(snapshotInput({ ...input, bars: [] })), { ...input, bars: [] });
  assert.equal(restoreInput(input), input, 'legacy requests retain their original input shape');
});

test('the snapshot isolates bars, metadata and nested settings from later caller edits', () => {
  const caller = structuredClone(input);
  const snapshot = snapshotInput(caller);
  caller.bars[0]!.close = 999;
  (caller.inputs!.nested as { value: number }).value = 99;
  caller.settings!.commission_value = 99;
  caller.sessionCalendar!.sessions[0]!.close = 99;
  assert.deepEqual(restoreInput(snapshot), input);
});

test('packed arrays from another realm survive detection, transfer and expansion', () => {
  const packed = snapshotInput(input);
  packed.bars = runInNewContext('new Float64Array(values)', { values: Array.from(packed.bars) });
  assert.equal(packed.bars instanceof Float64Array, false);
  assert.equal(isPackedInput(packed), true);
  assert.deepEqual(restoreInput(transferInput(packed)), input);
  assert.equal(isPackedInput(input), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { selectionFrom, selectionRequest, restoreSelection } from './market-selection.ts';
import { exampleRequest, presetRange } from './market-data.ts';

const now = Date.UTC(2026, 9, 3, 14, 37);

test('detects matching request presets without treating similar dates as the same range', () => {
  for (const preset of ['1M', '1Y', '2Y', 'All'] as const) {
    const request = { ...exampleRequest(now), ...presetRange(preset, 'binance', '60', now) };
    assert.equal(selectionFrom(request, now).preset, preset);
    assert.partialDeepStrictEqual(selectionRequest(selectionFrom(request, now), now).request, {
      from: request.from,
      to: request.to,
    });
    assert.equal(selectionFrom({ ...request, from: request.from + 3600 }, now).preset, 'Custom');
  }
  assert.equal(selectionFrom(exampleRequest(now), now + 3600000).preset, 'Custom');
  const limited = {
    ...exampleRequest(now),
    timeframe: '1',
    ...presetRange('1M', 'binance', '1', now),
  };
  assert.equal(selectionFrom(limited, now).preset, '1M');
});

test('ranges use workflow limits and custom errors', () => {
  const initial = restoreSelection(null, now);
  assert.deepEqual(selectionRequest(initial, now).request, exampleRequest(now));
  assert.partialDeepStrictEqual(selectionRequest({ ...initial, timeframe: '1' }, now), {
    limited: true,
    error: null,
  });
  assert.partialDeepStrictEqual(
    selectionRequest({ ...initial, preset: 'Custom', fromDate: '2026-02-30' }, now).error,
    { id: 'marketData.dateInvalid' },
  );
  assert.partialDeepStrictEqual(selectionRequest({ ...initial, symbol: 'bad/symbol' }, now).error, {
    id: 'feedInvalidRequest',
  });
  assert.partialDeepStrictEqual(selectionFrom(exampleRequest(now), now), {
    fromDate: '2024-10-03',
    toDate: '2026-10-03',
    preset: '2Y',
  });
});

test('storage hydration ignores corrupt or invalid selections', () => {
  const initial = restoreSelection(null, now);
  for (const raw of [
    '{',
    'null',
    '3',
    '{}',
    JSON.stringify({ ...initial, timeframe: 'no' }),
    JSON.stringify({ ...initial, feed: 'unknown' }),
  ])
    assert.deepEqual(restoreSelection(raw, now), initial);
  const selected = { ...initial, symbol: 'ETHUSDT', timeframe: '240' };
  assert.deepEqual(restoreSelection(JSON.stringify(selected), now), selected);
});

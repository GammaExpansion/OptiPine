import { expect, test } from 'vitest';
import { selectionFrom, selectionRequest, restoreSelection } from './selection.ts';
import { exampleRequest, presetRange } from '../../workflows/market-data.ts';
import { previewPoints } from './preview-points.ts';
const now = Date.UTC(2026, 9, 3, 14, 37);

test('detects matching request presets without treating similar dates as the same range', () => {
  for (const preset of ['1M', '1Y', '2Y', 'All'] as const) {
    const request = { ...exampleRequest(now), ...presetRange(preset, 'binance', '60', now) };
    expect(selectionFrom(request, now).preset).toBe(preset);
    expect(selectionRequest(selectionFrom(request, now), now).request).toMatchObject({
      from: request.from,
      to: request.to,
    });
    expect(selectionFrom({ ...request, from: request.from + 3600 }, now).preset).toBe('Custom');
  }
  expect(selectionFrom(exampleRequest(now), now + 3600000).preset).toBe('Custom');
  const limited = {
    ...exampleRequest(now),
    timeframe: '1',
    ...presetRange('1M', 'binance', '1', now),
  };
  expect(selectionFrom(limited, now).preset).toBe('1M');
});

test('ranges use workflow limits and custom errors', () => {
  const initial = restoreSelection(null, now);
  expect(selectionRequest(initial, now).request).toEqual(exampleRequest(now));
  expect(selectionRequest({ ...initial, timeframe: '1' }, now)).toMatchObject({
    limited: true,
    error: null,
  });
  expect(
    selectionRequest({ ...initial, preset: 'Custom', fromDate: '2026-02-30' }, now).error,
  ).toMatchObject({ id: 'marketData.dateInvalid' });
  expect(selectionRequest({ ...initial, symbol: 'bad/symbol' }, now).error).toMatchObject({
    id: 'feedInvalidRequest',
  });
  expect(selectionFrom(exampleRequest(now), now)).toMatchObject({
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
    expect(restoreSelection(raw, now)).toEqual(initial);
  const selected = { ...initial, symbol: 'ETHUSDT', timeframe: '240' };
  expect(restoreSelection(JSON.stringify(selected), now)).toEqual(selected);
});

test('preview geometry is finite for flat prices and bounded for long datasets', () => {
  expect(previewPoints([])).toBe('');
  const bars = Array.from({ length: 17520 }, (_, i) => ({
    time: i * 3600,
    open: 10,
    high: 10,
    low: 10,
    close: 10,
    volume: 1,
  }));
  const points = previewPoints(bars).split(' ');
  expect(points).toHaveLength(220);
  expect(points[0]).toBe('0.00,96.00');
  expect(points.at(-1)).toBe('400.00,96.00');
  expect(previewPoints([bars[0]])).not.toContain('NaN');
});

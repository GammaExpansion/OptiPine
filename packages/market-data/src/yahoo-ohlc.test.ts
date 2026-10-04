import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadFeed } from './providers.ts';

const recording = JSON.parse(
  await readFile(new URL('../test/fixtures/yahoo-forex-ohlc.json', import.meta.url), 'utf8'),
);
const now = Date.parse(recording.recordedAt);
const signal = () => new AbortController().signal;

for (const sample of recording.samples) {
  test(`recorded ${sample.symbol} ${sample.interval} normalizes only small forex envelope errors`, async () => {
    const chart = sample.response.chart.result[0];
    const daily = sample.interval === '1d';
    const timeframe = daily ? '1D' : sample.interval === '15m' ? '15' : '60';
    const from = daily ? now / 1000 - 2 * 366 * 86400 : chart.timestamp[0];
    const request = {
      feed: 'yahoo' as const,
      symbol: sample.symbol,
      timeframe,
      from,
      to: now / 1000,
    };
    const result = await loadFeed(
      request,
      async (url) =>
        daily && url.searchParams.get('interval') === '60m'
          ? sample.calendarResponse
          : sample.response,
      signal(),
      now,
    );
    assert.ok(result.input.bars.length > 0);
    const quote = chart.indicators.quote[0];
    let changes = 0;
    for (const bar of result.input.bars) {
      const i = chart.timestamp.indexOf(bar.time);
      assert.equal(bar.open, quote.open[i]);
      assert.equal(bar.close, quote.close[i]);
      assert.equal(bar.volume, quote.volume[i]);
      assert.equal(bar.high, Math.max(quote.high[i], quote.open[i], quote.close[i]));
      assert.equal(bar.low, Math.min(quote.low[i], quote.open[i], quote.close[i]));
      if (bar.high !== quote.high[i] || bar.low !== quote.low[i]) changes++;
    }
    assert.equal(result.ohlcNormalized ?? 0, changes);
    if (daily) {
      assert.ok(changes > 0);
      // Every oversized row is retained: report the last affected day, not the first failure.
      await assert.rejects(
        loadFeed(
          { ...request, from: 0 },
          async (url) =>
            url.searchParams.get('interval') === '60m' ? sample.calendarResponse : sample.response,
          signal(),
          now,
        ),
        {
          code: 'feedYahooOhlc',
          values: {
            symbol: sample.symbol,
            count: sample.observedOverLimitDays,
            date: sample.latestOverLimitDate,
            percent: 0.05,
          },
        },
      );
      const recoveryFrom = Date.parse(sample.latestOverLimitDate) / 1000 + 86400;
      const recovered = await loadFeed(
        { ...request, from: recoveryFrom },
        async (url) =>
          url.searchParams.get('interval') === '60m' ? sample.calendarResponse : sample.response,
        signal(),
        now,
      );
      assert.deepEqual(recovered.input.bars, result.input.bars);
      assert.equal(recovered.ohlcNormalized, changes);
    } else {
      assert.equal(sample.observedInconsistentRows, 0);
      assert.equal(changes, 0);
    }
  });
}

test('forex normalization is bounded, preserves validation and never applies to equities', async () => {
  const sample = recording.samples.find(
    (item: any) => item.symbol === 'EURUSD=X' && item.interval === '60m',
  );
  const recorded = sample.response;
  const chart = recorded.chart.result[0];
  const request = {
    feed: 'yahoo' as const,
    symbol: sample.symbol,
    timeframe: '60',
    from: chart.timestamp[0],
    to: now / 1000,
  };
  const load = (data: any) => loadFeed(request, async () => data, signal(), now);
  for (const excess of [0.00049, 0.00051]) {
    for (const side of ['high', 'low']) {
      const data = structuredClone(recorded);
      const q = data.chart.result[0].indicators.quote[0];
      q.open[0] = 1;
      q.close[0] = side === 'high' ? 1 + excess : 1;
      q.low[0] = side === 'high' ? 1 : 1 + excess;
      q.high[0] = side === 'high' ? 1 : 1.001;
      if (excess < 0.0005) assert.equal((await load(data)).ohlcNormalized, 1);
      else
        await assert.rejects(load(data), {
          code: 'feedYahooOhlc',
          values: {
            symbol: sample.symbol,
            count: 1,
            date: new Date(chart.timestamp[0] * 1000).toISOString().slice(0, 10),
            percent: 0.05,
          },
        });
    }
  }
  for (const change of [
    { open: 0 },
    { close: -1 },
    { open: Infinity },
    { high: 0.5, low: 1 },
    { volume: -1 },
    { open: null },
    { close: '1' },
  ]) {
    const data = structuredClone(recorded);
    const q = data.chart.result[0].indicators.quote[0];
    for (const [field, value] of Object.entries(change)) q[field][0] = value;
    await assert.rejects(load(data), { code: 'feedInvalidResponse' });
  }
  const equity = structuredClone(recorded);
  equity.chart.result[0].meta.instrumentType = 'EQUITY';
  const q = equity.chart.result[0].indicators.quote[0];
  q.close[0] = q.high[0] * 1.00001;
  await assert.rejects(load(equity), { code: 'feedInvalidResponse' });
});

test('multiple oversized intraday bars count as one affected UTC day without hiding malformed data', async () => {
  const sample = recording.samples.find(
    (item: any) => item.symbol === 'EURUSD=X' && item.interval === '60m',
  );
  const data = structuredClone(sample.response);
  const chart = data.chart.result[0];
  const quote = chart.indicators.quote[0];
  const date = (time: number) => new Date(time * 1000).toISOString().slice(0, 10);
  assert.equal(date(chart.timestamp[0]), date(chart.timestamp[1]));
  for (const i of [0, 1]) quote.close[i] = quote.high[i] * 1.001;
  const load = () =>
    loadFeed(
      {
        feed: 'yahoo',
        symbol: sample.symbol,
        timeframe: '60',
        from: chart.timestamp[0],
        to: now / 1000,
      },
      async () => data,
      signal(),
      now,
    );
  await assert.rejects(load(), {
    code: 'feedYahooOhlc',
    values: { symbol: sample.symbol, count: 1, date: date(chart.timestamp[1]), percent: 0.05 },
  });
  // Malformed volume in an oversized row must still fail structural validation.
  quote.volume[1] = -1;
  await assert.rejects(load(), { code: 'feedInvalidResponse' });
  quote.volume[1] = 0;
  quote.volume[2] = -1;
  await assert.rejects(load(), { code: 'feedInvalidResponse' });
});

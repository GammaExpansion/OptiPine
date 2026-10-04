import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { feedTimeframes, validateFeedRequest, yahooHistoryDays } from './contracts.ts';

const evidence = JSON.parse(
  await readFile(new URL('../test/fixtures/yahoo-history-limits.json', import.meta.url), 'utf8'),
);
const now = Date.parse(evidence.recordedAt);

test('Yahoo lookback bounds agree with recorded provider refusals for every supported interval', () => {
  for (const [timeframe, interval] of Object.entries(feedTimeframes.yahoo)) {
    const probe = evidence.probes.find((item: any) => item.interval === interval);
    const days = yahooHistoryDays[timeframe];
    const request = { feed: 'yahoo' as const, symbol: 'AAPL', timeframe, from: 0, to: now / 1000 };
    if (days === null) {
      assert.equal(probe.response.chart.error, null);
      assert.ok(probe.response.chart.result[0].timestamp[0] < now / 1000 - 10 * 365 * 86400);
      assert.doesNotThrow(() => validateFeedRequest(request, now));
    } else {
      assert.match(probe.response.chart.error.description, new RegExp(`last ${days} days`));
      const boundary = now / 1000 - days * 86400;
      assert.doesNotThrow(() => validateFeedRequest({ ...request, from: boundary }, now));
      assert.throws(() => validateFeedRequest({ ...request, from: boundary - 1 }, now), {
        code: 'feedYahooRange',
        values: { days },
      });
      // A short but old request is still beyond Yahoo's rolling lookback.
      assert.throws(
        () => validateFeedRequest({ ...request, from: boundary - 86400, to: boundary - 1 }, now),
        { code: 'feedYahooRange' },
      );
    }
  }
});

test('Yahoo daily history accepts old Custom ranges while request validation stays strict', () => {
  const request = {
    feed: 'yahoo' as const,
    symbol: 'SPY',
    timeframe: '1D',
    from: Date.UTC(1993, 0, 29) / 1000,
    to: now / 1000,
  };
  assert.doesNotThrow(() => validateFeedRequest(request, now));
  for (const change of [{ from: -1 }, { from: request.to }, { timeframe: 'invalid' }]) {
    assert.throws(() => validateFeedRequest({ ...request, ...change }, now), {
      code: 'feedInvalidRequest',
    });
  }
});

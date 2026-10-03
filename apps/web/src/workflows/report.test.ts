import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithEquity } from '@pine/engine';
import { metricRows } from '@pine/optimizer';
import { strategyReport } from './report.ts';
import { strategySource, syntheticBars } from './test-support.ts';

const input = {
  bars: syntheticBars(300),
  syminfo: { mintick: 0.01, mincontract: 0.001, timezone: 'Etc/UTC' },
  timeframe: '60',
};
const { metrics } = runWithEquity(strategySource, input);

test('the key figures carry their secondary figures (B1)', () => {
  const report = strategyReport(metrics);
  assert.deepEqual(report.keyFigures, [
    {
      id: 'Performance/Net profit',
      show: 'value',
      loss: false,
      value: metrics['Performance/Net profit/All USD'],
      detail: { kind: 'percent', value: metrics['Performance/Net profit/All %'] },
    },
    {
      id: 'Performance/Max drawdown (intrabar)',
      show: 'value',
      loss: true,
      value: metrics['Performance/Max drawdown (intrabar)/All USD'],
      detail: { kind: 'percent', value: metrics['Performance/Max drawdown (intrabar)/All %'] },
    },
    {
      id: 'Risk-adjusted performance/Profit factor',
      show: 'value',
      loss: false,
      value: metrics['Risk-adjusted performance/Profit factor/All USD'],
      detail: {
        kind: 'sides',
        long: metrics['Risk-adjusted performance/Profit factor/Long USD'],
        short: metrics['Risk-adjusted performance/Profit factor/Short USD'],
      },
    },
    {
      id: 'Trades analysis/Percent profitable',
      show: 'percent',
      loss: false,
      value: metrics['Trades analysis/Percent profitable/All %'],
      detail: {
        kind: 'wonLost',
        won: metrics['Trades analysis/Total winners/All USD'],
        lost: metrics['Trades analysis/Total losers/All USD'],
      },
    },
    {
      id: 'Trades analysis/Total trades',
      show: 'value',
      loss: false,
      value: metrics['Trades analysis/Total trades/All USD'],
      detail: {
        kind: 'sides',
        long: metrics['Trades analysis/Total trades/Long USD'],
        short: metrics['Trades analysis/Total trades/Short USD'],
      },
    },
    {
      id: 'Risk-adjusted performance/Sharpe ratio',
      show: 'value',
      loss: false,
      value: metrics['Risk-adjusted performance/Sharpe ratio/All USD'],
      detail: {
        kind: 'metric',
        id: 'Risk-adjusted performance/Sortino ratio',
        value: metrics['Risk-adjusted performance/Sortino ratio/All USD'],
      },
    },
  ]);
});

test('the report groups list B1 rows by engine key with All, Long and Short', () => {
  const report = strategyReport(metrics);
  const known = new Set(metricRows(metrics).map((row) => row.id));
  assert.deepEqual(
    report.groups.map((group) => [group.id, group.rows.length]),
    [
      ['returns', 8],
      ['trades', 8],
      ['risk', 8],
    ],
  );
  for (const group of report.groups)
    for (const row of group.rows) assert.ok(known.has(row.id), `${row.id} is an engine metric`);
  const rows = new Map(report.groups.flatMap((group) => group.rows.map((row) => [row.id, row])));
  assert.deepEqual(rows.get('Performance/Gross loss'), {
    id: 'Performance/Gross loss',
    show: 'value',
    loss: true,
    all: metrics['Performance/Gross loss/All USD'],
    long: metrics['Performance/Gross loss/Long USD'],
    short: metrics['Performance/Gross loss/Short USD'],
  });
  assert.deepEqual(
    [...rows.values()].filter((row) => row.loss).map((row) => row.id),
    [
      'Performance/Gross loss',
      'Performance/Max drawdown (intrabar)',
      'Trades analysis/Average loss',
      'Trades analysis/Largest loss',
    ],
  );
  const winRate = rows.get('Trades analysis/Percent profitable')!;
  assert.equal(winRate.show, 'percent');
  assert.equal(winRate.long, metrics['Trades analysis/Percent profitable/Long %']);
  assert.equal(
    rows.get('Performance/Buy and hold PnL')!.all,
    metrics['Performance/Buy and hold PnL/All %'],
  );
  // The engine computes the Sharpe ratio for All only: the other columns are dashes.
  const sharpe = rows.get('Risk-adjusted performance/Sharpe ratio')!;
  assert.equal(typeof sharpe.all, 'number');
  assert.equal(sharpe.long, undefined);
  assert.equal(sharpe.short, undefined);
});

test('a run without trades still lists every row', () => {
  const idle = runWithEquity(
    '//@version=6\nstrategy("Idle")\nif false\n    strategy.entry("L", strategy.long)',
    input,
  );
  const report = strategyReport(idle.metrics);
  assert.equal(report.keyFigures[4].value, 0);
  assert.equal(report.groups.flatMap((group) => group.rows).length, 24);
  assert.equal(strategyReport({}).keyFigures[0].value, undefined);
});

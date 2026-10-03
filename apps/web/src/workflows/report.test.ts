import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithEquity } from '@pine/engine';
import { metricRows } from '@pine/optimizer';
import { reportCsv, strategyReport, type ReportCsvHeaders } from './report.ts';
import { csvNumber } from './csv.ts';
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

const headers: ReportCsvHeaders = {
  metric: 'Metric',
  all: 'All',
  long: 'Long',
  short: 'Short',
  keyFigures: 'Key figures',
  returns: 'Returns',
  trades: 'Trades',
  risk: 'Risk',
};

test('report CSV exports all key figures, secondary details and three groups from a real run', () => {
  const report = strategyReport(metrics);
  const csv = reportCsv(report, headers);
  const sections = csv.trimEnd().split('\r\n,,,\r\n');
  assert.equal(sections.length, 4);
  assert.equal(sections[0].split('\r\n').length, 13); // title, header, 6 figures, 5 details
  assert.ok(
    sections[0].includes(`Net profit,${csvNumber(report.keyFigures[0].value as number)},,`),
  );
  const profitFactor = report.keyFigures[2];
  assert.equal(profitFactor.detail.kind, 'sides');
  if (profitFactor.detail.kind === 'sides')
    assert.ok(
      sections[0].includes(
        `Profit factor,${[profitFactor.value, profitFactor.detail.long, profitFactor.detail.short]
          .map((value) => (value == null ? '' : csvNumber(value as number)))
          .join(',')}`,
      ),
    );
  assert.ok(
    sections[0].includes(`Total winners,${metrics['Trades analysis/Total winners/All USD']},,`),
  );
  assert.ok(
    sections[0].includes(`Total losers,${metrics['Trades analysis/Total losers/All USD']},,`),
  );
  assert.ok(sections[0].includes('Sortino ratio,'));
  for (const [index, group] of report.groups.entries()) {
    const lines = sections[index + 1].split('\r\n');
    assert.equal(lines[0], `${headers[group.id]},,,`);
    assert.equal(lines[1], 'Metric,All,Long,Short');
    assert.equal(lines.length, group.rows.length + 2);
    assert.deepEqual(
      lines.slice(2).map((line) => line.split(',')[0]),
      group.rows.map((row) => row.id.slice(row.id.indexOf('/') + 1)),
    );
  }
  assert.ok(
    csv.includes(
      `Sharpe ratio,${csvNumber(metrics['Risk-adjusted performance/Sharpe ratio/All USD'] as number)},,`,
    ),
  );
});

test('report CSV translates only headers, escapes fields and preserves percentage/sign/missing rules', () => {
  const report = strategyReport({
    'Performance/Net profit/All USD': 579.6200000000001,
    'Performance/Net profit/All %': 5.7962,
    'Performance/Max drawdown (intrabar)/All USD': 123.45,
    'Performance/Max drawdown (intrabar)/All %': 1.23,
    'Performance/Gross loss/All USD': 0,
    'Performance/Gross loss/Long USD': 5,
    'Performance/Gross loss/Short USD': -5,
    'Trades analysis/Percent profitable/All %': 75,
    'Trades analysis/Average profit / average loss/All USD': 'N/A, "missing"',
    'Risk-adjusted performance/Sharpe ratio/All USD': NaN,
    'Risk-adjusted performance/Sharpe ratio/Long USD': Infinity,
  });
  const csv = reportCsv(report, {
    ...headers,
    metric: '指标',
    all: '全部',
    long: '多',
    short: '空',
    keyFigures: '关键,指标\n"汇总"',
  });
  assert.ok(csv.startsWith('"关键,指标\n""汇总""",,,\r\n指标,全部,多,空\r\n'));
  assert.ok(csv.includes('Net profit,579.62,,\r\nNet profit,5.7962%,,\r\n'));
  assert.ok(
    csv.includes('Max drawdown (intrabar),-123.45,,\r\nMax drawdown (intrabar),-1.23%,,\r\n'),
  );
  assert.ok(csv.includes('Gross loss,0,-5,-5\r\n'));
  assert.ok(csv.includes('Percent profitable,75%,,\r\n'));
  assert.ok(csv.includes('Average profit / average loss,"N/A, ""missing""",,\r\n'));
  assert.ok(csv.includes('Sharpe ratio,,,\r\n'));
  assert.ok(reportCsv(strategyReport({}), headers).includes('Net profit,,,\r\n'));
});

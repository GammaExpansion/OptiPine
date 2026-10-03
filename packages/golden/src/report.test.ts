import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { excelTimeToUnix, normalizeReport, normalizeSettings, readWorkbook } from './report.ts';
import type { Cell } from './report.ts';
import { isMetricCell } from './report-layout.ts';

test('XLSX reader preserves sparse columns, strings, booleans, numbers and explicit blanks', () => {
  const parts = {
    'xl/workbook.xml': '<workbook><sheets><sheet name="Values" r:id="r1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml':
      '<sst><si><r><t>shared </t></r><r><t>text &amp; more</t></r></si></sst>',
    'xl/worksheets/sheet1.xml':
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>1.25</v></c><c r="D1" t="b"><v>1</v></c><c r="E1" t="inlineStr"><is><t>inline</t></is></c><c r="F1" t="str"><v></v></c></row></sheetData></worksheet>',
  };
  const bytes = zipSync(
    Object.fromEntries(Object.entries(parts).map(([name, text]) => [name, strToU8(text)])),
  );
  assert.deepEqual(readWorkbook(bytes), {
    Values: [['shared text & more', null, 1.25, true, 'inline', null]],
  });
});

test('report layout distinguishes structural blanks from undefined observations', () => {
  const headers: Cell[] = [null, 'All USD', 'All %', 'Long USD', 'Long %', 'Short USD', 'Short %'];
  const workbook = {
    Performance: [headers, ['Initial capital', 100, null, null, null, null, null]],
    'Trades analysis': [headers, ['Average PnL', 2, 1, 2, 1, null, null]],
    'Risk-adjusted performance': [headers, ['Profit factor', 2, null, 2, null, null, null]],
    Trades: [['Trade number']],
    Properties: [
      ['Property', 'Value'],
      ['Currency', 'USD'],
    ],
  } satisfies Record<string, Cell[][]>;
  const { metrics } = normalizeReport(workbook, 'UTC');
  assert.equal(metrics['Trades analysis/Average PnL/Short USD'], null);
  assert.equal(metrics['Risk-adjusted performance/Profit factor/Short USD'], null);
  assert.equal('Performance/Initial capital/Long USD' in metrics, false);
  assert.equal('Risk-adjusted performance/Profit factor/All %' in metrics, false);
  assert.equal(Object.keys(metrics).length, 10);
  assert.equal(isMetricCell('Performance', 'Open PnL', 'All USDT'), true);
  assert.equal(isMetricCell('Performance', 'Open PnL', 'Long USDT'), false);
  assert.throws(
    () => isMetricCell('Performance', 'Unknown new row', 'All USD'),
    /Unknown report metric/,
  );
  workbook.Performance[1][2] = 99;
  assert.throws(() => normalizeReport(workbook, 'UTC'), /Unexpected populated/);
});

test('Expectancy keeps its native name, dimensions and no-trade blanks independently of old names', () => {
  const headers: Cell[] = [
    null,
    'All USDT',
    'All %',
    'Long USDT',
    'Long %',
    'Short USDT',
    'Short %',
  ];
  const workbook: Record<string, Cell[][]> = {
    Performance: [
      headers,
      ['Expectancy', 0.41, null, 0.41, null, null, null],
      ['Expected payoff', 0.41, null, 0.41, null, 0, null],
    ],
    'Trades analysis': [headers, ['Expectancy', 0.41, 0.01, 0.41, 0.01, null, null]],
    'Risk-adjusted performance': [headers],
    Trades: [['Trade number']],
    Properties: [['Property', 'Value']],
  };
  const { metrics } = normalizeReport(workbook, 'UTC');
  assert.deepEqual(metrics, {
    'Performance/Expectancy/All USDT': 0.41,
    'Performance/Expectancy/Long USDT': 0.41,
    'Performance/Expectancy/Short USDT': null,
    'Performance/Expected payoff/All USDT': 0.41,
    'Performance/Expected payoff/Long USDT': 0.41,
    'Performance/Expected payoff/Short USDT': 0,
    'Trades analysis/Expectancy/All USDT': 0.41,
    'Trades analysis/Expectancy/All %': 0.01,
    'Trades analysis/Expectancy/Long USDT': 0.41,
    'Trades analysis/Expectancy/Long %': 0.01,
    'Trades analysis/Expectancy/Short USDT': null,
    'Trades analysis/Expectancy/Short %': null,
  });

  workbook.Performance[1][2] = 1;
  assert.throws(() => normalizeReport(workbook, 'UTC'), /Unexpected populated report cell/);
  workbook.Performance[1][2] = null;
  workbook.Performance[1][0] = 'Unknown expectancy variant';
  assert.throws(() => normalizeReport(workbook, 'UTC'), /Unknown report metric layout/);
});

test('report local timestamp conversion observes winter and summer offsets', () => {
  const excelSerial = (iso: string) => Date.parse(iso) / 86400000 + 25569;
  assert.equal(
    excelTimeToUnix(excelSerial('2024-01-03T09:30:00Z'), 'America/Los_Angeles'),
    Date.parse('2024-01-03T17:30:00Z') / 1000,
  );
  assert.equal(
    excelTimeToUnix(excelSerial('2024-07-03T09:30:00Z'), 'America/Los_Angeles'),
    Date.parse('2024-07-03T16:30:00Z') / 1000,
  );
});

test('limit verification labels preserve ambiguous native wording without inferring a tick count', () => {
  const exact = normalizeSettings({ 'Limit order execution': 'Requested price' });
  assert.equal(exact.settings.backtest_fill_limits_assumption, 0);
  assert.deepEqual(exact.warnings, []);
  for (const label of [
    'Requested price and 1 tick beyond',
    '2 ticks beyond',
    'Requested price pending',
  ]) {
    const unknown = normalizeSettings({
      'Limit order execution': label,
      'Order execution delay': 'unknown',
    });
    assert.equal(Object.hasOwn(unknown.settings, 'backtest_fill_limits_assumption'), false);
    assert.match(unknown.provenance.backtest_fill_limits_assumption, /\(unparsed\)/);
    assert.ok(unknown.provenance.backtest_fill_limits_assumption.endsWith(label));
    assert.deepEqual(unknown.warnings, [
      'Unrecognized Order execution delay: unknown',
      `Unrecognized Limit order execution: ${label}`,
    ]);
  }
});

test('settings normalization follows collected inputs, including omitted report commission units', () => {
  const normalized = normalizeSettings(
    {
      Commission: '0.05',
      'Long leverage': '4x',
      'Short leverage': 'Infinity',
      'Default order size': '300% of equity',
      'Order execution delay': 'None',
      'Script execution': 'On bar close, On order fill',
    },
    'Properties → Commission = 0.05 USD per contract',
  );
  assert.deepEqual(normalized.settings, {
    commission_value: 0.05,
    default_qty_type: 'percent_of_equity',
    default_qty_value: 300,
    margin_long: 25,
    margin_short: 0,
    calc_on_order_fills: true,
    calc_on_every_tick: false,
    process_orders_on_close: true,
    commission_type: 'cash_per_contract',
  });
  assert.match(normalized.provenance.commission_type, /^meta.notes:/);
  const ambiguous = normalizeSettings({ Commission: '0.1' });
  assert.equal(ambiguous.settings.commission_type, undefined);
  assert.equal(ambiguous.warnings.length, 1);
});

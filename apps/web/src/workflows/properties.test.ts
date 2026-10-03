import assert from 'node:assert/strict';
import test from 'node:test';
import { describe, runWithEquity, type RunInput } from '@pine/engine';
import { workflowMessage } from './messages.ts';
import {
  keepPropertyOverrides,
  propertyFields,
  propertySettings,
  scriptProperties,
  setPropertyOverride,
  validateProperty,
  type PropertyOverrides,
} from './properties.ts';
import { syntheticBars } from './test-support.ts';

const script = (args: string, version = 6) => `//@version=${version}
strategy("Properties"${args})
basis = ta.sma(close, 5)
if ta.crossover(close, basis)
    strategy.entry("L", strategy.long, limit=close - 0.2)
if ta.crossunder(close, basis)
    strategy.entry("S", strategy.short)
if close > basis and close > close[1]
    strategy.entry("L2", strategy.long)
`;

test('script values come from strategy(), with the engine defaults for omitted arguments', () => {
  const declared = scriptProperties(
    describe(
      script(
        [
          '',
          'initial_capital=50000',
          'default_qty_type=strategy.cash',
          'default_qty_value=1000',
          'pyramiding=3',
          'commission_type=strategy.commission.cash_per_contract',
          'commission_value=0.5',
          'margin_long=50',
          'margin_short=0',
          'slippage=2',
          'backtest_fill_limits_assumption=1',
          'process_orders_on_close=true',
          'calc_on_order_fills=true',
        ].join(', '),
      ),
    ),
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(declared).map(([id, value]) => [id, value.kind === 'value' && value.value]),
    ),
    {
      initialCapital: 50000,
      orderSize: 1000,
      orderSizeUnit: 'cash',
      pyramiding: 3,
      scriptExecution: 'orderFills',
      commission: 0.5,
      commissionUnit: 'cash_per_contract',
      longLeverage: 2,
      shortLeverage: Infinity,
      slippage: 2,
      limitFillTicks: 1,
      orderDelay: 'none',
    },
  );
  const defaults = (version: number) =>
    Object.fromEntries(
      Object.entries(scriptProperties(describe(script('', version)))).map(([id, value]) => [
        id,
        value.kind === 'value' && value.value,
      ]),
    );
  assert.deepEqual(defaults(6), {
    initialCapital: 1_000_000,
    orderSize: 1,
    orderSizeUnit: 'fixed',
    pyramiding: 0,
    scriptExecution: 'barClose',
    commission: 0,
    commissionUnit: 'percent',
    longLeverage: 1,
    shortLeverage: 1,
    slippage: 0,
    limitFillTicks: 0,
    orderDelay: 'oneTick',
  });
  // Pine v5 declares no margin by default: positions never get a margin call.
  assert.equal(defaults(5).longLeverage, Infinity);
});

test('an argument given as an expression is shown as computed by the script', () => {
  const properties = scriptProperties(
    describe(script(',\n initial_capital=1000 * 10, calc_on_every_tick=bar_index > 0')),
  );
  assert.deepEqual(properties.initialCapital, { kind: 'expression', line: 2 });
  assert.deepEqual(properties.scriptExecution, { kind: 'expression', line: 2 });
  const fields = propertyFields(properties, {});
  assert.equal(fields[0].value, undefined);
  assert.equal(fields[0].overridden, false);
  const overridden = propertyFields(
    properties,
    setPropertyOverride(properties, {}, 'initialCapital', 1000),
  );
  assert.deepEqual([overridden[0].value, overridden[0].overridden], [1000, true]);
});

test('an override equal to the script value is no override; recompiles keep real ones', () => {
  const properties = scriptProperties(describe(script(', initial_capital=50000')));
  let overrides = setPropertyOverride(properties, {}, 'initialCapital', 60000);
  overrides = setPropertyOverride(properties, overrides, 'slippage', 1);
  assert.deepEqual(overrides, { initialCapital: 60000, slippage: 1 });
  overrides = setPropertyOverride(properties, overrides, 'initialCapital', 50000);
  assert.deepEqual(overrides, { slippage: 1 });
  const recompiled = scriptProperties(describe(script(', initial_capital=50000, slippage=1')));
  assert.deepEqual(keepPropertyOverrides(recompiled, { initialCapital: 70000, slippage: 1 }), {
    initialCapital: 70000,
  });
  const fields = propertyFields(recompiled, { initialCapital: 70000 });
  assert.deepEqual(
    fields.filter((field) => field.overridden).map((field) => [field.id, field.script]),
    [['initialCapital', { kind: 'value', value: 50000 }]],
  );
});

test('invalid property values are explained under the field', () => {
  assert.equal(validateProperty('initialCapital', 1), null);
  for (const value of [0, -5, Number.NaN, Infinity])
    assert.deepEqual(
      validateProperty('initialCapital', value),
      workflowMessage('backtest.propertyPositive'),
    );
  assert.equal(validateProperty('longLeverage', Infinity), null);
  assert.deepEqual(
    validateProperty('shortLeverage', 0),
    workflowMessage('backtest.propertyPositive'),
  );
  assert.equal(validateProperty('commission', 0), null);
  assert.deepEqual(
    validateProperty('commission', -0.1),
    workflowMessage('backtest.propertyNonNegative'),
  );
  for (const id of ['pyramiding', 'slippage', 'limitFillTicks'] as const) {
    assert.equal(validateProperty(id, 0), null);
    assert.deepEqual(validateProperty(id, 1.5), workflowMessage('backtest.propertyWholeNumber'));
    assert.deepEqual(validateProperty(id, -1), workflowMessage('backtest.propertyWholeNumber'));
  }
  assert.deepEqual(
    validateProperty('orderSizeUnit', 'contracts' as never),
    workflowMessage('backtest.propertyNotOption'),
  );
  const fields = propertyFields(scriptProperties(describe(script(''))), { pyramiding: -1 });
  assert.deepEqual(
    fields.filter((field) => field.error).map((field) => field.id),
    ['pyramiding'],
  );
});

test('overrides run exactly as the same values declared in strategy()', () => {
  const input: RunInput = {
    bars: syntheticBars(400),
    syminfo: { mintick: 0.01, mincontract: 0.001, timezone: 'Etc/UTC' },
    timeframe: '60',
  };
  const cases: [PropertyOverrides, string][] = [
    [{ initialCapital: 25000 }, 'initial_capital=25000'],
    [
      { orderSize: 3, orderSizeUnit: 'fixed' },
      'default_qty_type=strategy.fixed, default_qty_value=3',
    ],
    [
      { orderSize: 80, orderSizeUnit: 'percent_of_equity', longLeverage: 2, shortLeverage: 4 },
      'default_qty_type=strategy.percent_of_equity, default_qty_value=80, margin_long=50, margin_short=25',
    ],
    [
      { commission: 2, commissionUnit: 'cash_per_order', slippage: 3 },
      'commission_type=strategy.commission.cash_per_order, commission_value=2, slippage=3',
    ],
    [
      { orderDelay: 'none', limitFillTicks: 1 },
      'process_orders_on_close=true, backtest_fill_limits_assumption=1',
    ],
    [{ scriptExecution: 'orderFills', pyramiding: 2 }, 'calc_on_order_fills=true, pyramiding=2'],
  ];
  const baseline = runWithEquity(script(''), input);
  for (const [overrides, declaration] of cases) {
    const overridden = runWithEquity(script(''), {
      ...input,
      settings: propertySettings(overrides),
    });
    assert.deepEqual(overridden.diagnostics, []);
    assert.deepEqual(overridden, runWithEquity(script(`, ${declaration}`), input), declaration);
    assert.notDeepEqual(overridden.metrics, baseline.metrics, declaration);
  }
  assert.deepEqual(propertySettings({ longLeverage: Infinity, scriptExecution: 'everyTick' }), {
    margin_long: 0,
    calc_on_order_fills: false,
    calc_on_every_tick: true,
  });
  assert.deepEqual(propertySettings({}), {});
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { compile } from './index.ts';
import type { Call, Program } from './ast.ts';

function script(body: string, version: 5 | 6 = 6) {
  return compile(`//@version=${version}\nindicator("Compiler checks")\n${body}\n`);
}

function succeeds(body: string, version: 5 | 6 = 6): Program {
  const result = script(body, version);
  assert.equal(result.success, true, JSON.stringify(result.diagnostics));
  return result.program!;
}

function fails(body: string, pattern: RegExp, version: 5 | 6 = 6): void {
  const result = script(body, version);
  assert.equal(result.success, false);
  assert.match(result.diagnostics[0].message, pattern);
  assert.notEqual(result.diagnostics[0].kind, 'unsupported');
}

test('drawing copies retain their object type for chained and assigned method calls', () => {
  for (const version of [5, 6] as const)
    succeeds(
      'original = line.new(0, 1.0, 1, 2.0)\ncopy = line.copy(original)\ncopy.set_color(color.red)\noriginal.copy().set_width(2)',
      version,
    );
});

for (const version of [5, 6] as const) {
  test(`v${version}: risk rules require global calls with their declared simple arguments`, () => {
    const prefix = `//@version=${version}\nstrategy("Risk signatures")\n`;
    const calls = [
      'strategy.risk.allow_entry_in(strategy.direction.long)',
      'strategy.risk.max_position_size(25.5)',
      'strategy.risk.max_intraday_filled_orders(3)',
      'strategy.risk.max_drawdown(10.5, strategy.percent_of_equity)',
      'strategy.risk.max_intraday_loss(10, strategy.cash, alert_message="halt")',
      'strategy.risk.max_cons_loss_days(2, "halt")',
    ];
    for (const call of calls) {
      const global = compile(prefix + call);
      assert.equal(global.success, true, JSON.stringify(global.diagnostics));
      for (const enclosing of ['if true', 'applyRisk() =>']) {
        const local = compile(`${prefix}${enclosing}\n    ${call}`);
        assert.equal(local.success, false, call);
        assert.equal(local.diagnostics[0].kind, 'semantic');
        assert.equal(local.diagnostics[0].line, 4);
        assert.match(local.diagnostics[0].message, /cannot be called in local scope/);
      }
    }
    const inputs = compile(`${prefix}
limit = input.float(10.5)
days = input.int(2)
strategy.risk.max_drawdown(type=strategy.cash, value=limit, alert_message="halt")
strategy.risk.max_intraday_loss(limit, strategy.percent_of_equity)
strategy.risk.max_cons_loss_days(days)`);
    assert.equal(inputs.success, true, JSON.stringify(inputs.diagnostics));

    for (const call of [
      'strategy.risk.max_drawdown()',
      'strategy.risk.max_drawdown(10)',
      'strategy.risk.max_drawdown(close, strategy.cash)',
      'strategy.risk.max_drawdown(10, bar_index > 1 ? strategy.cash : strategy.percent_of_equity)',
      'strategy.risk.max_drawdown(10, strategy.cash, alert_message=str.tostring(close))',
      'strategy.risk.max_drawdown(10, strategy.cash, typo="halt")',
      'strategy.risk.max_drawdown(10, strategy.cash, "halt", 1)',
      'strategy.risk.max_drawdown(true, strategy.cash)',
      'strategy.risk.max_intraday_loss(10, 1)',
      'strategy.risk.max_cons_loss_days(1.5)',
      'strategy.risk.max_cons_loss_days(bar_index)',
      'strategy.risk.max_cons_loss_days()',
      'strategy.risk.max_position_size(close)',
      'strategy.risk.max_intraday_filled_orders(bar_index)',
      'strategy.risk.allow_entry_in(bar_index > 1 ? strategy.direction.long : strategy.direction.short)',
    ]) {
      const result = compile(prefix + call);
      assert.equal(result.success, false, call);
      assert.equal(result.diagnostics[0].kind, 'type', call);
    }
  });
}

for (const version of [5, 6] as const) {
  test(`v${version}: the intraday fill limit requires global scope`, () => {
    const declaration = `//@version=${version}\nstrategy("Risk scope")\n`;
    const global = compile(
      declaration + 'limit = input.int(2)\nstrategy.risk.max_intraday_filled_orders(limit)\n',
    );
    assert.equal(global.success, true, JSON.stringify(global.diagnostics));

    for (const enclosing of ['if true', 'applyLimit() =>']) {
      const result = compile(
        declaration + `${enclosing}\n    strategy.risk.max_intraday_filled_orders(2)\n`,
      );
      assert.equal(result.success, false, enclosing);
      assert.equal(result.diagnostics[0].kind, 'semantic');
      assert.equal(result.diagnostics[0].line, 4);
      assert.match(
        result.diagnostics[0].message,
        /strategy\.risk\.max_intraday_filled_orders cannot be called in local scope/,
      );
    }
  });

  test(`v${version}: reassignment promotes a variable's qualifier`, () => {
    fails('n = 7\nn := bar_index + 1\nplot(ta.ema(close, n))', /simple/, version);
    succeeds('n = 7\nn := bar_index + 1\nplot(ta.sma(close, n))', version);
  });

  test(`v${version}: functions cannot rebind globals but may mutate reference contents`, () => {
    fails('n = 0\nincrement() =>\n    n += 1\nplot(n)', /global variables/, version);
    succeeds(
      'values = array.new<float>(1, 0.0)\nupdate() =>\n    array.set(values, 0, close)\nupdate()\nplot(array.get(values, 0))',
      version,
    );
    succeeds(
      'type Box\n    float value\nb = Box.new(0.0)\nupdate() =>\n    b.value := close\nupdate()\nplot(b.value)',
      version,
    );
  });

  test(`v${version}: loop control requires an enclosing loop`, () => {
    for (const control of ['break', 'continue']) {
      fails(`if close > open\n    ${control}\nplot(close)`, /enclosing loop/, version);
      succeeds(`for i = 0 to 3\n    if i == 1\n        ${control}\nplot(close)`, version);
    }
  });

  test(`v${version}: ordinary functions are not reachable as methods or arbitrary namespaces`, () => {
    fails('double(x) => x * 2\nx = close\nplot(x.double())', /Unknown function/, version);
    fails('double(x) => x * 2\nplot(unknown.double(close))', /Undeclared identifier/, version);
    succeeds('double(x) => x * 2\nplot(double(close))', version);
  });

  test(`v${version}: method resolution records the typed receiver`, () => {
    const program = succeeds(
      'values = array.new<float>(1, close)\nvalues.push(open)\nplot(values.get(0))\n' +
        'grid = matrix.new<float>(1, 1, close)\ngrid.set(0, 0, open)\nplot(grid.get(0, 0))\n' +
        'method double(float receiver) => receiver * 2\nplot(close.double())\n' +
        'plot(array.new<float>(1, close).get(0))',
      version,
    );
    const calls: Call[] = [];
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if ('kind' in node && node.kind === 'call') calls.push(node as Call);
      for (const child of Object.values(node)) {
        if (Array.isArray(child)) child.forEach(visit);
        else visit(child);
      }
    };
    visit(program);
    assert.deepEqual(
      calls.filter((call) => call.implicitReceiver).map((call) => call.resolvedName),
      ['array.push', 'array.get', 'matrix.set', 'matrix.get', 'double', 'array.get'],
    );
  });

  test(`v${version}: user functions enforce declared parameter qualifiers`, () => {
    fails(
      'smooth(simple int length) => ta.ema(close, length)\nplot(smooth(bar_index))',
      /simple/,
      version,
    );
    succeeds('smooth(simple int length) => ta.ema(close, length)\nplot(smooth(7))', version);
  });
}

test('v6 rejects a positional argument repeated by name in user functions', () => {
  fails('double(x) => x * 2\nplot(double(close, x = open))', /Duplicate argument/);
});

test('namespaced builtin assignments are rejected without mutating later compile state', () => {
  const before = script('plot(ta.ema(close, int(syminfo.mintick)))');
  fails('syminfo.mintick := close\nplot(close)', /Cannot reassign builtin/);
  assert.deepEqual(script('plot(ta.ema(close, int(syminfo.mintick)))'), before);
});

test('v6 integer division retains an integer type without accepting float operands', () => {
  succeeds('int minutes = timeframe.in_seconds(timeframe.period) / 61\nplot(minutes)');
  succeeds(
    'minutes() =>\n    int value = timeframe.in_seconds(timeframe.period) / 61\n    value\nint result = minutes()\nplot(result)',
  );
  fails('int value = 1.5\nplot(value)', /Cannot assign float to int/);
  fails('int value = close\nplot(value)', /Cannot assign float to int/);
  fails(
    'int value = timeframe.in_seconds(timeframe.period) / 61.0\nplot(value)',
    /Cannot assign float to int/,
  );
  succeeds('int value = 5 / 2\nplot(value)');
});

test('syminfo.mincontract is a v6 builtin; v5 retains other symbol metadata', () => {
  const before = script('plot(syminfo.mincontract)', 6);
  assert.equal(before.success, true, JSON.stringify(before.diagnostics));
  const unavailable = script('plot(syminfo.mincontract)', 5);
  assert.equal(unavailable.success, false);
  assert.equal(unavailable.diagnostics[0].kind, 'undeclared');
  assert.equal(unavailable.diagnostics[0].line, 3);
  succeeds('plot(syminfo.mintick + syminfo.pointvalue)', 5);
  assert.deepEqual(script('plot(syminfo.mincontract)', 6), before);
});

test('v5 mincontract availability does not hide user bindings or object fields', () => {
  for (const version of [5, 6] as const)
    succeeds(
      'type Contract\n    string mincontract\n' +
        'instrument = Contract.new("local")\n' +
        'string amount = instrument.mincontract\nplot(str.length(amount))',
      version,
    );
  succeeds(
    'type Contract\n    string mincontract\n' +
      'syminfo = Contract.new("local")\n' +
      'string amount = syminfo.mincontract\nplot(str.length(amount))',
    5,
  );
  succeeds('enum syminfo\n    mincontract\nvalue = syminfo.mincontract\nplot(close)', 5);
});

test('the import alias keyword cannot be used as an identifier', () => {
  for (const body of [
    'as = 1\nplot(as)',
    'int as = 1\nplot(close)',
    'as(x) => x\nplot(close)',
    'value(as) => as\nplot(close)',
    'type Value\n    float as\nplot(close)',
    'for as = 0 to 1\n    x = close\nplot(close)',
    '[as, value] = ta.bb(close, 20, 2)\nplot(close)',
  ]) {
    const result = script(body);
    assert.equal(result.success, false, body);
    assert.equal(result.diagnostics[0].kind, 'syntax');
  }
  succeeds('asset = 1\nvalue = "as"\nplot(asset)');
});

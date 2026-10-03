import assert from 'node:assert/strict';
import test from 'node:test';
import { compile, run, runWithEquity, sweep } from './index.ts';
import { Broker } from './broker/broker.ts';
import type { RunInput } from './types.ts';

const input: RunInput = {
  bars: [0, 1, 2, 3, 4].map((index) => ({
    time: 1_700_000_000 + index * 3600,
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 100,
  })),
  syminfo: {},
  timeframe: '60',
};
const source = `//@version=6
strategy("Failure bar")
if bar_index == 3
    runtime.error("Stopped on purpose")`;

for (const execute of [run, runWithEquity]) {
  test(`${execute.name} reports the source line and zero-based bar of runtime.error`, () => {
    const result = execute(source, input);
    assert.deepEqual(result.diagnostics, [
      { kind: 'runtime', line: 4, bar: 3, message: 'Stopped on purpose' },
    ]);
    if ('equity' in result) assert.deepEqual(result.equity, []);
  });

  test(`${execute.name} reports the bar of a failing array index`, () => {
    const result = execute(
      `//@version=6
indicator("Bounds")
values = array.from(close, close)
plot(array.get(values, bar_index))`,
      input,
    );
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].kind, 'runtime');
    assert.equal(result.diagnostics[0].line, 4);
    assert.equal(result.diagnostics[0].bar, 2);
    assert.match(result.diagnostics[0].message, /Array index 2 is outside array of size 2/);
  });

  test(`${execute.name} reports the bar that exhausts the step budget`, () => {
    const result = execute(
      `//@version=6
indicator("Budget")
if bar_index == 3
    while true
        continue`,
      input,
    );
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].kind, 'limit');
    assert.equal(result.diagnostics[0].bar, 3);
    assert.match(result.diagnostics[0].message, /Execution step limit/);
  });

  test(`${execute.name} leaves setup failures without a bar`, () => {
    const invalidSymbol = execute(source, { ...input, syminfo: { mintick: 0 } });
    assert.equal(invalidSymbol.diagnostics[0].kind, 'runtime');
    assert.equal(Object.hasOwn(invalidSymbol.diagnostics[0], 'bar'), false);
    const invalidSchedule = execute(source, {
      ...input,
      bars: input.bars.slice(0, 1),
      strategyClosePending: true,
    });
    assert.equal(invalidSchedule.diagnostics[0].kind, 'unsupported');
    assert.equal(Object.hasOwn(invalidSchedule.diagnostics[0], 'bar'), false);
  });
}

test('sweep preserves each failing bar, including zero, and continues with later trials', () => {
  const result = sweep(
    `//@version=6
indicator("Trial failures")
stop = input.int(3, "Stop")
if bar_index == stop
    runtime.error("Trial stopped")`,
    input,
    [0, 3, 10].map((Stop) => ({ inputs: { Stop } })),
  );
  assert.deepEqual(result.compilation, { success: true, diagnostics: [] });
  assert.deepEqual(
    result.runs.map((trial) => trial.result.diagnostics),
    [
      [{ kind: 'runtime', line: 5, bar: 0, message: 'Trial stopped' }],
      [{ kind: 'runtime', line: 5, bar: 3, message: 'Trial stopped' }],
      [],
    ],
  );
});

test('compile diagnostics have no bar through any public run API', () => {
  const invalid = '//@version=6\nindicator("Compile failure")\nplot(unknown_value)';
  const compiled = compile(invalid);
  assert.equal(compiled.success, false);
  assert.equal(compiled.diagnostics.length, 1);
  assert.equal(compiled.diagnostics[0].kind, 'undeclared');
  assert.equal(Object.hasOwn(compiled.diagnostics[0], 'bar'), false);
  assert.deepEqual(run(invalid, input).diagnostics, compiled.diagnostics);
  assert.deepEqual(runWithEquity(invalid, input).diagnostics, compiled.diagnostics);
  const trials = sweep(invalid, input, [{}]);
  assert.deepEqual(trials.compilation.diagnostics, compiled.diagnostics);
  assert.deepEqual(trials.runs, []);
});

test('historical ticks and realtime-tail calculations report the input bar index', () => {
  for (const scheduling of [{ historicalTicks: true }, { realtimeTail: true }]) {
    const scheduledInput = { ...input, bars: input.bars.slice(0, 4), ...scheduling };
    const script = source.replace(
      'strategy("Failure bar")',
      'strategy("Ticks", calc_on_every_tick=true)',
    );
    for (const execute of [run, runWithEquity]) {
      const result = execute(script, scheduledInput);
      assert.deepEqual(result.diagnostics, [
        { kind: 'runtime', line: 4, bar: 3, message: 'Stopped on purpose' },
      ]);
    }
  }
});

test('fill recalculations keep the pending final bar even without a regular close calculation', () => {
  const script = `//@version=6
strategy("Fill failure", calc_on_order_fills=true)
if bar_index == 2
    strategy.entry("L", strategy.long)
if strategy.position_size > 0
    runtime.error("Fill stopped")`;
  const pending = { ...input, bars: input.bars.slice(0, 4), realtimeTail: true };
  for (const execute of [run, runWithEquity]) {
    const result = execute(script, pending);
    assert.deepEqual(result.diagnostics, [
      { kind: 'runtime', line: 6, bar: 3, message: 'Fill stopped' },
    ]);
  }
});

for (const phase of ['beginBar', 'endBar'] as const) {
  for (const kind of ['limit', 'internal'] as const) {
    test(`${phase} ${kind} failures keep the executing bar`, (t) => {
      const original = Broker.prototype[phase];
      const calls = new WeakMap<Broker, number>();
      const failure =
        kind === 'limit'
          ? Object.assign(new Error('Order processing did not converge'), { kind })
          : new TypeError('Injected broker fault');
      // Inject at the broker boundary to exercise both scheduling paths without a runaway order book.
      t.mock.method(Broker.prototype, phase, function (this: Broker, ...args: unknown[]) {
        const index = calls.get(this) ?? 0;
        calls.set(this, index + 1);
        if (index === 3) throw failure;
        return Reflect.apply(original, this, args);
      });
      const script = '//@version=6\nstrategy("Broker failure")\nplot(close)';
      const results = [
        run(script, input),
        runWithEquity(script, input),
        sweep(script, input, [{}]).runs[0].result,
      ];
      for (const result of results) {
        assert.equal(result.diagnostics.length, 1);
        assert.equal(result.diagnostics[0].kind, kind);
        assert.equal(result.diagnostics[0].bar, 3);
        assert.equal(result.diagnostics[0].message, failure.message);
      }
    });
  }
}

test('final-report failures have no bar after either an empty or completed run', (t) => {
  const original = Broker.prototype.result;
  const reported = new WeakSet<Broker>();
  t.mock.method(Broker.prototype, 'result', function (this: Broker) {
    if (!reported.has(this)) {
      reported.add(this);
      throw new TypeError('Injected report fault');
    }
    return original.call(this);
  });
  for (const bars of [[], input.bars]) {
    for (const execute of [run, runWithEquity]) {
      const result = execute('//@version=6\nstrategy("Report failure")\nplot(close)', {
        ...input,
        bars,
      });
      assert.equal(result.diagnostics[0].kind, 'internal');
      assert.equal(result.diagnostics[0].message, 'Injected report fault');
      assert.equal(Object.hasOwn(result.diagnostics[0], 'bar'), false);
    }
  }
});

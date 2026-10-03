import assert from 'node:assert/strict';
import test from 'node:test';
import { compile, describe, run, runWithEquity, sweep } from './index.ts';
import { diagnosticLimit } from './compiler/index.ts';
import type { Diagnostic, RunInput } from './types.ts';

/** Trend Breakout as B10 breaks it: `lenght` twice, and a request the engine cannot run. */
const lines = `//@version=6
strategy("Trend Breakout", overlay = true,
     initial_capital = 100000,
     default_qty_type = strategy.percent_of_equity,
     default_qty_value = 50,
     commission_type = strategy.commission.percent,
     commission_value = 0.1)

length   = input.int(20, "Length", minval = 5, maxval = 200)
mult     = input.float(2.0, "Multiplier", minval = 0.25, maxval = 5.0, step = 0.25)
src      = input.source(close, "Source")
trailing = input.bool(false, "Use trailing stop")
trail    = input.float(3.0, "Trail %", minval = 0.25, maxval = 20.0, step = 0.25, group = "Risk")

basis = ta.sma(src, lenght)
dev   = mult * ta.stdev(src, lenght)
upper = basis + dev
lower = basis - dev
daily = request.security(syminfo.tickerid, "D", close)

longSignal  = ta.crossover(close, upper)
shortSignal = ta.crossunder(close, lower)

if longSignal and close > daily
    strategy.entry("L", strategy.long)
if shortSignal
    strategy.entry("S", strategy.short)
`;
const b10: Diagnostic[] = [
  { kind: 'undeclared', line: 15, column: 21, message: 'Undeclared identifier lenght.' },
  { kind: 'undeclared', line: 16, column: 30, message: 'Undeclared identifier lenght.' },
  {
    kind: 'unsupported',
    line: 19,
    column: 9,
    message: 'request.security() is not supported.',
  },
];

const script = (body: string, version: 5 | 6 = 6) =>
  `//@version=${version}\nindicator("Compile errors")\n${body}\n`;
const diagnostics = (body: string, version: 5 | 6 = 6) =>
  compile(script(body, version)).diagnostics.map(({ kind, line, column, message }) => ({
    kind,
    line,
    column,
    message,
  }));

const input: RunInput = {
  bars: [10, 12, 11].map((close, index) => ({
    time: 1_700_000_000 + index * 3600,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
  })),
  syminfo: { timezone: 'UTC', mintick: 0.01, mincontract: 1 },
  timeframe: '60',
};

test('B10: every independent error in one pass, with the unsupported request beside them', () => {
  const compiled = compile(lines);
  assert.equal(compiled.success, false);
  assert.equal(compiled.program, undefined);
  assert.deepEqual(compiled.diagnostics, b10);
});

test('compile, describe, run, runWithEquity and sweep all report the whole list', () => {
  assert.deepEqual(describe(lines).diagnostics, b10);
  assert.equal(describe(lines).success, false);
  assert.deepEqual(run(lines, input).diagnostics, b10);
  assert.deepEqual(runWithEquity(lines, input).diagnostics, b10);
  const swept = sweep(lines, input, [{ inputs: { Length: 10 } }]);
  assert.deepEqual(swept.compilation, { success: false, diagnostics: b10 });
  assert.deepEqual(swept.runs, []);
});

test('a request alone still compiles and stops the run, as before', () => {
  const source = script('daily = request.security(syminfo.tickerid, "D", close)\nplot(daily)');
  assert.deepEqual(compile(source).diagnostics, []);
  assert.equal(compile(source).success, true);
  assert.equal(describe(source).success, true);
  assert.equal(run(source, input).diagnostics[0].kind, 'unsupported');
});

test('a poisoned value reports its own error once, and nothing that depends on it', () => {
  // `lenght` poisons basis, whatever is computed from it, and the tuple taken from it.
  assert.deepEqual(
    diagnostics(`basis = lenght * 2
upper = basis + 1
[a, b] = basis
float typed = upper * 2
plot(upper > 0 ? a : b)
label.set_text(upper.missing(), "x")
plot(-basis)
upper := "text"`),
    [{ kind: 'undeclared', line: 3, column: 9, message: 'Undeclared identifier lenght.' }],
  );
  // A builtin's result keeps its type: what follows a poisoned argument is checked as usual.
  assert.deepEqual(
    diagnostics('basis = ta.sma(close, lenght)\n[a, b] = basis').map((d) => [d.line, d.message]),
    [
      [3, 'Undeclared identifier lenght.'],
      [4, 'Tuple arity does not match the declaration.'],
    ],
  );
  // A failed declaration still declares its name, poisoned.
  assert.deepEqual(diagnostics('float price = "a"\nplot(price * 2)\nprice := price + 1'), [
    { kind: 'type', line: 3, column: 1, message: 'Cannot assign string to float.' },
  ]);
  // So does a function whose body fails: its calls report nothing more.
  assert.deepEqual(
    diagnostics(`twice(x) =>
    x * missing
plot(twice(close))
plot(twice(open))`),
    [{ kind: 'undeclared', line: 4, column: 9, message: 'Undeclared identifier missing.' }],
  );
  assert.deepEqual(
    diagnostics(`method double(float x) =>
    x * missing
plot(close.double())`),
    [{ kind: 'undeclared', line: 4, column: 9, message: 'Undeclared identifier missing.' }],
  );
});

test('independent errors in one statement and across statements come by line and column', () => {
  assert.deepEqual(diagnostics('plot(foo + bar)\nx = 1\nx := "a"\nif close\n    y = nope'), [
    { kind: 'undeclared', line: 3, column: 6, message: 'Undeclared identifier foo.' },
    { kind: 'undeclared', line: 3, column: 12, message: 'Undeclared identifier bar.' },
    { kind: 'type', line: 5, column: 1, message: 'Cannot assign string to int.' },
    { kind: 'type', line: 6, column: 1, message: 'This condition requires a boolean value.' },
    { kind: 'undeclared', line: 7, column: 9, message: 'Undeclared identifier nope.' },
  ]);
  // A failed check leaves the block under it checked, and what follows it.
  assert.deepEqual(
    diagnostics('if close\n    plot(close)\nz = zz').map((d) => [d.line, d.message]),
    [
      [3, 'This condition requires a boolean value.'],
      [4, 'plot cannot be called in local scope.'],
      [5, 'Undeclared identifier zz.'],
    ],
  );
});

test('script-wide declaration errors no longer hide the errors below them', () => {
  const compiled = compile('//@version=6\nplot(nope)\n');
  assert.deepEqual(
    compiled.diagnostics.map((d) => [d.kind, d.line]),
    [
      ['semantic', 1],
      ['undeclared', 2],
    ],
  );
});

test('a function is checked at each call, but each error in its body is reported once', () => {
  assert.deepEqual(
    diagnostics(`f(x) =>
    x + "a"
f("a")
f(1)
f(2)`).map((d) => [d.kind, d.line, d.message]),
    [['type', 4, 'Arithmetic requires numeric operands.']],
  );
});

test(`at most ${diagnosticLimit} diagnostics, the first ones by line`, () => {
  const body = Array.from({ length: 60 }, (_, index) => `v${index} = missing${index}`).join('\n');
  const found = diagnostics(body);
  assert.equal(found.length, diagnosticLimit);
  assert.deepEqual(found[0], {
    kind: 'undeclared',
    line: 3,
    column: 6,
    message: 'Undeclared identifier missing0.',
  });
  assert.equal(found.at(-1)!.line, 3 + diagnosticLimit - 1);
});

test('the parser still stops at the first syntax error', () => {
  const compiled = compile(script('a = (1 +\nb = nope\nplot(close'));
  assert.equal(compiled.diagnostics.length, 1);
  assert.equal(compiled.diagnostics[0].kind, 'syntax');
});

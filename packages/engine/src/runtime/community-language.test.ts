import assert from 'node:assert/strict';
import test from 'node:test';
import { compile, run } from '../index.ts';

const input = {
  bars: [10, 12, 11, 14].map((close, index) => ({
    time: 1577836800 + index * 3600,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  })),
  syminfo: { timezone: 'America/New_York', mintick: 0.01, pointvalue: 1 },
  timeframe: '60',
};

for (const version of [5, 6] as const) {
  const source = (body: string) =>
    `//@version=${version}\nindicator("Language regression")\n${body}`;
  const execute = (body: string) => {
    const result = run(source(body), input);
    assert.deepEqual(result.diagnostics, []);
    return result;
  };

  test(`v${version}: generic string functions are checked at each call`, () => {
    const result = execute(`append(value) => value + ":1234567"
identity(value) => value
text = identity(append("0000-2359"))
number = identity(3)
plot(str.length(text))
plot(number + 2)
plot(na(time(timeframe.period, text, "UTC")) ? 0 : 1)`);
    assert.deepEqual(
      result.plots.map((p) => p.values),
      [
        [17, 17, 17, 17],
        [5, 5, 5, 5],
        [1, 1, 1, 1],
      ],
    );
    assert.equal(compile(source('append(value) => value + "x"\nappend(1)')).success, false);
    assert.equal(
      compile(source('identity(value) => value\nint x = identity("wrong")')).success,
      false,
    );
    assert.equal(compile(source('n = 1\nf(x) =>\n    n := x\nf(2)')).success, false);
  });

  test(`v${version}: explicit qualifiers constrain bindings, not mutable reference contents`, () => {
    const result = execute(`const int length = 2
simple string tf = timeframe.period
series int index = bar_index
const array<int> values = array.new<int>()
array.push(values, index)
plot(length + array.get(values, 0))
plot(str.length(tf))`);
    assert.deepEqual(
      result.plots.map((p) => p.values),
      [
        [2, 3, 4, 5],
        [2, 2, 2, 2],
      ],
    );
    for (const body of [
      'const int n = bar_index',
      'const int n = 1\nn := 2',
      'simple int n = 1\nn := bar_index',
      'const array<int> a = array.new<int>()\na := array.new<int>()',
    ])
      assert.equal(compile(source(body)).success, false, body);
    execute('const int n = 1\nf(x) =>\n    x + 1\nplot(f(n))');
  });

  test(`v${version}: integer division declarations preserve fractions until an explicit cast`, () => {
    const result = execute(`int minutes = timeframe.in_seconds(timeframe.period) / 61
fraction() =>
    int value = timeframe.in_seconds(timeframe.period) / 61
    value
int localResult = fraction()
int truncated = int(timeframe.in_seconds(timeframe.period) / 61)
int constantQuotient = 5 / 2
plot(minutes)
plot(localResult)
plot(truncated)
plot(constantQuotient)`);
    assert.deepEqual(
      result.plots.map((plot) => plot.values),
      [
        Array(4).fill(3600 / 61),
        Array(4).fill(3600 / 61),
        Array(4).fill(59),
        Array(4).fill(version === 5 ? 2 : 2.5),
      ],
    );
  });

  test(`v${version}: wrapped leading operators preserve precedence and blocks`, () => {
    const result = execute(`selected = false
     or close > 11
value = selected ? 10
     : close == 11 ? 20
     : 30
f() =>
    x = 1
    if selected
        x := 2
    x
plot(value)
plot(f())`);
    assert.deepEqual(
      result.plots.map((p) => p.values),
      [
        [30, 10, 20, 10],
        [1, 2, 1, 2],
      ],
    );
    if (version === 5)
      assert.equal(compile(source('x = false\n    or true\nplot(x ? 1 : 0)')).success, false);
  });

  test(`v${version}: generic method receivers specialize independently, including nested calls`, () => {
    const result = execute(`first(items) => items.get(0)
wrapped(items) => first(items)
numbers = array.from(2, 3)
strings = array.from("abc", "d")
int n = wrapped(numbers)
string s = wrapped(strings)
plot(n)
plot(str.length(s))`);
    assert.deepEqual(
      result.plots.map((p) => p.values),
      [
        [2, 2, 2, 2],
        [3, 3, 3, 3],
      ],
    );
    assert.equal(compile(source('first(x) => x.get(0)\nfirst(1)')).success, false);
  });

  test(`v${version}: user methods do not capture builtin methods on other receiver types`, () => {
    const result = execute(`type Graphic
    line segment
method delete(Graphic graphic) =>
    graphic.segment.delete()
g = Graphic.new(line.new(0, close, 1, close))
g.delete()
string textSize = size.small
plot(str.length(textSize))`);
    assert.deepEqual(result.plots[0].values, [5, 5, 5, 5]);
    assert.deepEqual(result.warnings?.map((w) => w.function).sort(), ['line.delete', 'line.new']);
  });

  test(`v${version}: timestamp strings use UTC by default and explicit offsets`, () => {
    const formats = [
      '2020-01-01',
      '2020-01-01 00:00',
      '2020-01-01T00:00:00Z',
      '2020-01-01 01:00+01:00',
      '31 Dec 2019 19:00 -0500',
      '01 Jan 2020 00:00 GMT+0000',
    ];
    for (const text of formats) {
      const result = execute(
        `start = input.time(timestamp("${text}"))\nplot(start)\nplot(time >= start ? 1 : 0)`,
      );
      assert.deepEqual(
        result.plots.map((p) => p.values),
        [Array(4).fill(1577836800000), [1, 1, 1, 1]],
        text,
      );
    }
  });

  test(`v${version}: na tests drawing ID presence without reading geometry`, () => {
    const result = execute(`var box b = na
var int created = 0
if na(x=b)
    b := box.new(bar_index, high, bar_index + 1, low)
    created += 1
plot(na(b) ? 0 : 1)
plot(created)
if bar_index == 1
    box.delete(b)
    b := na`);
    assert.deepEqual(
      result.plots.map((p) => p.values),
      [
        [1, 1, 1, 1],
        [1, 1, 2, 2],
      ],
    );
    assert.ok(result.warnings?.some((w) => w.function === 'box.new'));
  });

  test(`v${version}: valuewhen preserves integer and boolean sources`, () => {
    const result = execute(`int last = ta.valuewhen(close > 11, bar_index, 0)
bool lastUp = ta.valuewhen(close > 11, close > 13, 0)
plot(last)
plot(lastUp ? 1 : 0)`);
    assert.deepEqual(
      result.plots.map((p) => p.values),
      [
        [null, 1, 1, 3],
        [0, 0, 0, 1],
      ],
    );
  });

  test(`v${version}: request return types preserve tuples and booleans without promising data`, () => {
    const result = compile(
      source(`pair(x) => [x, bar_index]
[p, i] = request.security(syminfo.tickerid, "D", pair(close))
bool up = request.security(syminfo.tickerid, "D", close > open)
int index = i
plot(up ? p : index)`),
    );
    assert.equal(result.success, true, JSON.stringify(result.diagnostics));
    const executed = run(source('plot(request.security(syminfo.tickerid, "D", close))'), input);
    assert.equal(executed.diagnostics[0]?.kind, 'unsupported');
  });

  test(`v${version}: trade accessors expose integer indices and string IDs`, () => {
    const result = run(
      `//@version=${version}\nstrategy("Trade types")
if bar_index == 0
    strategy.entry("L", strategy.long)
int entry = strategy.opentrades.entry_bar_index(0)
int entered = strategy.opentrades.entry_time(0)
string id = strategy.opentrades.entry_id(0)
plot(entry)
plot(entered)
plot(str.length(id))`,
      input,
    );
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.plots[0].values, [null, 1, 1, 1]);
    assert.deepEqual(result.plots[1].values, [null, 1577840400000, 1577840400000, 1577840400000]);
    assert.deepEqual(result.plots[2].values.slice(1), [1, 1, 1]);
  });
}

test('plot line styles do not alter the exported series', () => {
  const result = run(
    `//@version=6\nindicator("Styles")
plot(close, linestyle=plot.linestyle_solid)
plot(close, linestyle=plot.linestyle_dashed)
plot(close, linestyle=plot.linestyle_dotted)`,
    input,
  );
  assert.deepEqual(result.diagnostics, []);
  for (const plot of result.plots) assert.deepEqual(plot.values, [10, 12, 11, 14]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../index.ts';

const input = {
  bars: [10, 12, 11].map((close, index) => ({
    time: 1704067200 + index * 3600,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 10,
  })),
  syminfo: { timezone: 'UTC', mintick: 0.01, pointvalue: 1 },
  timeframe: '60',
};

for (const version of [5, 6]) {
  const execute = (body: string) =>
    run(`//@version=${version}\nindicator("Points")\n${body}`, input);

  test(`v${version}: chart point constructors preserve supplied coordinates and documented defaults`, () => {
    const result = execute(`chart.point current = chart.point.now()
explicit = chart.point.new(price=high, time=time + 1000, index=bar_index + 2)
indexed = chart.point.from_index(bar_index - 1, low)
timed = chart.point.from_time(time=time - 1000, price=open)
emptyPrice = chart.point.now(na)
plot(current.time)
plot(current.index)
plot(current.price)
plot(explicit.time)
plot(explicit.index)
plot(explicit.price)
plot(indexed.time)
plot(indexed.index)
plot(indexed.price)
plot(timed.time)
plot(timed.index)
plot(timed.price)
plot(emptyPrice.price)`);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(
      result.plots.map((plot) => plot.values),
      [
        input.bars.map((bar) => bar.time * 1000),
        [0, 1, 2],
        [10, 12, 11],
        input.bars.map((bar) => bar.time * 1000 + 1000),
        [2, 3, 4],
        [11, 13, 12],
        [null, null, null],
        [-1, 0, 1],
        [8, 10, 9],
        input.bars.map((bar) => bar.time * 1000 - 1000),
        [null, null, null],
        [9, 11, 10],
        [null, null, null],
      ],
    );
  });

  test(`v${version}: point references and copies survive typed containers and functions`, () => {
    const result = execute(`type Holder
    chart.point value
readPrice(chart.point point) => point.price
chart.point original = chart.point.now()
alias = original
copy = original.copy()
original.price := close + 5
copy.index := 42
holder = Holder.new(chart.point.copy(id=copy))
points = matrix.new<chart.point>(1, 1, original)
plot(readPrice(holder.value))
plot(matrix.get(points, 0, 0).price)
plot(alias.price)
plot(original.index)
plot(copy.index)`);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(
      result.plots.map((plot) => plot.values),
      [
        [10, 12, 11],
        [15, 17, 16],
        [15, 17, 16],
        [0, 1, 2],
        [42, 42, 42],
      ],
    );
  });

  test(`v${version}: point overloads and common visual setters only emit execution warnings`, () => {
    const result = execute(`p = chart.point.now(high)
string fontFamily = font.family_monospace
q = chart.point.from_index(bar_index + 1, low)
l = line.new(p, q)
l.set_first_point(chart.point.now(open))
l.set_second_point(q.copy())
l.set_xloc(time, time + 1000, xloc.bar_time)
b = box.new(p, q)
b.set_top_left_point(p)
b.set_bottom_right_point(q)
b.set_text_font_family(font.family_monospace)
b.set_text_wrap(text.wrap_auto)
labelId = label.new(p, "point")
labelId.set_point(q)
labelId.set_textalign(text.align_left)
labelId.set_text_font_family(fontFamily)
labelId.set_xloc(time, xloc.bar_time)
labelId.set_yloc(yloc.price)
t = table.new(position.top_right, 1, 1)
t.cell(0, 0, "value", text_font_family=font.family_default)
t.cell_set_text_font_family(0, 0, font.family_monospace)
plot(close)`);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.plots[0].values, [10, 12, 11]);
    assert.equal(result.warnings?.length, 18);
    assert.ok(result.warnings?.every((warning) => warning.code === 'ignored-effect'));
  });

  test(`v${version}: points reject invalid arguments and fields while drawing geometry stays unreadable`, () => {
    for (const call of [
      'chart.point.new(time, bar_index)',
      'chart.point.from_index(0)',
      'chart.point.from_time()',
      'chart.point.now(1, 2)',
      'chart.point.now(prize=1)',
      'chart.point.new(time=1, index=1.5, price=1)',
      'chart.point.copy(1)',
      'chart.point.now().unknown',
    ]) {
      assert.ok(execute(`p = ${call}\nplot(close)`).diagnostics.length, call);
    }
    for (const field of ['index', 'time'])
      assert.equal(
        execute(`p = chart.point.now()\np.${field} := 1.5\nplot(close)`).diagnostics[0]?.kind,
        'type',
      );
    for (const call of ['labelId.set_text_align(text.align_left)', 'l.set_frist_point(p)']) {
      const result = execute(
        `p = chart.point.now()\nl = line.new(p, p)\nlabelId = label.new(p, "x")\n${call}\nplot(close)`,
      );
      assert.equal(result.diagnostics[0]?.kind, 'undeclared');
      assert.deepEqual(result.warnings, []);
    }
    const geometry = execute('p = chart.point.now()\nl = line.new(p, p)\nplot(line.get_y1(l))');
    assert.equal(geometry.diagnostics[0]?.kind, 'unsupported');
    assert.equal(geometry.warnings?.length, 1);
  });

  test(`v${version}: point mutations roll back during order-fill recalculation`, () => {
    const result = run(
      `//@version=${version}
strategy("Point rollback", calc_on_order_fills=true, margin_long=0, margin_short=0)
var chart.point point = chart.point.now(0)
point.price += 1
if bar_index == 0
    strategy.entry("L", strategy.long)
if bar_index == 1
    strategy.close("L")
plot(point.price)`,
      input,
    );
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.trades.length, 1);
    assert.deepEqual(result.plots[0].values, [1, 2, 3]);
  });
}

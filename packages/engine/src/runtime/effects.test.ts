import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../index.ts';

const input = {
  bars: [10, 12, 11].map((close, index) => ({
    time: 1704067200 + index * 3600,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  })),
  syminfo: { timezone: 'UTC', mintick: 0.01, pointvalue: 1 },
  timeframe: '60',
};

for (const version of [5, 6]) {
  const execute = (body: string) =>
    run(`//@version=${version}\nindicator("Effects")\n${body}`, input);

  test(`v${version}: ignored drawing lifecycle and logging preserve numeric outputs`, () => {
    const result = execute(`var line l = line.new(0, close, 1, close)
line.set_xy2(l, bar_index, close)
line.delete(l)
label.new(bar_index, close, "label")
box.new(bar_index, high, bar_index + 1, low)
var table t = table.new(position.top_right, 1, 1)
table.cell(t, 0, 0, "value")
log.info("info")
log.warning("warning")
log.error("error")
plot(close, "price")`);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.plots[0].values, [10, 12, 11]);
    assert.equal(result.warnings?.length, 10);
    assert.ok(
      result.warnings?.every((warning) => warning.code === 'ignored-effect' && warning.line > 2),
    );
  });

  test(`v${version}: existing no-ops warn once per call site and only when executed`, () => {
    const result = execute(`p = plot(close)
q = plot(open)
fill(p, q)
a = hline(1)
b = hline(2)
fill(a, b)
bgcolor(color.red)
barcolor(color.red)
alertcondition(close > open, "condition")
alert("event")
max_bars_back(close, 5)
if false
    label.new(bar_index, close, "unused")`);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.warnings?.length, 9);
    assert.equal(
      result.warnings?.some((warning) => warning.function === 'label.new'),
      false,
    );
    const next = execute('plot(close)');
    assert.deepEqual(next.warnings, []);
  });

  test(`v${version}: drawing IDs cannot silently affect computed values`, () => {
    for (const expression of [
      'line.get_price(l, bar_index)',
      'l == l ? 1 : 0',
      'str.length(str.tostring(l))',
      'array.includes(array.from(l), l) ? 1 : 0',
      'str.length(str.tostring(value=l))',
      'array.includes(array.new_line(0), value=l) ? 1 : 0',
    ]) {
      const result = execute(`l = line.new(0, close, 1, close)\nplot(${expression})`);
      assert.equal(result.diagnostics[0]?.kind, 'unsupported', expression);
      assert.equal(result.warnings?.length, 1);
    }
    const switched = execute(`l = line.new(0, close, 1, close)
value = switch l
    l => 1
    => 0
plot(value)`);
    assert.equal(switched.diagnostics[0]?.kind, 'unsupported');
  });

  test(`v${version}: drawing IDs can pass through lifecycle collections and copies`, () => {
    const result = execute(`var lines = array.new_line()
array.push(lines, line.new(0, close, 1, close))
line.delete(array.shift(lines))
l = line.new(0, close, 1, close)
b = line.copy(l)
b.set_color(color.red)
label.new(bar_index, close, "label", style=label.style_label_down)
plot(close)`);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.plots[0].values, [10, 12, 11]);
  });

  test(`v${version}: ignoring an effect does not skip argument errors`, () => {
    const result = execute(`values = array.new<float>(0)
label.new(bar_index, array.get(values, 0), "bad")
plot(close)`);
    assert.ok(result.diagnostics.length);
    assert.equal(result.plots.length, 0);
    assert.deepEqual(result.warnings, []);
  });

  test(`v${version}: matrices preserve opaque drawing IDs for lifecycle calls`, () => {
    const result = execute(`l = line.new(0, close, 1, close)
m = matrix.new<line>(2, 2, l)
matrix.set(m, 1, 1, line.copy(l))
matrix.fill(m, l, 0, 1, 0, 2)
line.delete(matrix.get(m, 0, 0))
line.delete(matrix.row(m, 1).get(1))
line.delete(matrix.col(m, 0).get(1))
line.delete(matrix.get(matrix.copy(m), 0, 1))
line.delete(matrix.get(matrix.transpose(m), 1, 0))
plot(matrix.rows(m) + matrix.columns(m))`);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.plots[0].values, [4, 4, 4]);
    assert.equal(result.warnings?.length, 7);
    for (const operation of [
      'matrix.avg(m)',
      'matrix.det(m)',
      'line.get_price(matrix.get(m, 0, 0), bar_index)',
      'array.includes(matrix.row(m, 0), l) ? 1 : 0',
    ]) {
      const failure = execute(
        `l = line.new(0, close, 1, close)\nm = matrix.new<line>(1, 1, l)\n${operation}\nplot(close)`,
      );
      assert.equal(failure.diagnostics[0]?.kind, 'unsupported', operation);
    }
  });

  test(`v${version}: named matrix storage arguments retain drawing IDs and target the requested cells`, () => {
    const result = execute(`l = line.new(0, close, 1, close)
m = matrix.new<line>(rows=1, columns=2, initial_value=l)
matrix.set(id=m, row=0, column=1, value=l.copy())
m.fill(value=l, from_column=0, to_column=1)
line.delete(matrix.get(id=m, row=0, column=1))
line.delete(m.col(column=0).get(0))
line.delete(matrix.row(id=m, row=0).get(1))
plot(matrix.rows(id=m) + matrix.columns(id=m))
numbers = matrix.new<int>(rows=2, columns=2, initial_value=0)
matrix.fill(id=numbers, value=7, from_row=1, to_row=2, from_column=0, to_column=1)
plot(matrix.get(id=numbers, row=1, column=0))
plot(numbers.get(row=0, column=0))`);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(
      result.plots.map((plot) => plot.values),
      [
        [3, 3, 3],
        [7, 7, 7],
        [0, 0, 0],
      ],
    );
    assert.equal(result.warnings?.length, 5);
    const failure = execute(`l = line.new(0, close, 1, close)
m = matrix.new<line>(rows=1, columns=1, initial_value=l)
matrix.fill(id=m, value=l, to_column=2)
plot(close)`);
    assert.equal(failure.diagnostics[0]?.kind, 'runtime');
    assert.match(failure.diagnostics[0]?.message, /outside its bounds/);
  });

  test(`v${version}: box, table, and linefill lifecycle calls warn and preserve computed outputs`, () => {
    const result = execute(`var boxes = array.new_box()
array.push(boxes, box.new(bar_index, high, bar_index + 1, low))
b = boxes.get(0).copy()
b.set_lefttop(bar_index, high)
b.set_rightbottom(bar_index + 2, low)
b.set_bgcolor(color.red)
b.set_border_style(line.style_dashed)
b.set_text("range")
b.set_text_halign(text.align_left)
box.delete(array.shift(boxes))
box.delete(b)
var table t = table.new(position.top_right, 2, 2)
t.set_position(position.bottom_right)
t.set_frame_color(color.blue)
t.set_border_width(2)
t.cell(0, 0, "price")
t.cell_set_text(0, 0, str.tostring(close))
t.cell_set_width(0, 0, 10)
t.cell_set_height(0, 0, 5)
t.cell_set_tooltip(0, 0, "close")
t.cell_set_text_valign(0, 0, text.align_top)
t.merge_cells(0, 1, 1, 1)
t.clear(0, 0, 1, 1)
table.delete(t)
first = line.new(bar_index, high, bar_index + 1, high)
second = line.new(bar_index, low, bar_index + 1, low)
band = linefill.new(first, second, color.blue)
band.set_color(color.red)
linefill.delete(band)
plot(ta.sma(close, 2), "average")`);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.plots[0].values, [null, 11, 11.5]);
    assert.ok(result.warnings);
    assert.equal(result.warnings.length, 28);
    assert.equal(
      result.warnings.filter((warning) => warning.function === 'table.merge_cells').length,
      1,
    );
    assert.ok(result.warnings.every((warning) => warning.code === 'ignored-effect'));
  });

  test(`v${version}: unknown drawing setter spellings fail compilation`, () => {
    for (const call of [
      'box.set_bogus(b, 1)',
      'b.set_colour(color.red)',
      'table.merge_cell(t, 0, 0, 1, 1)',
    ]) {
      const result = execute(
        `b = box.new(0, high, 1, low)\nt = table.new(position.top_right, 2, 2)\n${call}\nplot(close)`,
      );
      assert.equal(result.diagnostics[0]?.kind, 'undeclared', call);
      assert.deepEqual(result.warnings, []);
    }
  });
}

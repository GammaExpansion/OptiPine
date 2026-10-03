import assert from 'node:assert/strict';
import test from 'node:test';
import { run, runWithEquity, sweep } from './index.ts';
import { plotColor } from './runtime/plot-style.ts';

const input = {
  bars: [1, 2, 3, 4].map((close, i) => ({
    time: 1704067200 + i * 3600,
    open: 2,
    high: 5,
    low: 0,
    close,
    volume: 10,
  })),
  syminfo: {},
  timeframe: '60',
};
function plots(body: string, version = 6) {
  const result = run(`//@version=${version}\nindicator("Styles")\n${body}`, input);
  assert.deepEqual(result.diagnostics, []);
  return result.plots;
}

test('constant colours, width, aliases, inputs, transparency and hex alpha stay scalar', () => {
  const result = plots(`c = input.color(color.gray, "Colour")
plot(close, "Named", color = c, linewidth = 3, style = plot.style_stepline)
plot(close, "Positional", color.new(color.teal, 50), 2, plot.style_histogram)
plot(close, color = #AABBCC44)
plot(close, color = color.rgb(10, 20, 30, 100))
plot(close, color = na)
plot(close, color = color.new(color.red, 25.5))`);
  assert.deepEqual(
    result.map((p) => p.style),
    [
      { kind: 'plot', color: '#787b86', linewidth: 3, style: 'stepline' },
      { kind: 'plot', color: '#08998180', linewidth: 2, style: 'histogram' },
      { kind: 'plot', color: '#aabbcc44' },
      { kind: 'plot', color: '#0a141e00' },
      { kind: 'plot', color: null },
      { kind: 'plot', color: '#f23645be' },
    ],
  );
  assert.ok(result.every((p) => !Object.hasOwn(p, 'colors')));
  assert.equal(plots('plot(close, color = color.red)', 5)[0].style?.color, '#ff5252');
  assert.equal(plots('plot(close, color = color.new(na, 50))')[0].style?.color, null);
  assert.equal(
    plots('plot(close, color = color.rgb(red = 10, green = 20, blue = 30, transp = 50))')[0].style
      ?.color,
    '#0a141e80',
  );
  assert.equal(
    plots('plot(close, color = color.new(color = color.blue, transp = 50))')[0].style?.color,
    '#2962ff80',
  );
});

test('series colours align with all bars, including na, even when this history is one colour', () => {
  const result = plots(`c = close > 2 ? color.new(color.green, 50) : color.red
plot(close, color = c)
plot(close, color = close > 2 ? na : color.blue)
plot(close, color = close > 0 ? color.green : color.red)`);
  assert.deepEqual(result[0].colors, ['#f23645', '#f23645', '#4caf5080', '#4caf5080']);
  assert.deepEqual(result[1].colors, ['#2962ff', '#2962ff', null, null]);
  assert.deepEqual(result[2].colors, Array(4).fill('#4caf50'));
  assert.ok(result.every((p) => !Object.hasOwn(p.style!, 'color')));
  assert.deepEqual(structuredClone(result), result);
});

test('all supported line styles and every shape/location retain declaration spelling', () => {
  const lines = [
    'line',
    'linebr',
    'stepline',
    'steplinebr',
    'area',
    'areabr',
    'histogram',
    'columns',
    'circles',
    'cross',
  ];
  assert.deepEqual(
    plots(lines.map((s) => `plot(close, style = plot.style_${s})`).join('\n')).map(
      (p) => p.style?.style,
    ),
    lines,
  );
  for (const shape of [
    'triangleup',
    'triangledown',
    'arrowup',
    'arrowdown',
    'circle',
    'square',
    'diamond',
    'cross',
    'xcross',
    'flag',
    'labelup',
    'labeldown',
  ]) {
    for (const location of ['abovebar', 'belowbar', 'absolute', 'top', 'bottom']) {
      const [plot] = plots(
        `plotshape(close, style = shape.${shape}, location = location.${location}, color = color.lime, text = "Signal", size = size.tiny)`,
      );
      assert.deepEqual(plot.style, {
        kind: 'shape',
        style: shape,
        location,
        color: '#00e676',
        text: 'Signal',
        size: 'tiny',
      });
      assert.deepEqual(plot.values, [1, 2, 3, 4]);
    }
  }
});

test('characters, positional shape arguments and sizes are resolved without inventing defaults', () => {
  const [shape, char, omitted, dynamic] =
    plots(`plotshape(close > 2, "S", shape.diamond, location.belowbar, color.blue, 0, "Go", color.white, true, size.large)
plotchar(close, "C", "★", location.absolute, color.red, size = size.small)
plotchar(close > 2)
plotshape(close > 2, style = close > 2 ? shape.circle : shape.square, text = str.tostring(close))`);
  assert.deepEqual(shape.style, {
    kind: 'shape',
    style: 'diamond',
    location: 'belowbar',
    color: '#2962ff',
    text: 'Go',
    size: 'large',
  });
  assert.deepEqual(char.style, {
    kind: 'char',
    char: '★',
    location: 'absolute',
    color: '#f23645',
    size: 'small',
  });
  assert.deepEqual(omitted.style, { kind: 'char' });
  assert.deepEqual(dynamic.style, { kind: 'shape' });
  for (const size of ['auto', 'tiny', 'small', 'normal', 'large', 'huge'])
    assert.equal(plots(`plotchar(true, char = "x", size = size.${size})`)[0].style?.size, size);
});

test('metadata survives equity, sweep and fill recalculation without changing plot values', () => {
  const source = `//@version=6
strategy("S", calc_on_order_fills = true)
if bar_index == 0
    strategy.entry("L", strategy.long)
plot(close, color = strategy.position_size > 0 ? color.green : na)`;
  const plain = run(source, input);
  assert.deepEqual(plain.diagnostics, []);
  assert.deepEqual(runWithEquity(source, input).plots, plain.plots);
  assert.deepEqual(sweep(source, input, [{}]).runs[0].result.plots, plain.plots);
  assert.deepEqual(plain.plots[0].values, [1, 2, 3, 4]);
  assert.deepEqual(plain.plots[0].colors, [null, '#4caf50', '#4caf50', '#4caf50']);
});

test('unknown colour representations are omitted, while na and transparency are explicit', () => {
  assert.equal(plotColor('red'), undefined);
  assert.equal(plotColor({}), undefined);
  assert.equal(plotColor({ __color: true, rgb: NaN, transparency: 0 }), null);
  assert.equal(plotColor({ __color: true, rgb: 0, transparency: Infinity }), undefined);
  const [unknown] = plots('plot(close, color = close > 2 ? "unknown" : color.red)');
  assert.equal(unknown.colors, undefined);
});

test('shape and character colour arrays retain na and constant transparency', () => {
  const result = plots(`plotshape(close > 2, color = close > 3 ? na : color.new(color.lime, 50))
plotchar(close > 2, char = "★", color = close > 2 ? color.red : na)`);
  assert.deepEqual(result[0].colors, ['#00e67680', '#00e67680', '#00e67680', null]);
  assert.deepEqual(result[1].colors, [null, null, '#f23645', '#f23645']);
  assert.equal(result[1].style?.char, '★');
});

test('conditional reassignment and captured aliases cannot masquerade as constant styles', () => {
  const result = plots(`c = color.green
s = shape.circle
if close > 2
    c := color.red
    s := shape.square
alias = c
getColor() => alias
plot(close, color = getColor())
plotshape(true, style = s)
d = color.blue
if close > 0
    d := color.red
plot(close, color = d)`);
  assert.deepEqual(result[0].colors, ['#4caf50', '#4caf50', '#f23645', '#f23645']);
  assert.equal(result[0].style?.color, undefined);
  assert.deepEqual(result[1].style, { kind: 'shape' });
  assert.deepEqual(result[2].colors, Array(4).fill('#f23645'));
});

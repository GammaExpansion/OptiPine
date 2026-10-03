import assert from 'node:assert/strict';
import test from 'node:test';
import { Broker } from './broker.ts';

for (const side of [1, -1] as const) {
  const price = (value: number) => (side === 1 ? value : 200 - value);
  const bar = (index: number, open: number, high: number, low: number, close: number) => ({
    time: index * 3600,
    open: price(open),
    high: price(side === 1 ? high : low),
    low: price(side === 1 ? low : high),
    close: price(close),
    volume: 1,
  });
  const broker = () => {
    const value = new Broker(
      { bars: [], timeframe: '60', syminfo: { mintick: 0.01, mincontract: 1 } },
      6,
    );
    value.configure({ initial_capital: 10000, margin_long: 0, margin_short: 0 });
    return value;
  };

  test(`${side}: na offset fills at activation exactly like zero, without observing future extrema`, () => {
    const outputs = [NaN, 0].map((offset) => {
      const b = broker();
      b.beginBar(0, bar(0, 100, 101, 99, 100));
      b.call('entry', ['entry', side], { qty: 1 });
      b.call('exit', ['exit', 'entry'], { trail_price: price(105.15), trail_offset: offset });
      b.endBar();
      b.beginBar(1, bar(1, 100, 120, 99, 110));
      b.endBar();
      return b.result().trades;
    });
    assert.deepEqual(outputs[0], outputs[1]);
    assert.equal(outputs[0].length, 1);
    assert.equal(outputs[0][0].exitBar, 1);
    assert.ok(Math.abs(outputs[0][0].exitPrice! - price(105.15)) < 1e-10);
    assert.ok(Math.abs(outputs[0][0].maxRunup - 5.15) < 1e-10);
  });

  test(`${side}: na offset waits for activation, rather than issuing a market close`, () => {
    const b = broker();
    b.beginBar(0, bar(0, 100, 101, 99, 100));
    b.call('entry', ['entry', side], { qty: 1 });
    b.call('exit', ['exit', 'entry'], { trail_points: 500, trail_offset: NaN });
    b.endBar();
    b.beginBar(1, bar(1, 100, 104, 99, 103));
    b.endBar();
    assert.equal(b.result().trades[0].exitBar, null);
    b.beginBar(2, bar(2, 108, 110, 107, 109));
    b.endBar();
    assert.equal(b.result().trades[0].exitPrice, price(108));
  });

  test(`${side}: na trailing fields leave an independent fixed stop intact`, () => {
    const b = broker();
    b.beginBar(0, bar(0, 100, 101, 99, 100));
    b.call('entry', ['entry', side], { qty: 1 });
    b.call('exit', ['exit', 'entry'], { stop: price(95), trail_points: NaN, trail_offset: NaN });
    b.endBar();
    b.beginBar(1, bar(1, 100, 101, 96, 97));
    b.endBar();
    assert.equal(b.result().trades[0].exitBar, null);
    b.beginBar(2, bar(2, 97, 98, 94, 96));
    b.endBar();
    assert.equal(b.result().trades[0].exitPrice, price(95));
  });

  test(`${side}: changing an active offset to na preserves activation across a gap`, () => {
    const b = broker();
    b.beginBar(0, bar(0, 100, 101, 99, 100));
    b.call('entry', ['entry', side], { qty: 1 });
    b.call('exit', ['exit', 'entry'], { trail_price: price(115), trail_offset: 1000 });
    b.endBar();
    b.beginBar(1, bar(1, 100, 120, 99, 116));
    b.call('exit', ['exit', 'entry'], { trail_price: price(115), trail_offset: NaN });
    b.endBar();
    b.beginBar(2, bar(2, 114, 114, 113, 114));
    b.endBar();
    assert.equal(b.result().trades[0].exitPrice, price(114));
  });

  test(`${side}: changing na to a finite offset before activation uses the new distance`, () => {
    const b = broker();
    b.beginBar(0, bar(0, 100, 101, 99, 100));
    b.call('entry', ['entry', side], { qty: 1 });
    b.call('exit', ['exit', 'entry'], { trail_price: price(105), trail_offset: NaN });
    b.endBar();
    b.beginBar(1, bar(1, 100, 104, 99, 103));
    b.call('exit', ['exit', 'entry'], { trail_price: price(105), trail_offset: 500 });
    b.endBar();
    b.beginBar(2, bar(2, 106, 110, 105, 108));
    b.endBar();
    assert.equal(b.result().trades[0].exitPrice, null);
    b.beginBar(3, bar(3, 108, 109, 104, 106));
    b.endBar();
    assert.equal(b.result().trades[0].exitPrice, price(105));
  });
}

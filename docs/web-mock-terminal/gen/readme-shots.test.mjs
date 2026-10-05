import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { optimizePng, readmeImages, unfilterPngRows } from './readme-shots.mjs';

test('reverses all PNG row filters, including row boundaries and wrapped byte differences', () => {
  const expected = Buffer.from([0, 10, 20, 30, 40, 50, 60, 0, 15, 25, 35, 45, 55, 65]);
  const encoded = [
    [0, 10, 20, 30, 40, 50, 60, 0, 15, 25, 35, 45, 55, 65],
    [1, 10, 20, 30, 30, 30, 30, 1, 15, 25, 35, 30, 30, 30],
    [2, 10, 20, 30, 40, 50, 60, 2, 5, 5, 5, 5, 5, 5],
    [3, 10, 20, 30, 35, 40, 45, 3, 10, 15, 20, 18, 18, 18],
    [4, 10, 20, 30, 30, 30, 30, 4, 5, 5, 5, 5, 5, 5],
  ];
  for (const rows of encoded)
    assert.deepEqual(unfilterPngRows(Buffer.from(rows), 2, 2, 3), expected);
  assert.deepEqual(
    unfilterPngRows(Buffer.from([1, 250, 20, 30, 255, 11, 236, 236, 128]), 2, 1, 4),
    Buffer.from([0, 250, 20, 30, 255, 5, 0, 10, 127]),
  );
  assert.throws(() => unfilterPngRows(Buffer.from([5, 0, 0, 0]), 1, 1, 3), /filter/);
  assert.throws(() => unfilterPngRows(Buffer.alloc(3), 1, 1, 3), /length/);
});

test('README screenshots are exactly B1, R1 and W2 in each language', () => {
  assert.deepEqual(
    readmeImages.map(([board, name]) => [board, name]),
    [
      ['Main-en', 'backtest.png'],
      ['R1-en', 'optimize.png'],
      ['W2-en', 'walk-forward.png'],
      ['Main', 'backtest-zh.png'],
      ['R1', 'optimize-zh.png'],
      ['W2', 'walk-forward-zh.png'],
    ],
  );
  const directory = new URL('../../screenshots/', import.meta.url);
  assert.deepEqual(
    readdirSync(directory)
      .filter((name) => name.endsWith('.png'))
      .sort(),
    readmeImages.map(([, name]) => name).sort(),
  );
  let total = 0;
  for (const [board, name, width, height] of readmeImages) {
    const html = readFileSync(new URL(`../artboards/${board}.dc.html`, import.meta.url), 'utf8');
    assert(html.includes('width: 1440px'));
    const png = readFileSync(new URL(name, directory));
    optimizePng(png, width, height);
    assert(png.length < 400_000, name);
    total += png.length;
  }
  assert(total < 1_200_000);
  for (const [file, suffix] of [
    ['README.md', ''],
    ['README.zh-CN.md', '-zh'],
  ]) {
    const source = readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');
    const screenshots = [...source.matchAll(/!\[[^\]]*\]\((docs\/screenshots\/[^)]+)\)/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(
      screenshots,
      ['backtest', 'optimize', 'walk-forward'].map(
        (name) => `docs/screenshots/${name}${suffix}.png`,
      ),
    );
  }
});

function chunk(type, data) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}

function fixture() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(64);
  header.writeUInt32BE(32, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc((64 * 3 + 1) * 32, 42);
  for (let row = 0; row < 32; row++) pixels[row * (64 * 3 + 1)] = 0;
  const compressed = deflateSync(pixels, { level: 0 });
  const metadata = chunk('tEXt', Buffer.from('Title\0Lossless test'));
  return {
    pixels,
    metadata,
    png: Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      metadata,
      chunk('IDAT', compressed.subarray(0, 20)),
      chunk('IDAT', compressed.subarray(20)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  };
}

test('PNG optimization reduces size without changing pixels, dimensions or metadata', () => {
  const { png, pixels, metadata } = fixture();
  const optimized = optimizePng(png, 64, 32);
  assert(optimized.length < png.length);
  assert(optimized.includes(metadata));
  assert.equal(optimized.readUInt32BE(16), 64);
  assert.equal(optimized.readUInt32BE(20), 32);
  const start = optimized.indexOf(Buffer.from('IDAT'));
  const size = optimized.readUInt32BE(start - 4);
  assert.deepEqual(inflateSync(optimized.subarray(start + 4, start + 4 + size)), pixels);
  assert.deepEqual(optimizePng(optimized, 64, 32), optimized);
});

test('missing, truncated, corrupt or incorrectly sized screenshots fail validation', () => {
  const { png } = fixture();
  assert.throws(() => optimizePng(Buffer.from('not a PNG'), 64, 32), /PNG/);
  assert.throws(() => optimizePng(png.subarray(0, -1), 64, 32), /Truncated/);
  assert.throws(() => optimizePng(png, 1440, 900), /width/);
  assert.throws(() => optimizePng(png, 64, 900), /height/);
  const corrupt = Buffer.from(png);
  corrupt[29] ^= 1;
  assert.throws(() => optimizePng(corrupt, 64, 32));
});

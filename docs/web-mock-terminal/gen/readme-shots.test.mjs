import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { optimizePng } from './readme-shots.mjs';

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

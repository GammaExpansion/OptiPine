import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

export const readmeImages = [
  ['Main-en', 'backtest.png', 1440, 900],
  ['R1-en', 'optimize.png', 1440, 900],
  ['W2-en', 'walk-forward.png', 1440, 900],
  ['Main', 'backtest-zh.png', 1440, 900],
  ['R1', 'optimize-zh.png', 1440, 900],
  ['W2', 'walk-forward-zh.png', 1440, 900],
];
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Reverse PNG's row filters to expose repeated UI colours to the compressor without pixel changes. */
export function unfilterPngRows(rows, width, height, channels) {
  const stride = width * channels + 1;
  assert.equal(rows.length, stride * height, 'Unexpected PNG pixel data length');
  const result = Buffer.from(rows);
  for (let y = 0; y < height; y++) {
    const start = y * stride;
    const filter = rows[start];
    assert(filter <= 4, 'Unknown PNG filter');
    result[start] = 0;
    for (let x = 1; x < stride; x++) {
      const i = start + x;
      const left = x > channels ? result[i - channels] : 0;
      const up = y > 0 ? result[i - stride] : 0;
      const corner = y > 0 && x > channels ? result[i - stride - channels] : 0;
      let prediction = 0;
      if (filter === 1) prediction = left;
      else if (filter === 2) prediction = up;
      else if (filter === 3) prediction = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - corner;
        const a = Math.abs(p - left);
        const b = Math.abs(p - up);
        const c = Math.abs(p - corner);
        prediction = a <= b && a <= c ? left : b <= c ? up : corner;
      }
      result[i] = (rows[i] + prediction) & 255;
    }
  }
  return result;
}

/** Recompress PNG's lossless pixel stream; retain colour metadata and exact pixels. */
export function optimizePng(png, width, height) {
  assert(png.subarray(0, 8).equals(signature), 'The renderer must produce a PNG');
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    assert(offset + 12 <= png.length, 'Truncated PNG chunk');
    const length = png.readUInt32BE(offset);
    const end = offset + length + 12;
    assert(end <= png.length, 'Truncated PNG data');
    const chunk = png.subarray(offset, end);
    assert.equal(crc32(chunk.subarray(4, -4)), chunk.readUInt32BE(chunk.length - 4));
    chunks.push({ type: chunk.toString('ascii', 4, 8), chunk });
    offset = end;
  }
  assert.equal(chunks[0]?.type, 'IHDR');
  assert.equal(chunks.at(-1)?.type, 'IEND');
  assert.equal(chunks[0].chunk.readUInt32BE(8), width, 'Unexpected screenshot width');
  assert.equal(chunks[0].chunk.readUInt32BE(12), height, 'Unexpected screenshot height');
  const data = chunks.filter(({ type }) => type === 'IDAT');
  assert(data.length > 0, 'PNG has no pixel data');
  const pixels = inflateSync(Buffer.concat(data.map(({ chunk }) => chunk.subarray(8, -4))));
  let compressed = deflateSync(pixels, { level: 9 });
  const header = chunks[0].chunk;
  // Chrome writes non-interlaced 8-bit RGB or RGBA. Flat UI areas often compress better without
  // row filters; keep the original stream whenever it is smaller or uses another PNG format.
  if (header[16] === 8 && [2, 6].includes(header[17]) && header[20] === 0) {
    const unfiltered = unfilterPngRows(pixels, width, height, header[17] === 2 ? 3 : 4);
    const candidate = deflateSync(unfiltered, { level: 9 });
    if (candidate.length < compressed.length) compressed = candidate;
  }
  const idat = Buffer.alloc(compressed.length + 12);
  idat.writeUInt32BE(compressed.length);
  idat.write('IDAT', 4, 'ascii');
  compressed.copy(idat, 8);
  idat.writeUInt32BE(crc32(idat.subarray(4, -4)), idat.length - 4);
  const optimized = Buffer.concat([
    signature,
    ...chunks.flatMap((entry) =>
      entry.type !== 'IDAT' ? [entry.chunk] : entry === data[0] ? [idat] : [],
    ),
  ]);
  return optimized.length < png.length ? optimized : png;
}

/** Render B1, R1 and W2 in both languages; validate every output before replacing any image. */
export async function renderReadmeShots() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'optipine-readme-mock-'));
  const output = new URL('../../screenshots/', import.meta.url);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL('./shot.mjs', import.meta.url)),
          ...readmeImages.map(([board]) => board),
        ],
        {
          stdio: 'inherit',
          // Use the plain boards at their native sizes, regardless of canvas/crop settings.
          env: { ...process.env, SHOTS: temporary, SCALE: '1', RUNTIME: '', SHOT_PORT: '0' },
        },
      );
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`Mock renderer exited with ${code}`)),
      );
    });
    const rendered = await Promise.all(
      readmeImages.map(async ([board, name, width, height]) => {
        const png = await readFile(path.join(temporary, `${board}.png`));
        const optimized = optimizePng(png, width, height);
        assert(optimized.length < 400_000, `${name} exceeds 400 KB`);
        return { name, png: optimized };
      }),
    );
    const total = rendered.reduce((sum, { png }) => sum + png.length, 0);
    assert(total < 1_200_000, 'README images exceed 1.2 MB');
    await mkdir(output, { recursive: true });
    for (const { name, png } of rendered) {
      await writeFile(new URL(name, output), png);
      console.log(`${name}: ${png.length.toLocaleString('en-US')} bytes`);
    }
    console.log(`Total: ${total.toLocaleString('en-US')} bytes`);
  } finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 5 });
  }
}

if (import.meta.main) await renderReadmeShots();

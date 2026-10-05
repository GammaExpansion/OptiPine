import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const images = [
  ['Main-en', 'backtest.png', 1440, 900],
  ['B5-en', 'equity.png', 1440, 900],
  ['R1-en', 'optimize.png', 1440, 900],
  ['W1-en', 'walk-forward.png', 1440, 900],
  ['Main', 'backtest-zh.png', 1440, 900],
];
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Recompress only PNG's lossless pixel stream; retain filters, colour metadata and exact pixels. */
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
  const compressed = deflateSync(pixels, { level: 9 });
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

/** Render the five README boards in isolation; validate every output before replacing any image. */
export async function renderReadmeShots() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'optipine-readme-mock-'));
  const output = new URL('../../screenshots/', import.meta.url);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL('./shot.mjs', import.meta.url)), ...images.map(([board]) => board)],
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
      images.map(async ([board, name, width, height]) => {
        const png = await readFile(path.join(temporary, `${board}.png`));
        const optimized = optimizePng(png, width, height);
        assert(optimized.length < 400_000, `${name} exceeds 400 KB`);
        return { name, png: optimized };
      }),
    );
    const total = rendered.reduce((sum, { png }) => sum + png.length, 0);
    assert(total < 1_250_000, 'README images exceed 1.25 MB');
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

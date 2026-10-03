import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = new URL('../', import.meta.url);
const compilation = spawnSync(
  process.execPath,
  [fileURLToPath(import.meta.resolve('typescript/bin/tsc')), '-p', 'tsconfig.build.json'],
  { cwd: fileURLToPath(packageRoot), stdio: 'inherit' },
);
if (compilation.error) throw compilation.error;
if (compilation.status !== 0) process.exit(compilation.status ?? 1);

const { COMPARISON_RULES } = await import('../dist/compare.js');
const modules = [
  'load',
  'csv',
  'calendar',
  'compare',
  'report',
  'report-layout',
  'report-number',
  'run',
  'baseline',
  'fingerprint',
];
const sources = modules.map((name) => [name, new URL(`dist/${name}.js`, packageRoot)]);
sources.push([
  '@pine/engine/report-number',
  new URL(import.meta.resolve('@pine/engine/report-number')),
]);
sources.push([
  '@pine/engine/trade-profit',
  new URL(import.meta.resolve('@pine/engine/trade-profit')),
]);
const hash = createHash('sha256').update(COMPARISON_RULES);
for (const [name, url] of sources) {
  const source = (await readFile(url, 'utf8')).replaceAll('\r\n', '\n');
  hash.update(`\0${name}\0`).update(source);
}
await writeFile(
  new URL('dist/comparison-fingerprint.json', packageRoot),
  `${JSON.stringify({ schemaVersion: 1, fingerprint: hash.digest('hex') }, null, 2)}\n`,
);

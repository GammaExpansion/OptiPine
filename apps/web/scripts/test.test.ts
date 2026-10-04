import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runSuites } from './test.ts';

for (const codes of [
  [0, 0],
  [7, 0],
  [0, 9],
  [7, 9],
]) {
  test(`runs both suites with exit codes ${codes} and retains the first failure`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'optipine-suites-'));
    try {
      const marker = join(directory, 'ran');
      const status = runSuites(
        codes.map((code, index) => [
          '-e',
          `require('node:fs').appendFileSync(process.argv[1], '${index}'); process.exit(${code});`,
          marker,
        ]),
      );
      assert.equal(readFileSync(marker, 'utf8'), '01');
      assert.equal(status, codes.find((code) => code !== 0) ?? 0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

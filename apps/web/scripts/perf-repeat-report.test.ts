import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('repeat report preserves observations, counts empty runs as zero, and rejects invalid runs', () => {
  const root = mkdtempSync(join(tmpdir(), 'pine-perf-repeat-'));
  const script = fileURLToPath(new URL('./perf-repeat-report.ts', import.meta.url));
  const directories = [0, 1, 2].map((index) => join(root, String(index)));
  const reports = [null, 80, 200].map((max, index) => ({
    reports: [
      {
        name: 'scenario',
        tasks: { max, count: index },
        frames: { over50: index * 3 },
        errors: [] as string[],
        interactionErrors: [] as string[],
      },
    ],
  }));
  try {
    directories.forEach((directory, index) => {
      mkdirSync(directory);
      writeFileSync(join(directory, 'report.json'), JSON.stringify(reports[index]));
    });
    const result = JSON.parse(
      execFileSync(process.execPath, [script, ...directories], { encoding: 'utf8' }),
    );
    assert.deepEqual(result.scenario, {
      longTaskMaxMs: { values: [0, 80, 200], median: 80, max: 200 },
      longTaskCount: { values: [0, 1, 2], median: 1, max: 2 },
      framesOver50: { values: [0, 3, 6], median: 3, max: 6 },
    });
    reports[0].reports[0].interactionErrors.push('blocked');
    writeFileSync(join(directories[0], 'report.json'), JSON.stringify(reports[0]));
    assert.throws(
      () => execFileSync(process.execPath, [script, ...directories], { stdio: 'pipe' }),
      /Invalid repetition/,
    );
    reports[0].reports = [];
    writeFileSync(join(directories[0], 'report.json'), JSON.stringify(reports[0]));
    assert.throws(
      () => execFileSync(process.execPath, [script, ...directories], { stdio: 'pipe' }),
      /Missing repetition/,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

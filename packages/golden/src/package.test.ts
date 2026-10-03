import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defaultFixtureRoot } from './resources.ts';
import { readComparisonFingerprint } from './fingerprint.ts';

test('built golden runs without TypeScript sources from an unrelated working directory', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'pine-golden-package-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const packageRoot = new URL('../', import.meta.url);
  const isolated = join(temporary, 'golden');
  const caseKey = 'parse/v6/P_err_assign_type_change';
  await mkdir(isolated);
  await Promise.all([
    cp(new URL('dist/', packageRoot), join(isolated, 'dist'), { recursive: true }),
    cp(new URL('package.json', packageRoot), join(isolated, 'package.json')),
    cp(join(defaultFixtureRoot, caseKey), join(isolated, 'fixtures', caseKey), {
      recursive: true,
    }),
    symlink(
      fileURLToPath(new URL('../../node_modules/', packageRoot)),
      join(temporary, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    ),
  ]);
  const entry = pathToFileURL(join(isolated, 'dist', 'index.js')).href;
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const { runSuite, defaultFixtureRoot, defaultBaselinePath } = await import(${JSON.stringify(entry)});
       console.log(JSON.stringify({ result: await runSuite(defaultFixtureRoot), defaultFixtureRoot, defaultBaselinePath }));`,
    ],
    { cwd: temporary, encoding: 'utf8' },
  );
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  const { result, defaultFixtureRoot: fixtureRoot, defaultBaselinePath } = JSON.parse(child.stdout);
  assert.equal(result.cases.length, 1);
  assert.equal(result.cases[0].key, caseKey);
  assert.equal(result.cases[0].status, 'match');
  assert.equal(defaultBaselinePath, join(isolated, 'fixtures', 'golden-baseline.json'));
  assert.equal(resolve(fixtureRoot), join(isolated, 'fixtures'));
  const asset = JSON.parse(
    await readFile(join(isolated, 'dist', 'comparison-fingerprint.json'), 'utf8'),
  );
  assert.equal(result.comparisonFingerprint, asset.fingerprint);
  assert.equal(result.comparisonFingerprint, await readComparisonFingerprint());
});

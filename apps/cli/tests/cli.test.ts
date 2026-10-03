import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { defaultFixtureRoot } from '@pine/golden';
import type { SuiteResult } from '@pine/golden';

const cli = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const caseKey = 'parse/v6/P_err_assign_type_change';

function invoke(cwd: string, ...args: string[]) {
  const child = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  assert.ifError(child.error);
  return child;
}

async function temporary(t: { after: (fn: () => Promise<void>) => void }) {
  const path = await mkdtemp(join(tmpdir(), 'pine-cli-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function fixture(cwd: string) {
  const destination = join(cwd, 'fixtures', caseKey);
  await cp(join(defaultFixtureRoot, caseKey), destination, { recursive: true });
  return destination;
}

test('default fixtures resolve from the repository, CLI package, and an unrelated cwd', async (t) => {
  const unrelated = await temporary(t);
  const outputs = [repositoryRoot, packageRoot, unrelated].map((cwd) => {
    const child = invoke(cwd, 'list', '--case', 'P_err_assign_type_change', '--version', '6');
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout.trim(), caseKey);
    return child.stdout;
  });
  assert.equal(new Set(outputs).size, 1);
});

test('custom fixtures, baseline, and JSON output resolve relative to the caller', async (t) => {
  const cwd = await temporary(t);
  await fixture(cwd);
  await mkdir(join(cwd, 'output'));
  const run = invoke(cwd, 'run', '--root', 'fixtures', '--json', 'output/result.json');
  assert.equal(run.status, 0, run.stderr);
  const result: SuiteResult = JSON.parse(await readFile(join(cwd, 'output/result.json'), 'utf8'));
  assert.equal(result.cases.length, 1);
  assert.equal(result.cases[0].key, caseKey);
  assert.equal(result.cases[0].status, 'match');

  const accept = invoke(cwd, 'accept', '--root', 'fixtures', '--reason', 'CLI integration fixture');
  assert.equal(accept.status, 0, accept.stderr);
  const baseline = await readFile(join(cwd, 'fixtures/golden-baseline.json'), 'utf8');
  assert.equal(JSON.parse(baseline).cases[0].key, caseKey);
  assert.equal(invoke(cwd, 'check', '--root', 'fixtures').status, 0);
  await writeFile(join(cwd, 'output/accepted.json'), baseline);
  await rm(join(cwd, 'fixtures/golden-baseline.json'));
  const check = invoke(cwd, 'check', '--root', 'fixtures', '--baseline', 'output/accepted.json');
  assert.equal(check.status, 0, check.stderr);
  const missing = invoke(cwd, 'check', '--root', 'fixtures');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /No accepted baseline/);
});

test('mismatches and changed fixture inputs still produce failing exit codes', async (t) => {
  const cwd = await temporary(t);
  const directory = await fixture(cwd);
  const accept = invoke(cwd, 'accept', '--root', 'fixtures', '--reason', 'CLI regression fixture');
  assert.equal(accept.status, 0, accept.stderr);
  const metaPath = join(directory, 'meta.json');
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  meta.expect = { compile: 'ok' };
  await writeFile(metaPath, JSON.stringify(meta));
  const run = invoke(cwd, 'run', '--root', 'fixtures');
  assert.equal(run.status, 1);
  assert.match(run.stdout, /mismatch/);
  const check = invoke(cwd, 'check', '--root', 'fixtures');
  assert.equal(check.status, 1);
  assert.match(check.stderr, /fixture inputs\/expectations changed/);
});

test('invalid options and filtered baseline operations fail before running fixtures', async (t) => {
  const cwd = await temporary(t);
  for (const [args, message] of [
    [['run', '--root'], /Missing value for --root/],
    [['run', '--version', '7'], /--version must be 5 or 6/],
    [['check', '--case', 'example'], /check requires a full unfiltered suite run/],
    [['accept', '--kind', 'parse'], /accept requires a full unfiltered suite run/],
  ] as const) {
    const child = invoke(cwd, ...args);
    assert.equal(child.status, 1);
    assert.match(child.stderr, message);
  }
});

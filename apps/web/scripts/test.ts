import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Run both suites even after a failure, preserving a failing exit status for CI. */
export function runSuites(suites: readonly (readonly string[])[]): number {
  let status = 0;
  for (const args of suites) {
    const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
    if (result.error) console.error(result.error);
    status ||= result.status ?? 1;
  }
  return status;
}

if (import.meta.main)
  process.exitCode = runSuites([
    [fileURLToPath(new URL('./test-node.ts', import.meta.url))],
    [fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json'))), 'run'],
  ]);

import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Expand in Node so missing directories and Windows shells behave like POSIX shells.
const files = globSync([
  'scripts/**/*.test.ts',
  'src/workflows/**/*.test.ts',
  'src/i18n/**/*.test.ts',
  'examples/**/*.test.ts',
  'scripts/perf-*.test.ts',
]).sort();
if (files.length) {
  const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

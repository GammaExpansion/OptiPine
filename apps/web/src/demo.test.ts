import { afterEach, expect, test, vi } from 'vitest';
import { appUrl } from './demo.ts';

afterEach(() => vi.unstubAllEnvs());

test.each(['/', '/OptiPine/'])('license assets resolve below %s', (base) => {
  vi.stubEnv('BASE_URL', base);
  expect(appUrl('licenses/OptiPine.txt')).toBe(`${base}licenses/OptiPine.txt`);
  expect(appUrl('/licenses/OptiPine.txt')).toBe(`${base}licenses/OptiPine.txt`);
});

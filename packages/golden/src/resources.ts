import { fileURLToPath } from 'node:url';

/** Package-owned evidence is resolved independently of the caller's working directory. */
export const defaultFixtureRoot = fileURLToPath(new URL('../fixtures/', import.meta.url));
export const defaultBaselinePath = fileURLToPath(
  new URL('../fixtures/golden-baseline.json', import.meta.url),
);

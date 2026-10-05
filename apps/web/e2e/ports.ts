/**
 * Where the e2e servers listen: production on the base port, then e2e preview, dev and demo. The
 * `E2E_BASE_PORT` offset moves all four so suites in several worktrees can run at once.
 */
const base = Number(process.env.E2E_BASE_PORT || 5174);
if (!Number.isInteger(base) || base < 1024 || base > 65_532)
  throw new Error(`E2E_BASE_PORT must be a port from 1024 to 65532, not ${base}`);

export const ports = {
  production: base,
  preview: base + 1,
  dev: base + 2,
  demo: base + 3,
} as const;

const origin = (port: number) => `http://127.0.0.1:${port}`;

export const origins = {
  production: origin(ports.production),
  preview: origin(ports.preview),
  dev: origin(ports.dev),
  demo: origin(ports.demo),
} as const;

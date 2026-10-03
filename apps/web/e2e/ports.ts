/**
 * Where the e2e servers listen: production on the base port, the e2e preview one above it and the
 * dev server two above. `E2E_BASE_PORT` moves all three, so suites in several worktrees can run at
 * the same time; it defaults to 5174, the production server's own port.
 */
const base = Number(process.env.E2E_BASE_PORT || 5174);
if (!Number.isInteger(base) || base < 1024 || base > 65_533)
  throw new Error(`E2E_BASE_PORT must be a port from 1024 to 65533, not ${base}`);

export const ports = { production: base, preview: base + 1, dev: base + 2 } as const;

const origin = (port: number) => `http://127.0.0.1:${port}`;

export const origins = {
  production: origin(ports.production),
  preview: origin(ports.preview),
  dev: origin(ports.dev),
} as const;

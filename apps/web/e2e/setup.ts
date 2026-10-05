import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';
import { createAppServer } from '../server/app.ts';
import { ports } from './ports.ts';

/** Own server lifetimes directly so Windows and CI need no shell process-tree termination. */
export default async function setup() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await build({ root, mode: 'production', logLevel: 'warn' });
  await build({ root, mode: 'e2e', logLevel: 'warn' });
  await build({ root, mode: 'demo', logLevel: 'warn' });
  const cleanups: (() => Promise<unknown>)[] = [];
  const close = async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()));
  };
  try {
    const production = createAppServer();
    await new Promise<void>((resolve, reject) => {
      production.once('error', reject);
      production.listen(ports.production, '127.0.0.1', resolve);
    });
    cleanups.push(
      () =>
        new Promise<void>((resolve, reject) => {
          production.closeAllConnections();
          production.close((error) => (error ? reject(error) : resolve()));
        }),
    );
    for (const [mode, port] of [
      ['e2e', ports.preview],
      ['demo', ports.demo],
    ] as const) {
      const server = await preview({
        root,
        mode,
        logLevel: 'warn',
        preview: { host: '127.0.0.1', port, strictPort: true },
      });
      cleanups.push(() => server.close());
    }
    const dev = await createServer({
      root,
      logLevel: 'warn',
      server: { host: '127.0.0.1', port: ports.dev, strictPort: true },
    });
    cleanups.push(() => dev.close());
    await dev.listen();
    return close;
  } catch (error) {
    await close();
    throw error;
  }
}

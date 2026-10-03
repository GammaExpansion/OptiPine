import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';
import { createAppServer } from '../server/app.ts';

/** Own server lifetimes directly so Windows and CI need no shell process-tree termination. */
export default async function setup() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await build({ root, mode: 'production', logLevel: 'warn' });
  await build({ root, mode: 'e2e', logLevel: 'warn' });
  const production = createAppServer();
  await new Promise<void>((resolve, reject) => {
    production.once('error', reject);
    production.listen(5174, '127.0.0.1', resolve);
  });
  const closeProduction = () =>
    new Promise<void>((resolve, reject) => {
      production.closeAllConnections();
      production.close((error) => (error ? reject(error) : resolve()));
    });
  try {
    const built = await preview({
      root,
      mode: 'e2e',
      logLevel: 'warn',
      preview: { host: '127.0.0.1', port: 5175, strictPort: true },
    });
    try {
      const dev = await createServer({
        root,
        logLevel: 'warn',
        server: { host: '127.0.0.1', port: 5176, strictPort: true },
      });
      await dev.listen();
      return async () => {
        await Promise.all([closeProduction(), built.close(), dev.close()]);
      };
    } catch (error) {
      await built.close();
      throw error;
    }
  } catch (error) {
    await closeProduction();
    throw error;
  }
}

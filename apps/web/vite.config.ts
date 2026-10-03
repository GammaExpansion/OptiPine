import { fileURLToPath } from 'node:url';
import { createMarketMiddleware } from '@pine/market-data/proxy';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function marketProxy(): Plugin {
  return {
    name: 'optipine-market-proxy',
    // Connect's path mount strips the prefix, but the package validates the full URL.
    configureServer(server) {
      server.middlewares.use(createMarketMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createMarketMiddleware());
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), marketProxy()],
  build: {
    // Additional entries exercise production bundling without shipping the test/dev workbenches.
    outDir: mode === 'e2e' ? '.e2e-dist' : 'dist',
    rollupOptions: {
      input:
        mode === 'e2e'
          ? {
              app: fileURLToPath(new URL('./index.html', import.meta.url)),
              harness: fileURLToPath(new URL('./e2e/harness.html', import.meta.url)),
              charts: fileURLToPath(new URL('./charts.html', import.meta.url)),
            }
          : undefined,
    },
  },
}));

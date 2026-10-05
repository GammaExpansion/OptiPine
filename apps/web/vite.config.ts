import { fileURLToPath } from 'node:url';
import { createMarketMiddleware } from '@pine/market-data/proxy';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { collectLicenseAssets } from './scripts/licenses.ts';

function licenses(): Plugin {
  return {
    name: 'optipine-licenses',
    generateBundle() {
      for (const [fileName, source] of Object.entries(collectLicenseAssets()))
        this.emitFile({ type: 'asset', fileName, source });
    },
    configureServer(server) {
      const assets = collectLicenseAssets();
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname.slice(1);
        if (!Object.hasOwn(assets, path)) return next();
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.end(request.method === 'HEAD' ? undefined : assets[path]);
      });
    },
  };
}

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
  base: mode === 'demo' ? '/OptiPine/' : '/',
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify(mode === 'demo' ? '1' : '0') },
  plugins: [react(), ...(mode === 'demo' ? [] : [marketProxy()]), licenses()],
  build: {
    // Test and dev entries exercise production bundling without shipping the harness, sheet or chart
    // workbench.
    outDir: mode === 'e2e' ? '.e2e-dist' : mode === 'demo' ? 'demo-dist' : 'dist',
    rollupOptions: {
      input:
        mode === 'e2e'
          ? {
              app: fileURLToPath(new URL('./index.html', import.meta.url)),
              harness: fileURLToPath(new URL('./e2e/harness.html', import.meta.url)),
              sheet: fileURLToPath(new URL('./sheet.html', import.meta.url)),
              charts: fileURLToPath(new URL('./charts.html', import.meta.url)),
            }
          : undefined,
    },
  },
}));

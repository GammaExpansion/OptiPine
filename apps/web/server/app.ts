import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarketMiddleware } from '@pine/market-data/proxy';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function createAppServer(
  directory = fileURLToPath(new URL('../dist/', import.meta.url)),
  market = createMarketMiddleware(),
) {
  const root = resolve(directory);
  return createServer((request, response) => {
    market(request, response, () => {
      void (async () => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.writeHead(405, { Allow: 'GET, HEAD' }).end();
          return;
        }
        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
        } catch {
          response.writeHead(400).end();
          return;
        }
        if (pathname.startsWith('/api/')) {
          response.writeHead(404).end();
          return;
        }
        const candidate = resolve(root, `.${pathname}`);
        const inside = (path: string) => {
          const rel = relative(root, path);
          return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
        };
        if (pathname.includes('\\') || pathname.includes('\0') || !inside(candidate)) {
          response.writeHead(403).end();
          return;
        }
        let file = candidate;
        let info = await stat(file).catch(() => undefined);
        if (!info?.isFile()) {
          // Missing assets must be 404, never an HTML response that hides a broken build.
          if (extname(pathname) || !request.headers.accept?.includes('text/html')) {
            response.writeHead(404).end();
            return;
          }
          file = resolve(root, 'index.html');
          info = await stat(file);
        }
        if (!inside(await realpath(file))) {
          response.writeHead(403).end();
          return;
        }
        response.writeHead(200, {
          'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
          'Content-Length': info.size,
          'Cache-Control': pathname.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        });
        if (request.method === 'HEAD') response.end();
        else
          createReadStream(file)
            .on('error', () => response.destroy())
            .pipe(response);
      })().catch(() => {
        if (!response.headersSent) response.writeHead(500).end();
        else response.destroy();
      });
    });
  });
}

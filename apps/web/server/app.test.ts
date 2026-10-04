// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createAppServer } from './app.ts';

let directory: string;
let server: ReturnType<typeof createAppServer>;
let origin: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'optipine-web-'));
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>OptiPine</title>');
  await writeFile(join(directory, 'worker.js'), 'self.postMessage(1)');
  server = createAppServer(directory);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await rm(directory, { recursive: true, force: true });
});

test('serves HTML, typed Worker assets, HEAD and browser navigation fallback', async () => {
  const html = await fetch(origin, { headers: { Accept: 'text/html' } });
  expect(html.status).toBe(200);
  expect(await html.text()).toContain('OptiPine');
  const script = await fetch(`${origin}/worker.js`);
  expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  expect(await script.text()).toBe('self.postMessage(1)');
  const head = await fetch(`${origin}/worker.js`, { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
  expect((await fetch(`${origin}/backtest`, { headers: { Accept: 'text/html' } })).status).toBe(
    200,
  );
});

test.each([undefined, '*/*', 'application/json', 'text/html'])(
  'serves root and client routes for GET and HEAD with Accept %s',
  async (accept) => {
    for (const path of ['/', '/?health=1', '/backtest', '/optimize/windows/']) {
      for (const method of ['GET', 'HEAD']) {
        const result = await new Promise<{ status?: number; type?: string; body: string }>(
          (resolve, reject) => {
            request(
              `${origin}${path}`,
              { method, headers: accept === undefined ? {} : { Accept: accept } },
              (response) => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk: string) => (body += chunk));
                response.on('end', () =>
                  resolve({
                    status: response.statusCode,
                    type: response.headers['content-type'],
                    body,
                  }),
                );
                response.on('error', reject);
              },
            )
              .on('error', reject)
              .end();
          },
        );
        expect(result).toEqual({
          status: 200,
          type: 'text/html; charset=utf-8',
          body: method === 'HEAD' ? '' : '<!doctype html><title>OptiPine</title>',
        });
      }
    }
  },
);

test('missing assets and API routes do not fall back to HTML; methods and traversal are rejected', async () => {
  for (const path of [
    '/missing.js',
    '/assets/missing.css',
    '/assets/missing',
    '/assets/',
    '/api',
    '/api/missing',
  ])
    for (const accept of ['*/*', 'text/html']) {
      const response = await fetch(`${origin}${path}`, { headers: { Accept: accept } });
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    }
  expect((await fetch(origin, { method: 'POST' })).status).toBe(405);
  expect((await fetch(`${origin}/%ZZ`)).status).toBe(400);
  const status = await new Promise<number | undefined>((resolve, reject) => {
    request(`${origin}/`, { path: '/..%2fsecret.txt' }, (response) => {
      response.resume();
      resolve(response.statusCode);
    })
      .on('error', reject)
      .end();
  });
  expect(status).toBe(403);
});

test('production mounts the package proxy on the full /api/market path without upstream traffic', async () => {
  const invalid = await fetch(`${origin}/api/market/bars?feed=invalid`);
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({ error: { uiText: { id: 'feedInvalidRequest' } } });
  expect((await fetch(`${origin}/api/market/bars`, { method: 'POST' })).status).toBe(405);
});

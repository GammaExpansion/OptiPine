import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureOptions } from './readme-screenshots.ts';

test('capture owns the e2e dev port by default and allows isolated worktree ports', () => {
  assert.deepEqual(captureOptions([], {}), { url: 'http://127.0.0.1:5176', port: 5176 });
  assert.deepEqual(captureOptions([], { E2E_BASE_PORT: '6174' }), {
    url: 'http://127.0.0.1:6176',
    port: 6176,
  });
  assert.deepEqual(captureOptions(['--port', '7176'], { E2E_BASE_PORT: '6174' }), {
    url: 'http://127.0.0.1:7176',
    port: 7176,
  });
});

test('an explicit local URL reuses a dev, preview or production server', () => {
  for (const url of ['http://localhost:5173/', 'http://127.0.0.1:5174/'])
    assert.deepEqual(captureOptions(['--url', url], {}), { url, port: null });
});

test('invalid or ambiguous server options fail before launching Chromium', () => {
  for (const port of ['NaN', '1.5', '1023', '65536', ''])
    assert.throws(() => captureOptions(['--port', port], {}));
  for (const base of ['oops', '1021', '65534'])
    assert.throws(() => captureOptions([], { E2E_BASE_PORT: base }));
  for (const url of [
    '',
    'https://example.com',
    'file:///tmp/index.html',
    'http://user@localhost:5173',
  ])
    assert.throws(() => captureOptions(['--url', url], {}));
  assert.throws(() => captureOptions(['--url', 'http://localhost:5173', '--port', '7176'], {}));
  assert.throws(() => captureOptions(['--unknown'], {}));
});

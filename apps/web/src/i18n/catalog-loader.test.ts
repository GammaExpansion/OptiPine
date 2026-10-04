import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCatalogLoader } from './catalog-loader.ts';
import type { Catalog } from './types.ts';

function deferred() {
  let resolve!: (catalog: Catalog) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Catalog>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('areas merge without losing core copy, deduplicate requests and leave other areas unloaded', async () => {
  const pending = deferred();
  const calls: string[] = [];
  const loader = createCatalogLoader(async (language, area) => {
    calls.push(`${language}:${area}`);
    return area === 'core' ? { 'shell.backtest': 'Backtest' } : pending.promise;
  });
  await loader.load('en');
  const first = loader.load('en', 'optimize');
  assert.equal(loader.load('en', 'optimize'), first);
  assert.equal(loader.ready('en'), false);
  assert.equal(loader.has('en', 'optimize'), false);
  pending.resolve({ 'optimize.start': 'Start' });
  await first;
  assert.equal(loader.ready('en'), true);
  assert.deepEqual(loader.get('en'), { 'shell.backtest': 'Backtest', 'optimize.start': 'Start' });
  await loader.load('en', 'optimize');
  assert.deepEqual(calls, ['en:core', 'en:optimize']);
  assert.equal(loader.has('en', 'data'), false);
  assert.equal(loader.has('zh'), false);
});

test('a language is ready only after all requested areas arrive, including one opened mid-switch', async () => {
  const optimize = deferred();
  const data = deferred();
  const calls: string[] = [];
  const loader = createCatalogLoader(async (language, area) => {
    calls.push(`${language}:${area}`);
    if (language === 'zh' && area === 'optimize') return optimize.promise;
    if (language === 'zh' && area === 'data') return data.promise;
    return {};
  });
  await loader.load('en');
  await loader.load('en', 'optimize');
  const switching = loader.loadRequested('zh');
  await loader.load('en', 'data');
  await Promise.resolve();
  assert.equal(loader.has('zh'), true);
  assert.equal(loader.ready('zh'), false);
  optimize.resolve({});
  await switching;
  assert.equal(loader.ready('zh'), false);
  const remaining = loader.loadRequested('zh');
  data.resolve({});
  await remaining;
  assert.equal(loader.ready('zh'), true);
  assert.equal(loader.ready('en'), true);
  assert.equal(calls.filter((key) => key === 'zh:optimize').length, 1);
  assert.ok(!calls.some((key) => key.includes('licenses')));
});

test('a failed area can retry and subscribers observe new requests and completed catalogs', async () => {
  const pending = deferred();
  let attempts = 0;
  const loader = createCatalogLoader(() =>
    ++attempts === 1 ? pending.promise : Promise.resolve({}),
  );
  let notified = 0;
  const stop = loader.subscribe(() => {
    notified++;
  });
  const failed = loader.load('en', 'script');
  pending.reject(new Error('offline'));
  await assert.rejects(failed, /offline/);
  assert.equal(loader.has('en', 'script'), false);
  assert.equal(notified, 1);
  await loader.load('en', 'script');
  assert.equal(loader.has('en', 'script'), true);
  assert.equal(notified, 2);
  assert.equal(loader.revision(), 2);
  stop();
  await loader.load('en');
  assert.equal(notified, 2);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { message } from '@pine/messages';
import { hasCatalog, loadCatalog, onCatalog, translate } from './translate.ts';

// This file runs in a process of its own, without catalogs.ts registering both catalogs.
test('a catalog loads on demand, once, and translation falls back until it has', async () => {
  const text = message('shell.optimize');
  assert.equal(hasCatalog('zh'), false);
  assert.equal(translate(text, 'zh'), 'shell.optimize');
  let notified = 0;
  const stop = onCatalog(() => notified++);
  const first = loadCatalog('zh');
  assert.equal(loadCatalog('zh'), first);
  await first;
  stop();
  assert.equal(notified, 1);
  assert.equal(translate(text, 'zh'), '优化');
  assert.equal(hasCatalog('en'), false);
  assert.equal(hasCatalog('zh', 'optimize'), false);
  assert.equal(translate(message('optimize.start'), 'zh'), 'optimize.start');
  assert.equal(translate(message('sheet.title'), 'zh'), 'sheet.title');
  await loadCatalog('zh');
  assert.equal(notified, 1);
});

test('each area dynamically loads only its requested language and preserves existing copy', async () => {
  for (const area of ['optimize', 'data', 'script', 'properties', 'sheet', 'licenses'] as const) {
    await loadCatalog('zh', area);
    assert.equal(hasCatalog('zh', area), true);
    assert.equal(hasCatalog('en', area), false);
  }
  assert.equal(translate(message('shell.optimize'), 'zh'), '优化');
  assert.equal(translate(message('licenses.title'), 'zh'), '关于与许可证');
  assert.equal(translate(message('optimize.start'), 'zh'), '开始优化');
});

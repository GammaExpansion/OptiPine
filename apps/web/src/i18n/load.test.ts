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
  assert.equal(translate(message('sheet.title'), 'zh'), 'sheet.title');
  await loadCatalog('zh');
  assert.equal(notified, 1);
});

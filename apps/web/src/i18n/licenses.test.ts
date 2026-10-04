import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { licensesEn } from './licenses-en.ts';
import { licensesZh } from './licenses-zh.ts';

test('both lazy catalogs preserve the original attribution and complete every license label', () => {
  assert.deepEqual(Object.keys(licensesEn).sort(), Object.keys(licensesZh).sort());
  const notice = readFileSync(
    new URL('../../licenses/lightweight-charts-NOTICE.txt', import.meta.url),
    'utf8',
  ).trim();
  const appLicense = readFileSync(new URL('../../../../LICENSE', import.meta.url), 'utf8');
  for (const copy of [licensesEn, licensesZh]) {
    assert.equal(`${copy['licenses.charts']}\n${copy['licenses.chartNotice']}`, notice);
    assert.ok(appLicense.includes(copy['licenses.copyright']));
    assert.ok(Object.values(copy).every((value) => value.trim()));
    assert.match(copy['licenses.fonts'], /1\.1/);
    assert.match(copy['licenses.chartLicense'], /2\.0/);
    assert.match(copy['licenses.mitLibraries'], /CodeMirror 6/);
  }
});

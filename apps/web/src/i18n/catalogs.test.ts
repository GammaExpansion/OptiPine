import assert from 'node:assert/strict';
import { test } from 'node:test';
import { marketDataMessageIds } from '@pine/market-data';
import { optimizerMessageIds } from '@pine/optimizer';
import { workerMessageIds } from '@pine/workers';
import { catalogs } from './translate.ts';

test('catalogs have identical keys and placeholders', () => {
  assert.deepEqual(Object.keys(catalogs.en).sort(), Object.keys(catalogs.zh).sort());
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
  for (const id of Object.keys(catalogs.en) as (keyof typeof catalogs.en)[]) {
    assert.deepEqual(placeholders(catalogs.en[id]), placeholders(catalogs.zh[id]), id);
    assert.ok(catalogs.en[id].trim() && catalogs.zh[id].trim(), id);
  }
});

test('both catalogs cover every package message id', () => {
  for (const catalog of Object.values(catalogs)) {
    for (const id of [...optimizerMessageIds, ...marketDataMessageIds, ...workerMessageIds]) {
      assert.ok(Object.hasOwn(catalog, id), id);
    }
  }
});

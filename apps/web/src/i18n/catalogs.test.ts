import assert from 'node:assert/strict';
import { test } from 'node:test';
import { message } from '@pine/messages';
import { marketDataMessageIds } from '@pine/market-data';
import { optimizerMessageIds } from '@pine/optimizer';
import { workerMessageIds } from '@pine/workers';
import { workflowMessageIds, workflowMessage } from '../workflows/messages.ts';
import { catalogs } from './catalogs.ts';
import { en } from './en.ts';
import { zh } from './zh.ts';
import { sheetEn } from './sheet-en.ts';
import { sheetZh } from './sheet-zh.ts';
import { translate, type Language } from './translate.ts';

test('catalogs have identical keys and placeholders', () => {
  assert.deepEqual(Object.keys(catalogs.en).sort(), Object.keys(catalogs.zh).sort());
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
  for (const id of Object.keys(catalogs.en) as (keyof typeof catalogs.en)[]) {
    assert.deepEqual(placeholders(catalogs.en[id]), placeholders(catalogs.zh[id]), id);
    assert.ok(catalogs.en[id].trim() && catalogs.zh[id].trim(), id);
  }
});

test('production catalogs keep both languages complete without component-sheet copy', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  for (const [language, app] of Object.entries({ en, zh })) {
    const full = catalogs[language as keyof typeof catalogs];
    for (const id of Object.keys(full)) {
      if (!id.startsWith('sheet.')) assert.ok(Object.hasOwn(app, id), id);
    }
    assert.ok(Object.keys(app).every((id) => !id.startsWith('sheet.')));
  }
});

test('component-sheet catalogs register their copy only for tests and dev pages', () => {
  for (const [language, sheet] of Object.entries({ en: sheetEn, zh: sheetZh })) {
    assert.ok(Object.keys(sheet).every((id) => id.startsWith('sheet.')));
    for (const id of Object.keys(sheet) as (keyof typeof sheetEn)[]) {
      assert.equal(translate(message(id), language as Language), sheet[id]);
    }
  }
});

test('both catalogs cover every package and workflow message id', () => {
  for (const catalog of Object.values(catalogs)) {
    for (const id of [
      ...optimizerMessageIds,
      ...marketDataMessageIds,
      ...workerMessageIds,
      ...workflowMessageIds,
    ]) {
      assert.ok(Object.hasOwn(catalog, id), id);
    }
  }
});

test('workflow values and nested property names translate in both languages', () => {
  const minimum = workflowMessage('backtest.inputBelowMin', { title: 'Multiplier', min: 0.25 });
  assert.equal(translate(minimum, 'en'), 'Multiplier must be at least 0.25');
  assert.equal(translate(minimum, 'zh'), 'Multiplier 不得小于 0.25');
  const property = workflowMessage('backtest.propertyInvalid', {
    property: workflowMessage('backtest.property.initialCapital'),
  });
  assert.equal(translate(property, 'en'), 'Fix the value of Initial capital');
  assert.equal(translate(property, 'zh'), '请修正初始资金的值');
});

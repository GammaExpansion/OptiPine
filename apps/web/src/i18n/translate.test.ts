import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codedError, message, type MessageGroup } from '@pine/messages';
import {
  defaultLanguage,
  formatDate,
  formatNumber,
  translate,
  translateError,
  translateId,
} from './translate.ts';

test('nested messages, groups, coded errors and literal source text', () => {
  const error = codedError('csvLineError', { line: 12, reason: message('csvVolume') });
  assert.equal(translateError(error, 'en'), 'Line 12: Volume must be nonnegative.');
  assert.equal(translateError(error, 'zh'), '第 12 行：成交量不能为负数。');
  const group: MessageGroup = {
    kind: 'message-group',
    parts: [message('inSampleMonthCount'), 'Length'],
    separator: ' / ',
  };
  assert.equal(translate(group, 'zh'), '样本内月数 / Length');
  assert.equal(translateError(new Error('Pine diagnostic'), 'zh'), 'Pine diagnostic');
  assert.equal(
    translateId('searchMin', 'en', { title: 'Length', min: 2 }),
    'Length must be at least 2.',
  );
});

test('unknown ids and missing values retain a useful fallback', () => {
  assert.equal(translate(message('future.id', { n: 3 }), 'en'), 'future.id: n=3');
  assert.equal(translate(message('toString'), 'en'), 'toString');
  assert.equal(
    translate(message('searchMin', { title: 'Length' }), 'en'),
    'Length must be at least {min}.',
  );
});

test('Chinese browser locales default to Chinese; all other locales use English', () => {
  for (const locale of ['zh', 'zh-CN', 'zh-TW', 'ZH-Hans-CN'])
    assert.equal(defaultLanguage(locale), 'zh');
  for (const locale of ['en-US', 'ja-JP', '', 'zho']) assert.equal(defaultLanguage(locale), 'en');
});

test('numbers and UTC dates are language-independent', () => {
  assert.equal(formatNumber(12345.678, { maximumFractionDigits: 2 }), '12,345.68');
  const date = new Date('2025-05-04T01:02:03Z');
  assert.equal(formatDate(date), '2025-05-04');
  assert.equal(formatDate(date.valueOf(), true), '2025-05-04 01:02:03 UTC');
  for (const language of ['en', 'zh'] as const) {
    assert.ok(translateId('feedTooManyBars', language, { count: 100000 }).includes('100,000'));
  }
});

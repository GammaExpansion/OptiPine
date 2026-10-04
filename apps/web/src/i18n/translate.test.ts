import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codedError, message, type MessageGroup } from '@pine/messages';
import './catalogs.ts';
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

test('cached number formatting matches fresh Intl formatters, including signs and fixed decimals', () => {
  for (const options of [
    {},
    { maximumFractionDigits: undefined },
    { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' },
    { style: 'percent', maximumFractionDigits: 1 },
    { notation: 'compact', maximumSignificantDigits: 3 },
    { style: 'currency', currency: 'USD', currencySign: 'accounting' },
  ] satisfies Intl.NumberFormatOptions[]) {
    const fresh = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8, ...options });
    for (const value of [12345.678901234, -12.4, -0, 0, Infinity, -Infinity, NaN])
      assert.equal(formatNumber(value, options), fresh.format(value));
  }
  formatNumber(1, { minimumFractionDigits: undefined });
  assert.throws(() => formatNumber(1, { minimumFractionDigits: NaN }), RangeError);
  assert.throws(() => formatNumber(1, { minimumFractionDigits: NaN }), RangeError);
});

test('formatNumber reuses equal option sets regardless of object identity and property order', () => {
  const original = Intl.NumberFormat;
  let constructions = 0;
  Intl.NumberFormat = new Proxy(original, {
    construct(target, args) {
      constructions++;
      return Reflect.construct(target, args);
    },
  });
  try {
    const options = {
      maximumFractionDigits: 7,
      useGrouping: undefined,
      minimumFractionDigits: 3,
      minimumIntegerDigits: 7,
      signDisplay: 'always' as const,
    };
    const first = formatNumber(1234.5, options);
    const second = formatNumber(1234.5, {
      signDisplay: 'always',
      minimumIntegerDigits: 7,
      minimumFractionDigits: 3,
      maximumFractionDigits: 7,
    });
    assert.equal(first, '+0,001,234.500');
    assert.equal(second, first);
    assert.equal(constructions, 1);
    options.maximumFractionDigits = 8;
    formatNumber(1, options);
    formatNumber(2, { signDisplay: 'always', minimumIntegerDigits: 7, minimumFractionDigits: 3 });
    assert.equal(constructions, 2, 'changed options miss; the explicit default reuses the entry');
    for (const minimumFractionDigits of [1, 2])
      for (let minimumIntegerDigits = 1; minimumIntegerDigits <= 21; minimumIntegerDigits++)
        formatNumber(1, { minimumFractionDigits, minimumIntegerDigits, signDisplay: 'never' });
    const before = constructions;
    formatNumber(1, options);
    assert.equal(constructions, before + 1, 'old entries are evicted from the bounded cache');
  } finally {
    Intl.NumberFormat = original;
  }
});

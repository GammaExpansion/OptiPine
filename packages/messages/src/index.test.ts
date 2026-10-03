import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CodedError,
  codedError,
  errorText,
  isCodedError,
  isText,
  message,
  plainText,
  restoreError,
  serializeError,
  TextError,
} from './index.ts';

test('plain text renders ids, values and nested messages without a catalog', () => {
  assert.equal(plainText('raw'), 'raw');
  assert.equal(plainText(message('searchGridLimit')), 'searchGridLimit');
  assert.equal(
    plainText(message('monthCountRange', { name: message('stepMonthCount'), limit: 1200 })),
    'monthCountRange: name=stepMonthCount, limit=1200',
  );
  assert.equal(
    plainText({ kind: 'message-group', parts: ['a', message('b')], separator: ' · ' }),
    'a · b',
  );
});

test('coded errors keep their code, values and subclass, and expose the code as text', () => {
  const range = codedError('splitRatioRange', {}, RangeError);
  assert.ok(range instanceof RangeError);
  assert.equal(range.message, 'splitRatioRange');
  assert.deepEqual(errorText(range), message('splitRatioRange'));
  class LineError extends CodedError<'csvLineError'> {
    constructor(line: number) {
      super('csvLineError', { line, reason: message('csvVolume') });
      this.name = 'LineError';
    }
  }
  const line = new LineError(4);
  assert.ok(line instanceof TextError);
  assert.equal(line.code, 'csvLineError');
  assert.equal(line.values.line, 4);
  assert.ok(isCodedError(line, ['csvLineError']));
  assert.ok(!isCodedError(line, ['other']));
  assert.ok(isCodedError(line, undefined, 'csvLineError'));
  assert.ok(!isCodedError(new Error('plain')));
  assert.equal(errorText(new Error('plain')), 'plain');
  assert.equal(errorText(7), '7');
});

test('errors survive a structured-clone boundary with their name and text', () => {
  const original = codedError('feedRateLimited');
  original.name = 'FeedError';
  const restored = restoreError(structuredClone(serializeError(original)));
  assert.equal(restored.name, 'FeedError');
  assert.deepEqual(restored.uiText, message('feedRateLimited'));
  const plain = restoreError(structuredClone(serializeError(new TypeError('bad input'))));
  assert.equal(plain.name, 'TypeError');
  assert.equal(plain.uiText, 'bad input');
});

test('received text must be well-formed before it is trusted', () => {
  assert.ok(isText(message('a', { n: 1, nested: message('b') })));
  assert.ok(!isText({ kind: 'message', id: 1, values: {} }));
  assert.ok(!isText({ kind: 'message', id: 'a', values: { bad: {} } }));
  assert.ok(!isText({ kind: 'message', id: 'a', values: { bad: Number.NaN } }));
  assert.ok(!isText({ kind: 'message-group', parts: 'x', separator: ',' }));
  const restored = restoreError({
    name: 'Error',
    message: 'fallback',
    uiText: { kind: 'message', id: 'a', values: { bad: {} } } as never,
  });
  assert.equal(restored.uiText, 'fallback');
});

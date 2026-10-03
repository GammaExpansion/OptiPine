import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { examples } from '../../../../examples/index.ts';
import { pineTokens } from './pine-tokens.ts';
import type { PineState, PineStream, PineTokenStyle } from './pine-tokens.ts';

/** In-memory StringStream contract keeps tokenizer tests independent of CodeMirror and the DOM. */
class TestStream implements PineStream {
  pos = 0;
  start = 0;
  text: string;

  constructor(text: string) {
    this.text = text;
  }

  eol(): boolean {
    return this.pos >= this.text.length;
  }

  next(): string | undefined {
    return this.eol() ? undefined : this.text[this.pos++];
  }

  eatSpace(): boolean {
    return Boolean(this.match(/^\s+/));
  }

  match(pattern: string | RegExp, consume = true): boolean | RegExpMatchArray | null {
    const rest = this.text.slice(this.pos);
    if (typeof pattern === 'string') {
      if (!rest.startsWith(pattern)) return false;
      if (consume) this.pos += pattern.length;
      return true;
    }
    const match = pattern.exec(rest);
    if (!match || match.index !== 0) return null;
    if (consume) this.pos += match[0].length;
    return match;
  }

  current(): string {
    return this.text.slice(this.start, this.pos);
  }

  skipToEnd(): void {
    this.pos = this.text.length;
  }
}

type Token = [text: string, style: PineTokenStyle | null];

function tokens(line: string, state: PineState = pineTokens.startState()): Token[] {
  const stream = new TestStream(line);
  const result: Token[] = [];
  while (!stream.eol()) {
    stream.start = stream.pos;
    const style = pineTokens.token(stream, state);
    assert.ok(stream.pos > stream.start, `no progress at ${line.slice(stream.start)}`);
    assert.ok(stream.pos <= line.length, 'must not consume beyond the physical line');
    result.push([stream.current(), style]);
  }
  assert.equal(result.map(([text]) => text).join(''), line, 'preserve source verbatim');
  return result;
}

const styled = (line: string, state?: PineState) =>
  tokens(line, state).filter(([, style]) => style !== null);

test('Pine v5/v6 version annotations and line comments keep the mock comment colour', () => {
  for (const line of ['//@version=5', '//@version=6', '// input.int(3) "quoted" #ffffff']) {
    assert.deepEqual(styled(line), [[line, 'comment']]);
  }
  assert.deepEqual(styled('x = 3 // explanation'), [
    ['=', 'operator'],
    ['3', 'number'],
    ['// explanation', 'comment'],
  ]);
});

test('keywords, declarations, types, word operators and names stay distinct', () => {
  assert.deepEqual(styled('var float value = na'), [
    ['var', 'keyword'],
    ['float', 'typeName'],
    ['=', 'operator'],
    ['na', 'keyword'],
  ]);
  assert.deepEqual(styled('if (enabled and not na(value)) or false'), [
    ['if', 'keyword'],
    ['and', 'keyword'],
    ['not', 'keyword'],
    ['na', 'variableName.function'],
    ['or', 'keyword'],
    ['false', 'keyword'],
  ]);
  for (const word of 'as break by const continue else enum export for import in method series simple switch to true type varip while'.split(
    ' ',
  )) {
    assert.deepEqual(styled(word), [[word, 'keyword']]);
  }
  for (const type of 'array bool box color float int label line linefill map matrix polyline string table'.split(
    ' ',
  )) {
    assert.deepEqual(styled(type), [[type, 'typeName']]);
  }
  assert.deepEqual(styled('close length strategyName tainted myRecord.field'), []);
});

test('namespaced calls and constants use standard CodeMirror function and keyword tags', () => {
  for (const name of [
    'ta.sma',
    'math.max',
    'strategy.entry',
    'strategy.risk.max_drawdown',
    'input.int',
    'request.security',
    'array.push',
    'matrix.get',
    'map.put',
    'str.tostring',
    'color.new',
    'timeframe.in_seconds',
    'ticker.new',
    'runtime.error',
    'log.info',
    'plot',
    'plotshape',
    'indicator',
    'strategy',
    'library',
    'float',
    'nz',
    'myFunction',
  ]) {
    assert.deepEqual(styled(`${name} ()`), [[name, 'variableName.function']]);
  }
  for (const name of [
    'ta',
    'math',
    'strategy',
    'input',
    'request',
    'strategy.commission.percent',
    'strategy.long',
    'math.pi',
    'color.teal',
    'syminfo.mintick',
    'barstate.islast',
    'shape.triangleup',
    'location.belowbar',
    'size.tiny',
    'display.none',
    'session.ismarket',
  ]) {
    assert.deepEqual(styled(name), [[name, 'keyword']]);
  }
});

test('strings protect escapes, URLs and comment-looking text in either quote style', () => {
  for (const literal of [
    '""',
    "''",
    '"https://example.test/a?x=1 // text"',
    String.raw`"quote: \" and slash: \\ and newline: \n"`,
    String.raw`'it\'s #ffffff and ta.sma(3)'`,
  ]) {
    assert.deepEqual(styled(literal), [[literal, 'string']]);
  }
  assert.deepEqual(styled('"// string" // comment'), [
    ['"// string"', 'string'],
    ['// comment', 'comment'],
  ]);
});

test('generic collection constructors highlight both the function and type arguments', () => {
  assert.deepEqual(styled('map.new<string, float>()'), [
    ['map.new', 'variableName.function'],
    ['<', 'operator'],
    ['string', 'typeName'],
    ['float', 'typeName'],
    ['>', 'operator'],
  ]);
  assert.deepEqual(styled('array.new<float>(3)'), [
    ['array.new', 'variableName.function'],
    ['<', 'operator'],
    ['float', 'typeName'],
    ['>', 'operator'],
    ['3', 'number'],
  ]);
  assert.deepEqual(styled('a < b > (c)'), [
    ['<', 'operator'],
    ['>', 'operator'],
  ]);
});

test('decimal and scientific numbers, signed exponents and RGB/RGBA colours', () => {
  for (const literal of [
    '0',
    '12',
    '2.5',
    '.25',
    '1.',
    '1e-3',
    '2E+4',
    '.5e2',
    '1.e-2',
    '#aAbBcC',
    '#12aB34fF',
  ]) {
    assert.deepEqual(styled(literal), [[literal, 'number']]);
  }
  assert.deepEqual(styled('-1e-3 + +.5'), [
    ['-', 'operator'],
    ['1e-3', 'number'],
    ['+', 'operator'],
    ['+', 'operator'],
    ['.5', 'number'],
  ]);
  for (const invalid of ['#abc', '#abcdefg', '#abcdef123', '#1234567']) {
    assert.ok(!styled(invalid).some(([text]) => text.startsWith('#')));
  }
});

test('symbolic operators are consumed whole and punctuation stays unstyled', () => {
  const operators = ':= => += -= *= /= %= == != <= >= + - * / % < > = ? :'.split(' ');
  assert.deepEqual(
    styled(operators.join(' ')),
    operators.map((op) => [op, 'operator']),
  );
  assert.deepEqual(
    tokens('()[],.'),
    [...'()[],.'].map((text) => [text, null]),
  );
});

test('wrapped strings retain state and copies can be retokenized independently', () => {
  const state = pineTokens.startState();
  assert.deepEqual(styled('"wrapped', state), [['"wrapped', 'string']]);
  assert.equal(state.quote, '"');
  const copy = pineTokens.copyState(state);
  assert.notEqual(copy, state);
  assert.deepEqual(copy, state);
  assert.deepEqual(styled('    rest" + 2', copy), [
    ['    rest"', 'string'],
    ['+', 'operator'],
    ['2', 'number'],
  ]);
  assert.equal(copy.quote, null);
  assert.equal(state.quote, '"');
  assert.equal(pineTokens.startState().quote, null);
  assert.deepEqual(styled('tail"', state), [['tail"', 'string']]);
  assert.equal(state.quote, null);
});

test('v6 triple-quoted strings allow quotes, comments and blank lines inside', () => {
  for (const quote of ['"""', "'''"]) {
    const state = pineTokens.startState();
    assert.deepEqual(styled(`${quote}first`, state), [[`${quote}first`, 'string']]);
    assert.deepEqual(tokens('', state), []);
    assert.deepEqual(styled('// " or \' inside', state), [['// " or \' inside', 'string']]);
    assert.deepEqual(styled(`last${quote} // end`, state), [
      [`last${quote}`, 'string'],
      ['// end', 'comment'],
    ]);
    assert.equal(state.quote, null);
    assert.deepEqual(styled(`${quote}${quote}`), [[`${quote}${quote}`, 'string']]);
  }
});

test('an escape at a physical newline does not escape the next line closing quote', () => {
  const state = pineTokens.startState();
  assert.deepEqual(styled('"text\\', state), [['"text\\', 'string']]);
  assert.deepEqual(styled('" + 1', state), [
    ['"', 'string'],
    ['+', 'operator'],
    ['1', 'number'],
  ]);
  assert.equal(state.quote, null);
});

test('empty, whitespace-only and incomplete editor lines never stall or share state', () => {
  assert.deepEqual(tokens(''), []);
  assert.deepEqual(tokens(' \t '), [[' \t ', null]]);
  for (const line of ['@', '#', '💹', 'ta.', 'x :=', '1e-', '"unfinished']) tokens(line);
  assert.deepEqual(styled('plot(close)'), [['plot', 'variableName.function']]);
});

// Resolve filesystem fixtures without Vite's asset-URL transformation.
const examplesDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../examples');

for (const example of examples) {
  test(`every line of ${example.title} tokenizes without losing source or leaking string state`, () => {
    const source = readFileSync(resolve(examplesDirectory, example.fileName), 'utf8');
    const state = pineTokens.startState();
    for (const line of source.split(/\r?\n/)) {
      const result = tokens(line, state);
      assert.equal(state.quote, null, line);
      // All calls in these scripts are built-ins. Exercise each full qualified name,
      // while the focused cases above cover syntax not present in the examples.
      for (const [text, style] of result) {
        if (/^(?:ta|math|input)\./.test(text)) assert.equal(style, 'variableName.function', line);
        if (/^\/\//.test(text)) assert.equal(style, 'comment', line);
        if (text.startsWith('"')) assert.equal(style, 'string', line);
      }
    }
  });
}

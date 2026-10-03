/** Only the StringStream members used here; CodeMirror 6 satisfies this structurally. */
export interface PineStream {
  eol(): boolean;
  next(): string | undefined;
  eatSpace(): boolean;
  match(pattern: string | RegExp, consume?: boolean): boolean | RegExpMatchArray | null;
  current(): string;
  skipToEnd(): void;
}

export interface PineState {
  /** Retained across lines for wrapped strings and Pine v6 triple-quoted strings. */
  quote: '"' | "'" | '"""' | "'''" | null;
}

export type PineTokenStyle =
  'keyword' | 'typeName' | 'variableName.function' | 'string' | 'number' | 'comment' | 'operator';

const keywords = new Set([
  'and',
  'as',
  'break',
  'by',
  'const',
  'continue',
  'else',
  'enum',
  'export',
  'false',
  'for',
  'if',
  'import',
  'in',
  'method',
  'not',
  'or',
  'series',
  'simple',
  'switch',
  'to',
  'true',
  'type',
  'var',
  'varip',
  'while',
]);

const types = new Set([
  'array',
  'bool',
  'box',
  'color',
  'float',
  'int',
  'label',
  'line',
  'linefill',
  'map',
  'matrix',
  'polyline',
  'string',
  'table',
]);

const namespaces = new Set([
  'adjustment',
  'alert',
  'array',
  'backadjustment',
  'barmerge',
  'barstate',
  'box',
  'chart',
  'color',
  'currency',
  'dayofweek',
  'display',
  'dividends',
  'earnings',
  'extend',
  'font',
  'format',
  'hline',
  'input',
  'label',
  'line',
  'linefill',
  'location',
  'log',
  'map',
  'math',
  'matrix',
  'order',
  'plot',
  'polyline',
  'position',
  'request',
  'runtime',
  'scale',
  'session',
  'shape',
  'size',
  'splits',
  'str',
  'strategy',
  'syminfo',
  'ta',
  'table',
  'text',
  'ticker',
  'timeframe',
  'xloc',
  'yloc',
]);

function stringToken(stream: PineStream, state: PineState): PineTokenStyle {
  while (!stream.eol()) {
    if (stream.match(state.quote!)) {
      state.quote = null;
      break;
    }
    // Consume an escaped quote/backslash together. A physical newline ends the escape.
    if (stream.next() === '\\') stream.next();
  }
  return 'string';
}

/**
 * Pass directly to `StreamLanguage.define(pineTokens)`; no editor dependency is needed here.
 * Returned names are CodeMirror 6 standard tags (the dot applies a tag modifier):
 *
 * Mock class | StreamParser tag             | Mock colour
 * .kw        | keyword, typeName            | #8fb8de
 * .fn        | variableName.function        | #d9c38c
 * .st        | string                       | #a9c98f
 * .nu        | number (also hex colours)    | #e0a577
 * .cm        | comment (also //@version)    | #6b727b
 *
 * Symbolic operators use `operator`, in the body text colour (#e8eaed); word operators
 * use `keyword`, as in the mock. Unstyled identifiers and punctuation return null.
 * This is a lexical highlighter, not a validator: unknown function calls are highlighted too.
 */
export const pineTokens = {
  startState(): PineState {
    return { quote: null };
  },

  copyState(state: PineState): PineState {
    return { ...state };
  },

  token(stream: PineStream, state: PineState): PineTokenStyle | null {
    if (state.quote !== null) return stringToken(stream, state);
    if (stream.eatSpace()) return null;
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match(/^(?:"""|'''|"|')/)) {
      state.quote = stream.current() as PineState['quote'];
      return stringToken(stream, state);
    }
    if (stream.match(/^#[\da-fA-F]{6}(?:[\da-fA-F]{2})?(?!\w)/)) return 'number';
    if (stream.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)) return 'number';
    if (stream.match(/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/)) {
      const name = stream.current();
      if (keywords.has(name)) return 'keyword';
      if (stream.match(/^\s*\(/, false)) return 'variableName.function';
      // Collection constructors may place type arguments between the name and call.
      if (/^(?:array|matrix|map)\.new$/.test(name) && stream.match(/^\s*<[\w., \t]+>\s*\(/, false))
        return 'variableName.function';
      if (types.has(name)) return 'typeName';
      if (name === 'na' || namespaces.has(name.split('.')[0])) return 'keyword';
      return null;
    }
    if (stream.match(/^(?:=>|:=|[+*/%=-]=|!=|<=|>=|[+*/%<>=?:-])/)) return 'operator';
    // Consume unknown characters too, so partially edited source can never stall the editor.
    stream.next();
    return null;
  },
};

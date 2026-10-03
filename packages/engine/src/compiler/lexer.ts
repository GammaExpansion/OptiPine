import type { Diagnostic } from '../types.ts';

export interface Token {
  kind: 'name' | 'number' | 'string' | 'color' | 'punct' | 'layout';
  text: string;
  line: number;
  column: number;
  value?: string;
}
export class CompileError extends Error {
  diagnostic: Diagnostic;
  constructor(kind: Diagnostic['kind'], line: number, message: string, column?: number) {
    super(message);
    this.diagnostic = { kind, line, column, message };
  }
}

/** Layout is retained as tokens; continuations retain their physical source coordinates. */
export function tokenize(source: string, version: 5 | 6): Token[] {
  const result: Token[] = [];
  const indents = [0];
  const delimiters: Token[] = [];
  let previous: Token | undefined;
  let continuing = false;
  let logicalStart = 1;
  const lines = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const layout = (text: string, line: number, column = 1): Token => ({
    kind: 'layout',
    text,
    line,
    column,
  });
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const line = index + 1;
    const prefix = raw.match(/^[ \t]*/)?.[0] ?? '';
    const indentation = prefix.replace(/\t/g, '    ').length;
    const tokens: Token[] = [];
    let pos = prefix.length;
    while (pos < raw.length) {
      const character = raw[pos];
      if (/\s/.test(character)) {
        pos++;
        continue;
      }
      if (raw.slice(pos, pos + 2) === '//') break;
      const start = pos;
      const token = (kind: Token['kind'], text: string, value?: string): Token => ({
        kind,
        text,
        value,
        line,
        column: start + 1,
      });
      if (character === '"' || character === "'") {
        const quote = character;
        let value = '';
        pos++;
        while (pos < raw.length && raw[pos] !== quote) {
          if (raw[pos] === '\\') {
            pos++;
            const escaped = raw[pos++];
            value +=
              (
                { n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"', "'": "'" } as Record<
                  string,
                  string
                >
              )[escaped] ?? `\\${escaped}`;
          } else value += raw[pos++];
        }
        if (raw[pos] !== quote)
          throw new CompileError('syntax', line, 'Unterminated string literal.', start + 1);
        pos++;
        tokens.push(token('string', raw.slice(start, pos), value));
        continue;
      }
      const number = raw.slice(pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (number) {
        pos += number[0].length;
        tokens.push(token('number', number[0]));
        continue;
      }
      const color = raw.slice(pos).match(/^#[a-fA-F\d]{6}(?:[a-fA-F\d]{2})?/);
      if (color) {
        pos += color[0].length;
        tokens.push(token('color', color[0]));
        continue;
      }
      const name = raw.slice(pos).match(/^[A-Za-z_][\w]*/);
      if (name) {
        pos += name[0].length;
        tokens.push(token('name', name[0]));
        continue;
      }
      const operator = raw
        .slice(pos)
        .match(/^(?:=>|:=|\+=|-=|\*=|\/=|%=|==|!=|<=|>=|[()[\],.?:+*/%<>=\-])/);
      if (!operator)
        throw new CompileError('syntax', line, `Unexpected character ${character}.`, pos + 1);
      pos += operator[0].length;
      tokens.push(token('punct', operator[0]));
    }
    if (!tokens.length) continue;
    // Operators may start a wrapped line, e.g. a ternary's ':' or an 'or'
    // chain. A unary +/- at block indentation still starts a new statement.
    const leadingContinuation =
      previous &&
      previous.text !== '=>' &&
      indentation > indents[indents.length - 1] &&
      [
        '?',
        ':',
        'and',
        'or',
        '*',
        '/',
        '%',
        '==',
        '!=',
        '<',
        '>',
        '<=',
        '>=',
        ...(indentation % 4 !== 0 ? ['+', '-'] : []),
      ].includes(tokens[0].text);
    if (continuing || delimiters.length > 0 || leadingContinuation) {
      if (version === 5 && indentation > 0 && indentation % 4 === 0)
        throw new CompileError(
          'syntax',
          previous?.line ?? logicalStart,
          'A continuation cannot use block indentation in Pine v5.',
        );
    } else {
      if (previous) result.push(layout('NEWLINE', previous.line));
      logicalStart = line;
      if (indentation > indents[indents.length - 1]) {
        if (indentation !== indents[indents.length - 1] + 4)
          throw new CompileError(
            'syntax',
            previous?.line ?? line,
            'Local blocks require four spaces or one tab.',
          );
        indents.push(indentation);
        result.push(layout('INDENT', line));
      } else {
        while (indentation < indents[indents.length - 1]) {
          indents.pop();
          result.push(layout('DEDENT', line));
        }
        if (indentation !== indents[indents.length - 1])
          throw new CompileError('syntax', line, 'Inconsistent indentation.');
      }
    }
    for (const token of tokens) {
      if (token.text === '(' || token.text === '[') delimiters.push(token);
      if (token.text === ')' || token.text === ']') {
        const opening = delimiters.pop();
        if (!opening || (token.text === ')' ? opening.text !== '(' : opening.text !== '['))
          throw new CompileError('syntax', line, 'Unmatched closing delimiter.', token.column);
      }
      result.push(token);
    }
    previous = tokens[tokens.length - 1];
    continuing = [
      '?',
      ':',
      '+',
      '-',
      '*',
      '/',
      '%',
      'and',
      'or',
      '=',
      ':=',
      '+=',
      '-=',
      ',',
      '<',
      '>',
      '<=',
      '>=',
      '==',
      '!=',
    ].includes(previous.text);
  }
  if (delimiters.length)
    throw new CompileError('syntax', delimiters[0].line, `Unclosed ${delimiters[0].text}.`);
  result.push(layout('NEWLINE', previous?.line ?? 1));
  while (indents.length > 1) {
    indents.pop();
    result.push(layout('DEDENT', lines.length));
  }
  result.push(layout('EOF', lines.length));
  return result;
}

import type { Assignment, Expression, Node, Parameter, Program, Statement } from './ast.ts';
import { CompileError, tokenize, type Token } from './lexer.ts';

const precedence: Record<string, number> = {
  or: 1,
  and: 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

export class Parser {
  tokens: Token[];
  cursor = 0;
  nextId = 1;
  version: 5 | 6;
  constructor(source: string, version: 5 | 6) {
    this.version = version;
    this.tokens = tokenize(source, version);
  }
  current(): Token {
    return this.tokens[this.cursor];
  }
  at(text: string): boolean {
    return this.current().text === text;
  }
  eat(text: string): boolean {
    if (this.at(text)) {
      this.cursor++;
      return true;
    }
    return false;
  }
  take(): Token {
    return this.tokens[this.cursor++];
  }
  expect(text: string): Token {
    if (!this.at(text)) this.error(`Expected ${text}, found ${this.current().text}.`);
    return this.take();
  }
  error(message: string, token = this.current()): never {
    throw new CompileError('syntax', token.line, message, token.column);
  }
  loc(token: Token | Node): Node {
    return { id: this.nextId++, line: token.line, column: token.column };
  }
  name(): string {
    return this.identifier(this.take());
  }
  identifier(token: Token): string {
    if (token.kind !== 'name') this.error('Expected an identifier.', token);
    if (token.text === 'as') this.error('The import keyword as cannot be an identifier.', token);
    return token.text;
  }
  parse(): Program {
    const start = this.current();
    return {
      ...this.loc(start),
      kind: 'program',
      version: this.version,
      body: this.statements('EOF'),
    };
  }
  statements(end: string): Statement[] {
    const result: Statement[] = [];
    while (!this.at(end) && !this.at('EOF')) {
      if (this.eat('NEWLINE') || this.eat(',')) continue;
      result.push(this.statement());
      if (
        !this.at('NEWLINE') &&
        !this.at(end) &&
        !this.at(',') &&
        !this.at('EOF') &&
        this.tokens[this.cursor - 1]?.text !== 'DEDENT'
      )
        this.error('Expected end of statement.');
    }
    return result;
  }
  block(): Statement[] {
    this.expect('NEWLINE');
    this.expect('INDENT');
    const body = this.statements('DEDENT');
    this.expect('DEDENT');
    return body;
  }
  inlineBody(): Statement[] {
    return this.at('NEWLINE') ? this.block() : [this.statement()];
  }
  typeName(): string {
    let result = this.name();
    while (this.eat('.')) result += `.${this.name()}`;
    if (this.eat('<')) {
      const args: string[] = [];
      do {
        args.push(this.typeName());
      } while (this.eat(','));
      this.expect('>');
      result += `<${args.join(',')}>`;
    }
    if (this.at('[') && this.tokens[this.cursor + 1]?.text === ']') {
      this.cursor += 2;
      result = `array<${result}>`;
    }
    return result;
  }
  parameter(): Parameter {
    let qualifier: string | undefined;
    if (['simple', 'series', 'const', 'input'].includes(this.current().text))
      qualifier = this.take().text;
    let type: string | undefined;
    const first = this.typeName();
    let name = first;
    if (this.current().kind === 'name') {
      type = first;
      name = this.name();
    }
    const value = this.eat('=') ? this.expression() : undefined;
    return { name, type, qualifier, default: value };
  }
  isFunction(): boolean {
    let p = this.cursor;
    if (this.tokens[p]?.kind !== 'name' || this.tokens[p + 1]?.text !== '(') return false;
    p += 2;
    let depth = 1;
    while (p < this.tokens.length && depth) {
      if (this.tokens[p].text === '(') depth++;
      if (this.tokens[p].text === ')') depth--;
      p++;
    }
    return this.tokens[p]?.text === '=>';
  }
  statement(): Statement {
    const token = this.current();
    const exported = this.eat('export');
    if (this.eat('type')) {
      const name = this.name();
      this.expect('NEWLINE');
      this.expect('INDENT');
      const fields: Parameter[] = [];
      while (!this.at('DEDENT') && !this.at('EOF')) {
        if (this.eat('NEWLINE')) continue;
        fields.push(this.parameter());
        this.expect('NEWLINE');
      }
      this.expect('DEDENT');
      return { ...this.loc(token), kind: 'type', name, fields, exported };
    }
    if (this.eat('enum')) {
      const name = this.name();
      this.expect('NEWLINE');
      this.expect('INDENT');
      const fields: { name: string; title?: string }[] = [];
      while (!this.at('DEDENT') && !this.at('EOF')) {
        if (this.eat('NEWLINE')) continue;
        const field = this.name();
        let title: string | undefined;
        if (this.eat('=')) {
          if (this.current().kind !== 'string') this.error('Enum titles must be strings.');
          title = this.take().value;
        }
        fields.push({ name: field, title });
        this.expect('NEWLINE');
      }
      this.expect('DEDENT');
      return { ...this.loc(token), kind: 'enum', name, fields };
    }
    const method = this.eat('method');
    if (this.isFunction()) {
      const name = this.name();
      this.expect('(');
      const params: Parameter[] = [];
      if (!this.at(')'))
        do {
          params.push(this.parameter());
        } while (this.eat(','));
      this.expect(')');
      this.expect('=>');
      return {
        ...this.loc(token),
        kind: 'function',
        name,
        params,
        body: this.inlineBody(),
        method,
        exported,
      };
    }
    if (exported || method) this.error('Expected a function or type declaration.', token);
    if (this.eat('import'))
      throw new CompileError(
        'unsupported',
        token.line,
        'Published library imports are not supported.',
      );
    if (this.eat('for')) {
      const names: string[] = [];
      if (this.eat('[')) {
        do {
          names.push(this.name());
        } while (this.eat(','));
        this.expect(']');
      } else names.push(this.name());
      if (this.eat('in')) {
        const iterable = this.expression();
        return { ...this.loc(token), kind: 'forIn', names, iterable, body: this.block() };
      }
      this.expect('=');
      const from = this.expression();
      this.expect('to');
      const to = this.expression();
      const step = this.eat('by') ? this.expression() : undefined;
      return {
        ...this.loc(token),
        kind: 'for',
        name: names[0],
        from,
        to,
        step,
        body: this.block(),
      };
    }
    if (this.eat('while')) {
      const test = this.expression();
      return { ...this.loc(token), kind: 'while', test, body: this.block() };
    }
    if (this.eat('break')) return { ...this.loc(token), kind: 'break' };
    if (this.eat('continue')) return { ...this.loc(token), kind: 'continue' };
    const saved = this.cursor;
    let mode: 'default' | 'var' | 'varip' = 'default';
    if (this.at('var') || this.at('varip')) mode = this.take().text as 'var' | 'varip';
    let qualifier: 'const' | 'input' | 'simple' | 'series' | undefined;
    if (
      ['const', 'input', 'simple', 'series'].includes(this.current().text) &&
      this.tokens[this.cursor + 1]?.kind === 'name'
    )
      qualifier = this.take().text as typeof qualifier;
    if (this.current().kind === 'name' && !['if', 'switch', 'not'].includes(this.current().text)) {
      // An explicit type may have generic parameters; only commit if followed by a name and '='.
      try {
        const first = this.typeName();
        let type: string | undefined;
        let name = first;
        if (this.current().kind === 'name') {
          type = first;
          name = this.name();
        }
        if (this.eat('='))
          return {
            ...this.loc(token),
            kind: 'declaration',
            names: [name],
            type,
            qualifier,
            mode,
            value: this.expression(),
          };
      } catch (error) {
        if (!(error instanceof CompileError)) throw error;
      }
      this.cursor = saved;
    } else this.cursor = saved;
    const expression = this.expression();
    if (this.eat('=')) {
      if (expression.kind !== 'tuple' || expression.elements.some((e) => e.kind !== 'identifier'))
        this.error('Invalid declaration target.', token);
      return {
        ...this.loc(token),
        kind: 'declaration',
        names: expression.elements.map((e) => (e as { name: string }).name),
        mode: 'default',
        value: this.expression(),
      };
    }
    if ([':=', '+=', '-=', '*=', '/=', '%='].includes(this.current().text)) {
      const operator = this.take().text as Assignment['operator'];
      return {
        ...this.loc(token),
        kind: 'assignment',
        target: expression,
        operator,
        value: this.expression(),
      };
    }
    return { ...this.loc(token), kind: 'expression', expression };
  }
  expression(minimum = 0): Expression {
    let left = this.prefix();
    while (true) {
      const operator = this.current().text;
      const power = precedence[operator];
      if (power === undefined || power < minimum) break;
      this.take();
      const right = this.expression(power + 1);
      left = { ...this.loc(left), kind: 'binary', operator, left, right };
    }
    if (minimum === 0 && this.eat('?')) {
      const consequent = this.expression();
      this.expect(':');
      const alternate = this.expression();
      left = { ...this.loc(left), kind: 'conditional', test: left, consequent, alternate };
    }
    return left;
  }
  prefix(): Expression {
    const token = this.take();
    let expression: Expression;
    if (['+', '-', 'not'].includes(token.text))
      return {
        ...this.loc(token),
        kind: 'unary',
        operator: token.text,
        argument: this.expression(7),
      };
    if (token.text === 'if') {
      const test = this.expression();
      const consequent = this.block();
      let alternate: Statement[] = [];
      if (this.eat('else'))
        alternate = this.at('if')
          ? [{ ...this.loc(this.current()), kind: 'expression', expression: this.prefix() }]
          : this.block();
      return { ...this.loc(token), kind: 'if', test, consequent, alternate };
    }
    if (token.text === 'switch') {
      const value = this.at('NEWLINE') ? undefined : this.expression();
      this.expect('NEWLINE');
      this.expect('INDENT');
      const cases: { test?: Expression; body: Statement[] }[] = [];
      while (!this.at('DEDENT') && !this.at('EOF')) {
        if (this.eat('NEWLINE')) continue;
        const test = this.at('=>') ? undefined : this.expression();
        this.expect('=>');
        cases.push({ test, body: this.inlineBody() });
      }
      this.expect('DEDENT');
      return { ...this.loc(token), kind: 'switch', expression: value, cases };
    }
    if (token.kind === 'number')
      expression = {
        ...this.loc(token),
        kind: 'literal',
        value: Number(token.text),
        valueType: /[.eE]/.test(token.text) ? 'float' : 'int',
      };
    else if (token.kind === 'string')
      expression = {
        ...this.loc(token),
        kind: 'literal',
        value: token.value!,
        valueType: 'string',
      };
    else if (token.kind === 'color')
      expression = { ...this.loc(token), kind: 'literal', value: token.text, valueType: 'color' };
    else if (token.text === 'true' || token.text === 'false')
      expression = {
        ...this.loc(token),
        kind: 'literal',
        value: token.text === 'true',
        valueType: 'bool',
      };
    else if (token.text === 'na' && !this.at('('))
      expression = { ...this.loc(token), kind: 'literal', value: null, valueType: 'na' };
    else if (token.kind === 'name')
      expression = { ...this.loc(token), kind: 'identifier', name: this.identifier(token) };
    else if (token.text === '(') {
      expression = this.expression();
      this.expect(')');
    } else if (token.text === '[') {
      const elements: Expression[] = [];
      if (!this.at(']'))
        do {
          elements.push(this.expression());
        } while (this.eat(','));
      this.expect(']');
      expression = { ...this.loc(token), kind: 'tuple', elements };
    } else this.error(`Expected an expression, found ${token.text}.`, token);
    while (true) {
      if (this.eat('.'))
        expression = {
          ...this.loc(expression),
          kind: 'member',
          object: expression,
          property: this.name(),
        };
      else if (this.eat('[')) {
        const offset = this.expression();
        this.expect(']');
        expression = { ...this.loc(expression), kind: 'history', object: expression, offset };
      } else {
        let typeArgs: string[] = [];
        if (this.at('<')) {
          const saved = this.cursor;
          try {
            this.take();
            do {
              typeArgs.push(this.typeName());
            } while (this.eat(','));
            this.expect('>');
            if (!this.at('(')) {
              this.cursor = saved;
              typeArgs = [];
            }
          } catch (error) {
            if (!(error instanceof CompileError)) throw error;
            this.cursor = saved;
            typeArgs = [];
          }
        }
        if (!this.eat('(')) break;
        const args: { name?: string; value: Expression }[] = [];
        let named = false;
        if (!this.at(')'))
          do {
            let name: string | undefined;
            if (this.current().kind === 'name' && this.tokens[this.cursor + 1]?.text === '=') {
              name = this.name();
              this.expect('=');
              named = true;
            } else if (named)
              this.error('Positional arguments cannot follow named arguments.', token);
            args.push({ name, value: this.expression() });
          } while (this.eat(','));
        this.expect(')');
        expression = { ...this.loc(expression), kind: 'call', callee: expression, args, typeArgs };
      }
    }
    return expression;
  }
}

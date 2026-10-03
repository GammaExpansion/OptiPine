import type {
  Expression,
  FunctionDeclaration,
  Program,
  Statement,
  TypeDeclaration,
} from '../compiler/ast.ts';
import { qualifiedName } from '../compiler/ast.ts';
import type {
  Diagnostic,
  EquityRunResult,
  RunInput,
  RunResult,
  RunWarning,
  SymbolInfo,
} from '../types.ts';
import { resolveSymbolInfo } from './symbol-info.ts';
import { Broker } from '../broker/broker.ts';
import { color, colors, pure } from './builtins.ts';
import { state, technical, type State, type TAContext } from './ta.ts';
import { missing, num } from './numeric.ts';
import { Clock } from './time.ts';
import { Scope } from './scope.ts';
import { checkpoint, MutationJournal } from './rollback.ts';
import { assertReadable, ignoredEffect, effectResult } from './effects.ts';
import { EnumRegistry } from './enums.ts';
import { chartPoint } from './chart-point.ts';

/** Evaluations and statements per bar before a script is stopped as runaway. */
const STEP_LIMIT = 2_000_000;

class Flow {
  kind: 'break' | 'continue';
  constructor(kind: 'break' | 'continue') {
    this.kind = kind;
  }
}

/** One interpreter instance owns every mutable object in an independent run. */
class Interpreter {
  program: Program;
  input: RunInput;
  clock: Clock;
  root = new Scope('root');
  scopes = new Map<string, Scope>();
  functions = new Map<string, FunctionDeclaration>();
  types = new Map<string, TypeDeclaration>();
  states = new Map<string, State>();
  historyNodes = new Set<number>();
  functionHistoryNames = new Map<Statement[], Set<string>>();
  constants = new Map<string, Expression>();
  plots = new Map<string, RunResult['plots'][number]>();
  warnings = new Map<string, RunWarning>();
  enums = new EnumRegistry();
  broker?: Broker;
  /** Validated once per run; the broker, clock and formatters read the same object. */
  syminfo: SymbolInfo;
  index = 0;
  steps = 0;
  activeLine = 1;
  journal?: MutationJournal;
  constructor(program: Program, input: RunInput) {
    this.program = program;
    this.syminfo = resolveSymbolInfo(input.syminfo);
    this.input = { ...input, syminfo: this.syminfo };
    this.clock = new Clock(this.input);
    const scan = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      if (node.kind === 'history') this.historyNodes.add(node.object.id);
      if (node.kind === 'function') this.functions.set(node.name, node);
      if (node.kind === 'type') this.types.set(node.name, node);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(scan);
        else if (value && typeof value === 'object') scan(value);
      }
    };
    scan(program);
    for (const statement of program.body)
      if (
        statement.kind === 'declaration' &&
        statement.mode === 'default' &&
        this.constantInteger(statement.value)
      )
        for (const name of statement.names) this.constants.set(name, statement.value);
    if (
      program.body.some(
        (s) =>
          s.kind === 'expression' &&
          s.expression.kind === 'call' &&
          qualifiedName(s.expression.callee) === 'strategy',
      )
    )
      this.broker = new Broker(this.input, program.version);
  }
  scope(parent: Scope, id: number | string): Scope {
    const key = `${parent.key}/${id}`;
    let scope = this.scopes.get(key);
    if (!scope) {
      scope = new Scope(key, parent);
      this.scopes.set(key, scope);
    }
    return scope;
  }
  state(scope: Scope, id: string | number): State {
    const key = `${scope.key}/${id}`;
    if (!this.states.has(key)) this.states.set(key, state());
    return this.states.get(key)!;
  }
  constantInteger(node: Expression): boolean {
    if (node.kind === 'literal') return node.valueType === 'int';
    if (node.kind === 'unary' && node.operator !== 'not')
      return this.constantInteger(node.argument);
    if (node.kind === 'binary' && ['+', '-', '*', '/', '%'].includes(node.operator))
      return this.constantInteger(node.left) && this.constantInteger(node.right);
    return node.kind === 'identifier' && this.constants.has(node.name);
  }
  truth(value: any): boolean {
    assertReadable(value);
    return !missing(value) && Boolean(value);
  }
  binary(operator: string, left: any, right: any): any {
    assertReadable(left);
    assertReadable(right);
    if (operator === 'and')
      return this.program.version === 5 && (missing(left) || missing(right))
        ? left === false || right === false
          ? false
          : NaN
        : this.truth(left) && this.truth(right);
    if (operator === 'or')
      return this.program.version === 5 && (missing(left) || missing(right))
        ? left === true || right === true
          ? true
          : NaN
        : this.truth(left) || this.truth(right);
    if (missing(left) || missing(right))
      return ['==', '!=', '>', '<', '>=', '<='].includes(operator) && this.program.version === 6
        ? false
        : NaN;
    switch (operator) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        return right === 0 ? NaN : left / right;
      case '%':
        return right === 0 ? NaN : left % right;
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      case '>':
        return left > right;
      case '<':
        return left < right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
      default:
        throw new Error(`Unknown operator ${operator}`);
    }
  }
  /** Statements count too, so a loop body without expressions cannot spin past the budget. */
  step(): void {
    if (++this.steps > STEP_LIMIT)
      throw Object.assign(new Error('Execution step limit exceeded on one bar'), { kind: 'limit' });
  }
  evaluate(node: Expression, scope: Scope): any {
    this.activeLine = node.line;
    this.step();
    const value = this.evaluateInner(node, scope);
    if (this.historyNodes.has(node.id)) scope.currentExpressions.set(node.id, value);
    return value;
  }
  evaluateInner(node: Expression, scope: Scope): any {
    switch (node.kind) {
      case 'literal':
        return node.valueType === 'na'
          ? NaN
          : node.valueType === 'color'
            ? color(parseInt(String(node.value).replace('#', '').slice(0, 6), 16))
            : node.value;
      case 'identifier': {
        const binding = scope.find(node.name);
        return binding ? binding.value : this.global(node.name, scope);
      }
      case 'member': {
        const name = qualifiedName(node);
        if (name && !scope.find(name.split('.')[0])) return this.global(name, scope);
        const object = this.evaluate(node.object, scope);
        assertReadable(object);
        return missing(object) ? NaN : (object[node.property] ?? NaN);
      }
      case 'tuple':
        return node.elements.map((x) => this.evaluate(x, scope));
      case 'unary': {
        const v = this.evaluate(node.argument, scope);
        return node.operator === 'not' ? !this.truth(v) : node.operator === '-' ? -num(v) : num(v);
      }
      case 'binary': {
        const left = this.evaluate(node.left, scope);
        if (this.program.version === 6 && node.operator === 'and' && !this.truth(left))
          return false;
        if (this.program.version === 6 && node.operator === 'or' && this.truth(left)) return true;
        const value = this.binary(node.operator, left, this.evaluate(node.right, scope));
        return node.operator === '/' &&
          this.program.version === 5 &&
          this.constantInteger(node.left) &&
          this.constantInteger(node.right)
          ? Math.trunc(value)
          : value;
      }
      case 'conditional':
        return this.evaluate(
          this.truth(this.evaluate(node.test, scope)) ? node.consequent : node.alternate,
          scope,
        );
      case 'history': {
        const offset = Math.trunc(num(this.evaluate(node.offset, scope)));
        if (missing(offset) || offset < 0)
          throw new Error('History offset must be a nonnegative integer');
        const value = this.evaluate(node.object, scope);
        if (offset === 0) return value;
        const name = qualifiedName(node.object),
          binding = name && node.object.kind === 'identifier' ? scope.find(name) : undefined;
        let functionScope: Scope | undefined = scope;
        while (functionScope && !functionScope.functionHistory)
          functionScope = functionScope.parent;
        const captured =
          name &&
          ((binding && binding === this.root.find(name)) || (!binding && name === 'bar_index'))
            ? functionScope?.functionHistory?.vars.get(name)
            : undefined;
        if (captured)
          return (
            captured.history[captured.history.length - offset] ??
            (captured.type === 'bool' && this.program.version === 6 ? false : NaN)
          );
        if (binding)
          return (
            binding.history[binding.history.length - offset] ??
            (binding.type === 'bool' && this.program.version === 6 ? false : NaN)
          );
        if (
          name &&
          [
            'open',
            'high',
            'low',
            'close',
            'volume',
            'hl2',
            'hlc3',
            'ohlc4',
            'time',
            'bar_index',
          ].includes(name)
        )
          return this.barValue(name, this.index - offset);
        const history = scope.expressions.get(node.object.id) ?? [];
        return history[history.length - offset] ?? NaN;
      }
      case 'if': {
        const branch = this.truth(this.evaluate(node.test, scope))
          ? node.consequent
          : node.alternate;
        return this.block(
          branch,
          this.scope(scope, `${node.id}/${branch === node.consequent ? 'yes' : 'no'}`),
          true,
        );
      }
      case 'switch': {
        const value = node.expression ? this.evaluate(node.expression, scope) : undefined;
        assertReadable(value);
        for (let i = 0; i < node.cases.length; i++) {
          const entry = node.cases[i];
          const candidate = entry.test ? this.evaluate(entry.test, scope) : undefined;
          assertReadable(candidate);
          if (!entry.test || (node.expression ? candidate === value : this.truth(candidate)))
            return this.block(entry.body, this.scope(scope, `${node.id}/${i}`), true);
        }
        return NaN;
      }
      case 'call':
        return this.call(node, scope);
    }
  }
  barValue(name: string, index = this.index): number | undefined {
    const b = this.input.bars[index];
    if (!b) return NaN;
    switch (name) {
      case 'open':
      case 'high':
      case 'low':
      case 'close':
      case 'volume':
        return b[name];
      case 'bar_index':
        return index;
      case 'time':
        return b.time * 1000;
      case 'hl2':
        return (b.high + b.low) / 2;
      case 'hlc3':
        return (b.high + b.low + b.close) / 3;
      case 'ohlc4':
        return (b.open + b.high + b.low + b.close) / 4;
      case 'hlcc4':
        return (b.high + b.low + 2 * b.close) / 4;
      default:
        return undefined;
    }
  }
  global(name: string, scope: Scope): any {
    const bar = this.barValue(name);
    if (bar !== undefined) return bar;
    if (
      this.broker &&
      this.input.strategyClosePending &&
      !this.input.realtimeTail &&
      [
        'barstate.isconfirmed',
        'barstate.ishistory',
        'barstate.isrealtime',
        'barstate.isnew',
        'barstate.islastconfirmedhistory',
      ].includes(name)
    )
      throw Object.assign(new Error('Bar states at a pending strategy close are not implemented'), {
        kind: 'unsupported',
      });
    const time = this.clock.get(name, this.program.version);
    if (time !== undefined) return time;
    if (name.startsWith('syminfo.')) return this.syminfo[name.slice(8)] ?? NaN;
    if (name.startsWith('strategy.')) {
      const value = this.broker?.get(name);
      if (value !== undefined) return value;
      return name;
    }
    if (name.startsWith('dayofweek.'))
      return (
        ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(
          name.slice(10),
        ) + 1
      );
    if (name.startsWith('math.'))
      return (
        { pi: Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2, rphi: (Math.sqrt(5) - 1) / 2 } as any
      )[name.slice(5)];
    if (name.startsWith('size.')) return name.slice(5);
    if (name.startsWith('color.')) {
      const c = name.slice(6);
      return color(
        this.program.version === 5 && ['red', 'yellow', 'teal'].includes(c)
          ? ({ red: 0xff5252, yellow: 0xffeb3b, teal: 0x00897b } as any)[c]
          : colors[c],
      );
    }
    if (name.startsWith('ta.')) {
      const s = this.state(this.root, `global:${name}`);
      if (s.bar !== this.index) {
        s.bar = this.index;
        s.value = technical(
          name.slice(3),
          name === 'ta.vwap' ? [this.barValue('hlc3')] : [],
          s,
          this.taContext(),
        );
      }
      return s.value;
    }
    if (
      /^(?:strategy|order|currency|format|display|plot|hline|location|shape|size|text|font|position|barmerge|adjustment|session|extend|line|label|box|table|xloc|yloc|alert|scale)\./.test(
        name,
      )
    )
      return name;
    if (name === 'na') return NaN;
    throw Object.assign(new Error(`Unknown identifier ${name}`), { kind: 'unsupported' });
  }
  taContext(): TAContext {
    const clock = this.clock;
    return {
      bar: this.input.bars[this.index],
      previous: this.input.bars[this.index - 1],
      // Only ta.vwap reads the anchor; resolving it eagerly cost a time zone
      // day-boundary lookup on every ta.* call of every bar.
      get vwapAnchor() {
        return clock.vwapAnchor();
      },
    };
  }
  call(node: Extract<Expression, { kind: 'call' }>, scope: Scope): any {
    const name = node.resolvedName ?? qualifiedName(node.callee) ?? '';
    const positional: any[] = [],
      named: Record<string, any> = {};
    for (const arg of node.args) {
      const value = this.evaluate(arg.value, scope);
      if (arg.name) named[arg.name] = value;
      else positional.push(value);
    }
    if (node.implicitReceiver && node.callee.kind === 'member')
      positional.unshift(this.evaluate(node.callee.object, scope));
    const fn = this.functions.get(name);
    if (fn) {
      const local = this.scope(this.root, `${scope.key}/call${node.id}`);
      const body = node.specializedBody ?? fn.body;
      let names = this.functionHistoryNames.get(body);
      if (!names) {
        names = new Set<string>();
        const scan = (expression: any): void => {
          if (!expression || typeof expression !== 'object') return;
          if (expression.kind === 'history' && expression.object.kind === 'identifier')
            names!.add(expression.object.name);
          for (const value of Object.values(expression)) {
            if (Array.isArray(value)) value.forEach(scan);
            else if (value && typeof value === 'object') scan(value);
          }
        };
        body.forEach(scan);
        this.functionHistoryNames.set(body, names);
      }
      // Captured global series are sampled once per invocation, even if a
      // nested branch skips the reference. Native OHLCV retains bar history.
      const history = (local.functionHistory ??= this.scope(local, 'history'));
      for (const name of names) {
        const binding = this.root.find(name);
        if (binding) history.set(name, binding.value, binding.type);
        else if (name === 'bar_index') history.set(name, this.index, 'int');
      }
      fn.params.forEach((p, i) =>
        local.set(
          p.name,
          named[p.name] ?? positional[i] ?? (p.default ? this.evaluate(p.default, scope) : NaN),
          p.type,
        ),
      );
      try {
        return this.block(body, local, true);
      } finally {
        history.commit();
      }
    }
    if (name.endsWith('.new') && this.types.has(name.slice(0, -4))) {
      const type = this.types.get(name.slice(0, -4))!;
      const obj: Record<string, any> = {};
      type.fields.forEach(
        (f, i) =>
          (obj[f.name] =
            named[f.name] ?? positional[i] ?? (f.default ? this.evaluate(f.default, scope) : NaN)),
      );
      return obj;
    }
    if (name === 'indicator' || name === 'library') return null;
    if (name === 'strategy') {
      if (this.index === 0) {
        this.broker!.configure(named);
        const settings = this.broker!.settings;
        // Fills with these settings differ from standard OHLC fills; refuse rather than approximate.
        if (settings.use_bar_magnifier === true)
          throw Object.assign(new Error('Bar magnifier requires lower-timeframe data'), {
            kind: 'unsupported',
          });
        if (
          this.input.strategyClosePending &&
          (settings.calc_on_every_tick === true ||
            settings.calc_on_order_fills === true ||
            settings.process_orders_on_close === true ||
            settings.fill_delay === 'None')
        )
          throw Object.assign(
            new Error(
              'Pending strategy close supports next-tick orders without extra recalculation only',
            ),
            {
              kind: 'unsupported',
            },
          );
      }
      return null;
    }
    if (name.startsWith('strategy.')) return this.broker!.call(name, positional, named);
    if (name === 'plot' || name === 'plotchar' || name === 'plotshape') {
      const key = `${scope.key}/${node.id}`;
      let plot = this.plots.get(key);
      if (!plot) {
        plot = {
          title: String(named.title ?? positional[1] ?? 'Plot'),
          values: Array(this.input.bars.length).fill(null),
        };
        this.plots.set(key, plot);
      }
      const value = positional[0] ?? named.series;
      assertReadable(value);
      plot.values[this.index] = missing(value) ? null : value;
      return key;
    }
    if (ignoredEffect(name)) {
      const key = `${node.line}/${name}`;
      if (!this.warnings.has(key))
        this.warnings.set(key, {
          code: 'ignored-effect',
          line: node.line,
          function: name,
          message: `${name} is ignored during execution.`,
        });
      return effectResult(name);
    }
    // Collection containers may carry opaque IDs. Other calls may not inspect them,
    // including arguments supplied by name instead of position.
    if (name === 'na') return missing(positional[0] ?? named.x);
    const matrixStorage = /^matrix\.(new|set|fill)$/.test(name);
    if (!name.startsWith('array.') && !name.startsWith('map.') && !matrixStorage) {
      positional.forEach(assertReadable);
      Object.values(named).forEach(assertReadable);
    }
    if (/^array\.(includes|indexof|lastindexof|binary_search\w*)$/.test(name)) {
      if (Array.isArray(positional[0])) positional[0].forEach(assertReadable);
      assertReadable(positional[1]);
      Object.values(named).forEach(assertReadable);
    }
    if (name.startsWith('chart.point.'))
      return chartPoint(name.slice(12), positional, named, this.input.bars[this.index], this.index);
    if (name === 'input' || name.startsWith('input.')) {
      const title = named.title ?? positional[1],
        defval = named.defval ?? positional[0];
      // Titles are script-chosen keys: read own properties only, so "constructor"
      // or "__proto__" never resolve to Object.prototype members.
      const inputs = this.input.inputs;
      const override = inputs && Object.hasOwn(inputs, title) ? inputs[title] : undefined;
      if (name === 'input.enum')
        return this.enums.input(defval, override, named.options ?? positional[2]);
      if (name === 'input.source' && typeof override === 'string') return this.barValue(override);
      return override ?? defval;
    }
    const clock = this.clock.call(name, [...positional]);
    if (clock !== undefined) return clock;
    const s = this.state(scope, node.id);
    if (name.startsWith('ta.') || name === 'math.sum')
      return technical(
        name === 'math.sum' ? 'sum' : name.slice(3),
        positional,
        s,
        this.taContext(),
      );
    if (name === 'runtime.error') throw new Error(String(positional[0]));
    return pure(
      name,
      positional,
      named,
      this.program.version,
      this.syminfo.mintick,
      s,
      this.journal,
    );
  }
  block(body: Statement[], scope: Scope, commit = false): any {
    let result: any = NaN;
    try {
      for (const statement of body) result = this.statement(statement, scope);
      return result;
    } finally {
      if (commit) scope.commit();
    }
  }
  statement(node: Statement, scope: Scope): any {
    this.activeLine = node.line;
    this.step();
    switch (node.kind) {
      case 'expression':
        return this.evaluate(node.expression, scope);
      case 'declaration': {
        if (node.mode !== 'default' && scope.vars.has(node.names[0])) {
          for (const name of node.names) scope.touched.add(scope.vars.get(name)!);
          return scope.vars.get(node.names[0])!.value;
        }
        const value = this.evaluate(node.value, scope);
        node.names.forEach((name, i) => {
          if (name !== '_') {
            const binding = scope.set(name, node.names.length === 1 ? value : value[i], node.type);
            binding.persistent = node.mode === 'varip';
            if (binding.persistent) this.journal?.retain(binding.value);
          }
        });
        return value;
      }
      case 'assignment': {
        const value = this.evaluate(node.value, scope);
        if (node.target.kind === 'identifier') {
          const binding = scope.find(node.target.name);
          if (!binding) throw new Error(`Assignment to unknown variable ${node.target.name}`);
          binding.value =
            node.operator === ':=' ? value : this.binary(node.operator[0], binding.value, value);
          if (binding.persistent) this.journal?.retain(binding.value);
          let owner: Scope | undefined = scope;
          while (owner && !owner.vars.has(node.target.name)) owner = owner.parent;
          owner!.touched.add(binding);
          return binding.value;
        }
        if (node.target.kind === 'member') {
          const object = this.evaluate(node.target.object, scope),
            key = node.target.property;
          assertReadable(object);
          this.journal?.capture(object);
          object[key] =
            node.operator === ':=' ? value : this.binary(node.operator[0], object[key], value);
          return object[key];
        }
        throw new Error('Unsupported assignment target');
      }
      case 'function':
      case 'type':
        return NaN;
      case 'enum':
        scope.set(node.name, this.enums.declare(node));
        return NaN;
      case 'break':
      case 'continue':
        throw new Flow(node.kind);
      case 'for': {
        const local = this.scope(scope, node.id),
          from = num(this.evaluate(node.from, scope)),
          initialTo = num(this.evaluate(node.to, scope)),
          step =
            Math.abs(num(node.step ? this.evaluate(node.step, scope) : 1)) *
            (from > initialTo ? -1 : 1);
        let result: any = NaN;
        if (!step || missing(from) || missing(initialTo)) return result;
        for (
          let i = from;
          step > 0
            ? i <= (this.program.version === 6 ? num(this.evaluate(node.to, scope)) : initialTo)
            : i >= (this.program.version === 6 ? num(this.evaluate(node.to, scope)) : initialTo);
          i += step
        ) {
          local.set(node.name, i, 'int');
          try {
            result = this.block(node.body, local, true);
          } catch (error) {
            if (!(error instanceof Flow)) throw error;
            if (error.kind === 'break') break;
          }
        }
        return result;
      }
      case 'forIn': {
        const items = this.evaluate(node.iterable, scope),
          local = this.scope(scope, node.id);
        let result: any = NaN,
          i = 0;
        for (const item of items) {
          if (node.names.length === 1) local.set(node.names[0], item);
          else {
            local.set(node.names[0], i);
            local.set(node.names[1], item);
          }
          try {
            result = this.block(node.body, local, true);
          } catch (error) {
            if (!(error instanceof Flow)) throw error;
            if (error.kind === 'break') break;
          }
          i++;
        }
        return result;
      }
      case 'while': {
        const local = this.scope(scope, node.id);
        let result: any = NaN;
        while (this.truth(this.evaluate(node.test, scope))) {
          try {
            result = this.block(node.body, local, true);
          } catch (error) {
            if (!(error instanceof Flow)) throw error;
            if (error.kind === 'break') break;
          }
        }
        return result;
      }
    }
  }
  run(): RunResult {
    try {
      if (this.broker && this.input.strategyClosePending && this.input.bars.length < 2)
        throw Object.assign(
          new Error('Pending strategy close requires a preceding initialization bar'),
          {
            kind: 'unsupported',
          },
        );
      for (this.index = 0; this.index < this.input.bars.length; this.index++) {
        this.steps = 0;
        this.clock.setIndex(this.index);
        const historicalTicks =
          !!this.broker &&
          this.input.historicalTicks === true &&
          !(
            this.index === this.input.bars.length - 1 &&
            (this.input.strategyClosePending ?? this.input.realtimeTail ?? false)
          );
        // The declaration may enable callbacks during the first bar's close execution.
        const recalculate =
          !!this.broker &&
          (historicalTicks ||
            this.index === 0 ||
            this.broker.settings.calc_on_order_fills === true);
        const restore = recalculate ? checkpoint(this.root, this.scopes, this.states) : undefined;
        if (recalculate) {
          this.journal = new MutationJournal();
          for (const scope of [this.root, ...this.scopes.values()])
            for (const binding of scope.vars.values())
              if (binding.persistent) this.journal.retain(binding.value);
        }
        const rollback = () => {
          this.journal?.restore();
          restore?.();
          for (const plot of this.plots.values()) plot.values[this.index] = null;
        };
        const onFill = recalculate
          ? () => {
              rollback();
              this.block(this.program.body, this.root, true);
            }
          : undefined;
        const onTick = historicalTicks
          ? () => {
              rollback();
              this.block(this.program.body, this.root, true);
            }
          : undefined;
        this.broker?.beginBar(this.index, this.input.bars[this.index], onFill, onTick);
        const unclosedStrategyBar =
          this.broker &&
          (this.input.strategyClosePending ?? this.input.realtimeTail ?? false) &&
          this.index === this.input.bars.length - 1;
        if (unclosedStrategyBar && this.broker!.settings.calc_on_every_tick !== true) {
          this.broker!.endBar(onFill);
          this.journal = undefined;
          continue;
        }
        if (!historicalTicks) {
          if (recalculate) rollback();
          this.block(this.program.body, this.root, true);
        }
        this.broker?.endBar(onFill);
        this.journal = undefined;
      }
      return {
        plots: [...this.plots.values()],
        ...(this.broker?.result() ?? { trades: [], metrics: {} }),
        diagnostics: [],
        warnings: [...this.warnings.values()],
      };
    } catch (error) {
      const err = error as Error & { kind?: any };
      return {
        plots: [...this.plots.values()],
        ...(this.broker?.result() ?? { trades: [], metrics: {} }),
        diagnostics: [{ kind: diagnosticKind(err), line: this.activeLine, message: err.message }],
        warnings: [...this.warnings.values()],
      };
    }
  }
}

/**
 * Errors the engine raises on purpose are plain Errors. A TypeError, RangeError or
 * ReferenceError came from engine code itself and is reported as an engine fault
 * rather than as the script's runtime error.
 */
export function diagnosticKind(error: unknown): Diagnostic['kind'] {
  const tagged = error as { kind?: Diagnostic['kind'] } | null;
  if (tagged?.kind) return tagged.kind;
  return error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof ReferenceError
    ? 'internal'
    : 'runtime';
}

export function execute(program: Program, input: RunInput): RunResult {
  try {
    return new Interpreter(program, input).run();
  } catch (error) {
    return {
      plots: [],
      trades: [],
      metrics: {},
      diagnostics: [
        {
          kind: diagnosticKind(error),
          line: 1,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

/** Opt-in result enrichment; regular execution and sweep results keep their shape. */
export function executeWithEquity(program: Program, input: RunInput): EquityRunResult {
  try {
    const interpreter = new Interpreter(program, input);
    const result = interpreter.run();
    return {
      ...result,
      equity: result.diagnostics.length ? [] : (interpreter.broker?.equitySeries() ?? []),
    };
  } catch (error) {
    return {
      plots: [],
      trades: [],
      metrics: {},
      equity: [],
      diagnostics: [
        {
          kind: diagnosticKind(error),
          line: 1,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

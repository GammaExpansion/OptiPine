import type { Diagnostic } from '../types.ts';
import type {
  Call,
  Expression,
  FunctionDeclaration,
  Node,
  Program,
  Statement,
  TypeDeclaration,
} from './ast.ts';
import { qualifiedName } from './ast.ts';
import { CompileError } from './lexer.ts';

type Qualifier = 'const' | 'input' | 'simple' | 'series';
interface ValueType {
  base: string;
  qualifier: Qualifier;
  elements?: ValueType[];
  bindingQualifier?: Qualifier;
}
type Scope = Map<string, ValueType>;
const ranks: Qualifier[] = ['const', 'input', 'simple', 'series'];
const valueType = (base: string, qualifier: Qualifier = 'series'): ValueType => ({
  base,
  qualifier,
});
const qualify = (...values: ValueType[]): Qualifier =>
  ranks[Math.max(0, ...values.map((v) => ranks.indexOf(v.qualifier)))];
const numeric = (type: ValueType): boolean => ['int', 'float', 'na', 'unknown'].includes(type.base);
const cloneAst = <T>(value: T): T =>
  (Array.isArray(value)
    ? value.map(cloneAst)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneAst(child)]))
      : value) as T;

// Known Pine APIs are separate from runtime support: compilation does not promise execution.
const functions = new Set<string>();
const register = (namespace: string, names: string): void => {
  for (const name of names.split(' ')) functions.add(namespace ? `${namespace}.${name}` : name);
};
register(
  '',
  'indicator strategy library plot plotshape plotchar plotarrow plotcandle plotbar hline fill bgcolor barcolor alert alertcondition input na nz fixnan int float bool string color timestamp time time_close year month weekofyear dayofmonth dayofweek hour minute second max_bars_back',
);
register(
  'ta',
  'alma atr barssince bb bbw cci change cmo cog correlation cross crossover crossunder cum dev dmi ema falling highest highestbars hma kc kcw linreg lowest lowestbars macd max median mfi min mode mom percentile_linear_interpolation percentile_nearest_rank percentrank pivot_point_levels pivothigh pivotlow range rising rma roc rsi sar sma stdev stoch supertrend swma tr tsi valuewhen variance vwap vwma wma wpr',
);
register(
  'math',
  'abs acos asin atan avg ceil cos exp floor log log10 max min pow random round round_to_mintick sign sin sqrt sum tan todegrees toradians',
);
register(
  'str',
  'contains endswith format format_time length lower match pos repeat replace replace_all split startswith substring tonumber tostring trim upper',
);
register('color', 'new rgb from_gradient r g b t');
register(
  'input',
  'int float bool string text_area source color time price symbol timeframe session enum',
);
register(
  'array',
  'abs avg binary_search binary_search_leftmost binary_search_rightmost clear concat copy covariance fill first from get includes indexof insert join last lastindexof max median min mode new new_bool new_box new_color new_float new_int new_label new_line new_string new_table percentile_linear_interpolation percentile_nearest_rank percentrank pop push range remove reverse set shift size slice sort sort_indices standardize stdev sum unshift variance',
);
register(
  'matrix',
  'new set get rows columns transpose sum diff mult avg min max det trace row col copy add_row add_col remove_row remove_col fill concat reshape reverse sort swap_rows swap_columns pow inv pinv eigenvalues eigenvectors rank is_square is_identity is_diagonal is_antidiagonal is_symmetric is_antisymmetric is_binary is_stochastic',
);
register('map', 'new put put_all get contains keys values remove size clear copy');
for (const namespace of ['line', 'label', 'box', 'table', 'linefill', 'polyline'])
  register(namespace, 'new delete copy');
register(
  'line',
  'set_xy1 set_xy2 set_x1 set_x2 set_y1 set_y2 set_color set_width set_style set_extend set_xloc set_first_point set_second_point get_x1 get_x2 get_y1 get_y2 get_price',
);
register(
  'label',
  'set_text set_tooltip set_color set_textcolor set_style set_size set_xy set_x set_y set_xloc set_yloc set_point set_textalign set_text_font_family get_x get_y get_text',
);
register(
  'box',
  'set_bgcolor set_border_color set_border_style set_border_width set_bottom set_extend set_left set_lefttop set_right set_rightbottom set_text set_text_color set_text_halign set_text_size set_text_valign set_text_font_family set_text_wrap set_top set_top_left_point set_bottom_right_point get_top get_bottom get_left get_right',
);
register(
  'table',
  'cell clear merge_cells set_bgcolor set_border_color set_border_width set_frame_color set_frame_width set_position cell_set_bgcolor cell_set_height cell_set_text cell_set_text_color cell_set_text_halign cell_set_text_size cell_set_text_valign cell_set_text_font_family cell_set_tooltip cell_set_width',
);
register('linefill', 'set_color');
register('chart.point', 'new from_index from_time now copy');
register('log', 'info warning error');
register('runtime', 'error');
register(
  'request',
  'security security_lower_tf financial dividends splits earnings economic seed currency_rate',
);
register('timeframe', 'in_seconds from_seconds change');
register(
  'strategy',
  'entry exit order close close_all cancel cancel_all default_entry_qty convert_to_account convert_to_symbol',
);
register(
  'strategy.risk',
  'allow_entry_in max_drawdown max_position_size max_intraday_filled_orders max_intraday_loss max_cons_loss_days',
);
for (const namespace of ['strategy.opentrades', 'strategy.closedtrades'])
  register(
    namespace,
    'entry_id entry_price entry_bar_index entry_time entry_comment exit_id exit_price exit_bar_index exit_time exit_comment profit profit_percent size commission max_drawdown max_drawdown_percent max_runup max_runup_percent',
  );

const globals = new Map<string, ValueType>();
const variables = (
  namespace: string,
  names: string,
  base: string,
  qualifier: Qualifier = 'series',
): void => {
  for (const name of names.split(' '))
    globals.set(namespace ? `${namespace}.${name}` : name, valueType(base, qualifier));
};
variables('', 'open high low close volume hl2 hlc3 ohlc4 hlcc4', 'float');
variables(
  '',
  'bar_index last_bar_index time time_close time_tradingday timenow last_bar_time year month dayofmonth dayofweek weekofyear hour minute second',
  'int',
);
variables(
  'barstate',
  'isfirst islast ishistory isrealtime isnew isconfirmed islastconfirmedhistory',
  'bool',
);
variables('syminfo', 'mintick pointvalue pricescale minmove mincontract', 'float', 'simple');
variables(
  'syminfo',
  'ticker tickerid main_tickerid prefix type currency basecurrency session timezone description root volumetype sector industry country employees_total shareholders',
  'string',
  'simple',
);
variables('timeframe', 'multiplier', 'int', 'simple');
variables('timeframe', 'period main_period', 'string', 'simple');
variables(
  'timeframe',
  'isintraday isdaily isweekly ismonthly isdwm isseconds isminutes isticks',
  'bool',
  'simple',
);
variables('dayofweek', 'sunday monday tuesday wednesday thursday friday saturday', 'int', 'const');
variables(
  'session',
  'ismarket isfirstbar islastbar isfirstbar_regular islastbar_regular ispremarket ispostmarket',
  'bool',
);
variables('session', 'regular extended', 'string', 'const');
variables('ta', 'tr vwap obv accdist iii wad wvad nvi pvi pvt', 'float');
variables(
  'chart',
  'is_standard is_heikinashi is_kagi is_linebreak is_pnf is_range is_renko',
  'bool',
  'simple',
);
variables('chart', 'left_visible_bar_time right_visible_bar_time', 'int');
variables('chart', 'fg_color bg_color', 'color', 'input');
variables(
  'color',
  'aqua black blue fuchsia gray green lime maroon navy olive orange purple red silver teal white yellow',
  'color',
  'const',
);
variables('math', 'e pi phi rphi', 'float', 'const');
variables(
  'strategy',
  'position_size position_avg_price equity openprofit openprofit_percent netprofit netprofit_percent grossprofit grossloss max_drawdown max_runup initial_capital',
  'float',
);
variables(
  'strategy',
  'closedtrades opentrades wintrades losstrades eventrades margin_liquidation_price',
  'int',
);
variables('strategy', 'position_entry_name', 'string');
for (const [namespace, names] of Object.entries({
  strategy: 'long short fixed cash percent_of_equity',
  'strategy.direction': 'all long short',
  'strategy.commission': 'percent cash_per_contract cash_per_order',
  'strategy.oca': 'none cancel reduce',
  currency: 'NONE USD EUR GBP JPY AUD CAD CHF NZD HKD SEK NOK DKK SGD BTC ETH USDT',
  plot: 'style_line style_linebr style_stepline style_steplinebr style_area style_areabr style_columns style_histogram style_circles style_cross linestyle_solid linestyle_dashed linestyle_dotted',
  display: 'all none pane status_line data_window price_scale',
  format: 'inherit price volume percent mintick',
  position:
    'top_left top_center top_right middle_left middle_center middle_right bottom_left bottom_center bottom_right',
  shape:
    'xcross cross triangleup triangledown flag circle arrowup arrowdown labelup labeldown square diamond',
  location: 'abovebar belowbar top bottom absolute',
  size: 'auto tiny small normal large huge',
  extend: 'none left right both',
  xloc: 'bar_index bar_time',
  yloc: 'price abovebar belowbar',
  line: 'style_solid style_dotted style_dashed style_arrow_left style_arrow_right style_arrow_both',
  label:
    'style_none style_xcross style_cross style_triangleup style_triangledown style_flag style_circle style_arrowup style_arrowdown style_label_up style_label_down style_label_left style_label_right style_label_lower_left style_label_lower_right style_label_upper_left style_label_upper_right style_square style_diamond',
  hline: 'style_solid style_dotted style_dashed',
  order: 'ascending descending',
  alert: 'freq_all freq_once_per_bar freq_once_per_bar_close',
  text: 'align_left align_center align_right align_top align_bottom wrap_auto wrap_none',
  barmerge: 'gaps_on gaps_off lookahead_on lookahead_off',
  scale: 'none left right',
}))
  variables(namespace, names, 'enum', 'const');
variables('font', 'family_default family_monospace', 'string', 'const');
variables('size', 'auto tiny small normal large huge', 'string', 'const');

export class Checker {
  program: Program;
  scopes: Scope[] = [new Map()];
  functions = new Map<
    string,
    { declaration: FunctionDeclaration; result: ValueType; globals: Scope }
  >();
  types = new Map<string, TypeDeclaration>();
  enums = new Set<string>();
  scriptKind = '';
  declarationLine = 1;
  functionScope = -1;
  loopDepth = 0;
  constructor(program: Program) {
    this.program = program;
  }
  fail(kind: Diagnostic['kind'], node: Node, message: string): never {
    throw new CompileError(kind, node.line, message, node.column);
  }
  find(name: string): ValueType | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const found = this.scopes[i].get(name);
      if (found) return found;
    }
    // Availability applies to the Pine built-in, not user bindings or broker metadata.
    if (this.program.version === 5 && name === 'syminfo.mincontract') return undefined;
    return globals.get(name);
  }
  define(name: string, type: ValueType, node: Node): void {
    if (name === '_') return;
    const scope = this.scopes[this.scopes.length - 1];
    if (this.scopes.length === 1 && this.enums.has(name))
      this.fail('semantic', node, `${name} is already declared as an enum.`);
    if (scope.has(name)) this.fail('semantic', node, `${name} is already declared in this scope.`);
    scope.set(name, type);
  }
  run(): void {
    const declarations = this.program.body.filter(
      (s) =>
        s.kind === 'expression' &&
        s.expression.kind === 'call' &&
        ['indicator', 'strategy', 'library'].includes(qualifiedName(s.expression.callee) ?? ''),
    );
    // Pine attributes script-wide declaration errors to the script start in v5;
    // v6 points duplicate declarations at the second declaration instead.
    if (!declarations.length)
      throw new CompileError(
        'semantic',
        1,
        'A script requires one indicator(), strategy(), or library() declaration.',
      );
    if (declarations.length > 1)
      throw new CompileError(
        'semantic',
        this.program.version === 5 ? 1 : declarations[1].line,
        'A script must have exactly one declaration.',
      );
    const declaration = declarations[0];
    if (declaration.kind === 'expression' && declaration.expression.kind === 'call')
      this.scriptKind = qualifiedName(declaration.expression.callee)!;
    this.declarationLine = declaration.line;
    this.block(this.program.body, false);
  }
  compatible(expected: string, actual: ValueType): boolean {
    if (actual.base === 'unknown' || expected === 'unknown') return true;
    if (actual.base === 'na') return expected !== 'bool' || this.program.version === 5;
    if (expected === actual.base || (expected === 'float' && actual.base === 'int')) return true;
    return expected === 'bool' && this.program.version === 5 && numeric(actual);
  }
  condition(type: ValueType, node: Node): void {
    if (!this.compatible('bool', type))
      this.fail('type', node, 'This condition requires a boolean value.');
  }
  checkEnumTypes(left: ValueType, right: ValueType, node: Node): void {
    const containsEnum = (type: ValueType): boolean =>
      (type.base.match(/[A-Za-z_]\w*/g) ?? []).some((part) => this.enums.has(part));
    if (
      (containsEnum(left) || containsEnum(right)) &&
      left.base !== right.base &&
      !['na', 'unknown'].includes(left.base) &&
      !['na', 'unknown'].includes(right.base)
    )
      this.fail('type', node, 'Enum values require members of the same enum.');
    if (left.elements && right.elements)
      left.elements.forEach((element, index) => {
        const other = right.elements![index];
        if (other) this.checkEnumTypes(element, other, node);
      });
  }
  block(body: Statement[], nested = true): ValueType {
    if (nested) this.scopes.push(new Map());
    let result = valueType('na', 'const');
    for (const statement of body) result = this.statement(statement);
    if (nested) this.scopes.pop();
    return result;
  }
  statement(node: Statement): ValueType {
    switch (node.kind) {
      case 'declaration': {
        const type = this.expression(node.value);
        if (node.names.length > 1 && (!type.elements || type.elements.length !== node.names.length))
          this.fail('type', node, 'Tuple arity does not match the declaration.');
        if (node.type && !this.compatible(node.type, type))
          this.fail('type', node, `Cannot assign ${type.base} to ${node.type}.`);
        const reference =
          /^(array|matrix|map)</.test(type.base) ||
          ['line', 'label', 'box', 'table', 'linefill', 'polyline', 'chart.point'].includes(
            type.base,
          ) ||
          this.types.has(type.base);
        if (
          node.qualifier &&
          !(node.qualifier === 'const' && reference) &&
          ranks.indexOf(type.qualifier) > ranks.indexOf(node.qualifier)
        )
          this.fail('type', node, `Declaration requires ${node.qualifier} or weaker.`);
        node.names.forEach((name, i) =>
          this.define(
            name,
            type.elements?.[i] ?? {
              ...type,
              base: node.type ?? type.base,
              qualifier: reference ? 'series' : (node.qualifier ?? type.qualifier),
              bindingQualifier: node.qualifier,
            },
            node,
          ),
        );
        return type;
      }
      case 'assignment': {
        const target = this.expression(node.target);
        const value = this.expression(node.value);
        if (target.bindingQualifier === 'const')
          this.fail('semantic', node, 'Cannot reassign a const variable.');
        if (
          target.bindingQualifier &&
          ranks.indexOf(value.qualifier) > ranks.indexOf(target.bindingQualifier)
        )
          this.fail('type', node, `Assignment requires ${target.bindingQualifier} or weaker.`);
        if (node.target.kind !== 'identifier' && node.target.kind !== 'member')
          this.fail('semantic', node, 'Invalid assignment target.');
        if (node.target.kind === 'identifier') {
          const name = node.target.name;
          const bindingScope = this.scopes.findLastIndex((scope) => scope.has(name));
          if (bindingScope < 0) this.fail('semantic', node, `Cannot reassign builtin ${name}.`);
          if (this.functionScope >= 0 && bindingScope < this.functionScope)
            this.fail('semantic', node, 'Functions cannot reassign global variables.');
        }
        if (node.target.kind === 'member') {
          const name = qualifiedName(node.target);
          if (name && globals.has(name))
            this.fail('semantic', node, `Cannot reassign builtin ${name}.`);
          if (name && this.enums.has(name.split('.')[0]))
            this.fail('semantic', node, `Cannot reassign enum member ${name}.`);
        }
        if (!this.compatible(target.base, value))
          this.fail('type', node, `Cannot assign ${value.base} to ${target.base}.`);
        target.qualifier = qualify(target, value);
        return value;
      }
      case 'expression':
        return this.expression(node.expression);
      case 'function': {
        if (this.enums.has(node.name))
          this.fail('semantic', node, `${node.name} is already declared as an enum.`);
        if (this.scopes.length !== 1)
          this.fail('semantic', node, 'Functions must be declared in global scope.');
        this.scopes.push(new Map());
        this.functionScope = this.scopes.length - 1;
        for (const param of node.params) {
          const initial = param.default ? this.expression(param.default) : undefined;
          this.define(
            param.name,
            valueType(
              param.type ?? initial?.base ?? 'unknown',
              (param.qualifier as Qualifier) ?? 'series',
            ),
            node,
          );
        }
        const result = this.block(node.body, false);
        this.scopes.pop();
        this.functionScope = -1;
        this.functions.set(node.name, {
          declaration: node,
          result,
          globals: new Map(this.scopes[0]),
        });
        return valueType('function');
      }
      case 'type': {
        if (this.enums.has(node.name))
          this.fail('semantic', node, `${node.name} is already declared as an enum.`);
        this.types.set(node.name, node);
        for (const field of node.fields) if (field.default) this.expression(field.default);
        return valueType('type', 'const');
      }
      case 'enum': {
        if (this.scopes.length > 1)
          this.fail('semantic', node, 'Enums must be declared in global scope.');
        if (
          this.enums.has(node.name) ||
          this.types.has(node.name) ||
          this.functions.has(node.name) ||
          this.find(node.name)
        )
          this.fail('semantic', node, `${node.name} is already declared in this scope.`);
        this.enums.add(node.name);
        for (const field of node.fields)
          this.define(`${node.name}.${field.name}`, valueType(node.name, 'const'), node);
        return valueType(node.name, 'const');
      }
      case 'for': {
        const from = this.expression(node.from);
        const to = this.expression(node.to);
        if (!this.compatible('int', from) || !this.compatible('int', to))
          this.fail('type', node, 'Loop bounds require integers.');
        if (node.step) this.expression(node.step);
        this.scopes.push(new Map([[node.name, valueType('int')]]));
        this.loopDepth++;
        const result = this.block(node.body, false);
        this.loopDepth--;
        this.scopes.pop();
        return result;
      }
      case 'forIn': {
        const iterable = this.expression(node.iterable);
        const element = iterable.base.match(/^array<(.*)>$/)?.[1] ?? 'unknown';
        this.scopes.push(new Map());
        node.names.forEach((name, i) =>
          this.define(name, valueType(node.names.length > 1 && i === 0 ? 'int' : element), node),
        );
        this.loopDepth++;
        const result = this.block(node.body, false);
        this.loopDepth--;
        this.scopes.pop();
        return result;
      }
      case 'while': {
        this.condition(this.expression(node.test), node);
        this.loopDepth++;
        const result = this.block(node.body);
        this.loopDepth--;
        return result;
      }
      case 'break':
      case 'continue':
        if (this.loopDepth === 0)
          this.fail('semantic', node, `${node.kind} requires an enclosing loop.`);
        return valueType('na', 'const');
    }
  }
  expression(node: Expression): ValueType {
    switch (node.kind) {
      case 'literal':
        return valueType(node.valueType, 'const');
      case 'identifier': {
        const type = this.find(node.name);
        if (!type) this.fail('undeclared', node, `Undeclared identifier ${node.name}.`);
        return type;
      }
      case 'member': {
        const name = qualifiedName(node);
        const rootName = name?.split('.')[0];
        const hasReceiverBinding = rootName && this.scopes.some((scope) => scope.has(rootName));
        const builtin = name && !hasReceiverBinding && this.find(name);
        if (builtin) return builtin;
        const object = this.expression(node.object);
        if (object.base === 'chart.point' && ['time', 'index', 'price'].includes(node.property))
          return valueType(node.property === 'price' ? 'float' : 'int');
        const field = this.types.get(object.base)?.fields.find((f) => f.name === node.property);
        if (field) return valueType(field.type ?? 'unknown', object.qualifier);
        if (object.base === 'unknown') return valueType('unknown');
        this.fail('undeclared', node, `Unknown field ${node.property} on ${object.base}.`);
      }
      case 'history': {
        const object = this.expression(node.object);
        const offset = this.expression(node.offset);
        if (!this.compatible('int', offset))
          this.fail('type', node, 'History offsets must be integers.');
        if (this.program.version === 6 && node.object.kind === 'literal')
          this.fail('semantic', node, 'Pine v6 cannot apply history to a literal.');
        if (
          this.program.version === 6 &&
          node.object.kind === 'member' &&
          !this.find(qualifiedName(node.object) ?? '')
        )
          this.fail('semantic', node, 'Apply history to the object before accessing its field.');
        return { ...object, qualifier: 'series' };
      }
      case 'unary': {
        const argument = this.expression(node.argument);
        if (node.operator === 'not') {
          this.condition(argument, node);
          return valueType('bool', argument.qualifier);
        }
        if (!numeric(argument)) this.fail('type', node, 'Arithmetic requires a numeric value.');
        return argument;
      }
      case 'binary': {
        const left = this.expression(node.left);
        const right = this.expression(node.right);
        const q = qualify(left, right);
        if (['and', 'or'].includes(node.operator)) {
          this.condition(left, node);
          this.condition(right, node);
          return valueType('bool', q);
        }
        if (['==', '!=', '<', '<=', '>', '>='].includes(node.operator)) {
          if (this.enums.has(left.base) || this.enums.has(right.base)) {
            if (!['==', '!='].includes(node.operator))
              this.fail('type', node, 'Enums only support equality comparisons.');
            this.checkEnumTypes(left, right, node);
          }
          return valueType('bool', q);
        }
        if (
          node.operator === '+' &&
          ((left.base === 'string' && ['string', 'unknown'].includes(right.base)) ||
            (right.base === 'string' && left.base === 'unknown'))
        )
          return valueType('string', q);
        if (!numeric(left) || !numeric(right))
          this.fail('type', node, 'Arithmetic requires numeric operands.');
        // Integer operands retain an int type even when v6 division produces a
        // fractional value. Only an explicit int() call truncates that value.
        return valueType(
          left.base === 'float' || right.base === 'float'
            ? 'float'
            : left.base === 'unknown' || right.base === 'unknown'
              ? 'unknown'
              : 'int',
          q,
        );
      }
      case 'conditional': {
        const test = this.expression(node.test);
        this.condition(test, node);
        const left = this.expression(node.consequent);
        const right = this.expression(node.alternate);
        this.checkEnumTypes(left, right, node);
        return { ...(left.base === 'na' ? right : left), qualifier: qualify(test, left, right) };
      }
      case 'tuple': {
        const elements = node.elements.map((e) => this.expression(e));
        return { base: 'tuple', elements, qualifier: qualify(...elements) };
      }
      case 'if': {
        const test = this.expression(node.test);
        this.condition(test, node);
        const left = this.block(node.consequent);
        const right = this.block(node.alternate);
        this.checkEnumTypes(left, right, node);
        return { ...(left.base === 'na' ? right : left), qualifier: qualify(test, left, right) };
      }
      case 'switch': {
        const selector = node.expression ? this.expression(node.expression) : undefined;
        let result = valueType('na');
        const branches: ValueType[] = [];
        for (const branch of node.cases) {
          if (branch.test) {
            const test = this.expression(branch.test);
            if (selector) this.checkEnumTypes(selector, test, node);
            else this.condition(test, node);
          }
          result = this.block(branch.body);
          for (const previous of branches) this.checkEnumTypes(previous, result, node);
          branches.push(result);
        }
        const enumResult = branches.find((branch) => this.enums.has(branch.base));
        return enumResult ? { ...enumResult, qualifier: qualify(...branches) } : result;
      }
      case 'call':
        return this.call(node);
    }
  }
  call(node: Call): ValueType {
    let name = qualifiedName(node.callee) ?? '';
    let callArgs = node.args;
    const args = callArgs.map((arg) => this.expression(arg.value));
    const named = new Set<string>();
    for (const arg of node.args)
      if (arg.name) {
        if (named.has(arg.name) && this.program.version === 6)
          this.fail('semantic', node, `Duplicate argument ${arg.name}.`);
        named.add(arg.name);
      }
    if (node.callee.kind === 'member' && node.callee.property === 'new') {
      const type = qualifiedName(node.callee.object);
      if (type && this.types.has(type)) return valueType(type);
    }
    let fn = this.functions.get(name);
    if (node.callee.kind === 'member' && !functions.has(name)) {
      const receiver = this.expression(node.callee.object);
      const candidate = this.functions.get(node.callee.property);
      fn =
        candidate?.declaration.method &&
        this.compatible(candidate.declaration.params[0]?.type ?? 'unknown', receiver)
          ? candidate
          : undefined;
      // Only declared methods may use the receiver form. Ordinary functions do
      // not become methods merely because their names match the member name.
      if (fn) name = fn.declaration.name;
      else {
        const namespace = receiver.base.split('<')[0];
        name = `${namespace}.${node.callee.property}`;
      }
      callArgs = [{ value: node.callee.object }, ...callArgs];
      args.unshift(receiver);
      node.implicitReceiver = true;
    }
    node.resolvedName = name;
    if (name.startsWith('unknown.') && this.functionScope >= 0) return valueType('unknown');
    if (fn) {
      const params = fn.declaration.params;
      let position = 0;
      const mapped = new Map<string, ValueType>();
      callArgs.forEach((arg, i) => {
        const param = arg.name ? params.find((p) => p.name === arg.name) : params[position++];
        if (!param) this.fail('type', node, `Unknown or excess argument in ${name}.`);
        if (mapped.has(param.name) && this.program.version === 6)
          this.fail('type', node, `Duplicate argument ${param.name}.`);
        mapped.set(param.name, args[i]);
      });
      for (const param of params) {
        const supplied = mapped.get(param.name);
        if (!supplied && !param.default) this.fail('type', node, `Missing argument ${param.name}.`);
        if (supplied && param.type && !this.compatible(param.type, supplied))
          this.fail('type', node, `Argument ${param.name} requires ${param.type}.`);
        if (
          supplied &&
          param.qualifier &&
          ranks.indexOf(supplied.qualifier) > ranks.indexOf(param.qualifier as Qualifier)
        )
          this.fail('type', node, `Argument ${param.name} requires ${param.qualifier} or weaker.`);
      }
      // Untyped parameters are polymorphic. Check a separate body at each call
      // so one call's inferred method receiver cannot overwrite another's.
      const scopes = this.scopes;
      const functionScope = this.functionScope;
      const loopDepth = this.loopDepth;
      this.scopes = [new Map(fn.globals), new Map()];
      this.functionScope = 1;
      this.loopDepth = 0;
      try {
        for (const param of params) {
          const actual = mapped.get(param.name) ?? this.expression(param.default!);
          this.define(
            param.name,
            {
              ...actual,
              base: param.type ?? actual.base,
              qualifier: (param.qualifier as Qualifier) ?? actual.qualifier,
              bindingQualifier: undefined,
            },
            node,
          );
        }
        const body = cloneAst(fn.declaration.body);
        node.specializedBody = body;
        return this.block(body, false);
      } finally {
        this.scopes = scopes;
        this.functionScope = functionScope;
        this.loopDepth = loopDepth;
      }
    }
    if (!functions.has(name))
      this.fail('undeclared', node, `Unknown function ${name || '<expression>'}.`);
    if (name.startsWith('strategy.') && this.scriptKind === 'indicator')
      throw new CompileError(
        'semantic',
        this.declarationLine,
        'Strategy operations require a strategy() declaration.',
      );
    if (
      [
        'plot',
        'plotshape',
        'plotchar',
        'plotarrow',
        'plotcandle',
        'plotbar',
        'hline',
        'fill',
        'barcolor',
        'bgcolor',
        'alertcondition',
      ].includes(name) &&
      this.scopes.length > 1
    )
      this.fail('semantic', node, `${name} cannot be called in local scope.`);
    if (name.startsWith('strategy.risk.') && this.scopes.length > 1)
      this.fail('semantic', node, `${name} cannot be called in local scope.`);
    if (
      this.program.version === 6 &&
      /^strategy\.(entry|order|exit|close|close_all|cancel|cancel_all)$/.test(name) &&
      named.has('when')
    )
      this.fail('type', node, 'The when argument is not available in Pine v6.');
    const argument = (position: number, label: string): ValueType | undefined => {
      const namedIndex = callArgs.findIndex((arg) => arg.name === label);
      return namedIndex >= 0
        ? args[namedIndex]
        : callArgs[position]?.name
          ? undefined
          : args[position];
    };
    const check = (
      position: number,
      label: string,
      expected: string,
      required = true,
      maximum?: Qualifier,
    ): void => {
      const actual = argument(position, label);
      if (!actual) {
        if (required) this.fail('type', node, `Missing argument ${label} in ${name}.`);
        return;
      }
      if (!this.compatible(expected, actual))
        this.fail(
          'type',
          node,
          `${label} in ${name} requires ${expected}, received ${actual.base}.`,
        );
      if (
        maximum &&
        ranks.indexOf(actual.qualifier) > ranks.indexOf(maximum) &&
        actual.base !== 'unknown'
      )
        this.fail('type', node, `${label} in ${name} requires ${maximum} or weaker.`);
    };
    if (name.startsWith('strategy.risk.')) {
      const leaf = name.slice('strategy.risk.'.length);
      const signatures: Record<string, string[]> = {
        allow_entry_in: ['value'],
        max_position_size: ['contracts'],
        max_intraday_filled_orders: ['count', 'alert_message'],
        max_drawdown: ['value', 'type', 'alert_message'],
        max_intraday_loss: ['value', 'type', 'alert_message'],
        max_cons_loss_days: ['count', 'alert_message'],
      };
      const parameters = signatures[leaf];
      let position = 0;
      const mapped = new Set<string>();
      for (const arg of callArgs) {
        const parameter = arg.name ?? parameters[position++];
        if (!parameters.includes(parameter))
          this.fail('type', node, `Unknown or excess argument in ${name}.`);
        if (mapped.has(parameter) && this.program.version === 6)
          this.fail('type', node, `Duplicate argument ${parameter}.`);
        mapped.add(parameter);
      }
      const riskString = (position: number, label: string): void => {
        const actual = argument(position, label);
        if (actual?.base === 'enum') {
          if (ranks.indexOf(actual.qualifier) > ranks.indexOf('simple'))
            this.fail('type', node, `${label} in ${name} requires simple or weaker.`);
        } else check(position, label, 'string', true, 'simple');
      };
      if (leaf === 'allow_entry_in') riskString(0, 'value');
      else if (leaf === 'max_position_size') check(0, 'contracts', 'float', true, 'simple');
      else if (leaf === 'max_drawdown' || leaf === 'max_intraday_loss') {
        check(0, 'value', 'float', true, 'simple');
        riskString(1, 'type');
      } else check(0, 'count', 'int', true, 'simple');
      const alertIndex = parameters.indexOf('alert_message');
      if (alertIndex >= 0) check(alertIndex, 'alert_message', 'string', false, 'simple');
      return valueType('void');
    }
    if (
      /^ta\.(sma|ema|rma|wma|vwma|hma|rsi|cci|cmo|cog|dev|mom|roc|median|mode|range|percentrank|stdev|variance)$/.test(
        name,
      )
    ) {
      check(0, 'source', 'float');
      check(
        1,
        'length',
        'int',
        true,
        ['ta.ema', 'ta.rma', 'ta.rsi'].includes(name) ? 'simple' : undefined,
      );
    }
    if (name === 'plot') {
      check(0, 'series', 'float');
      if (this.program.version === 6) check(3, 'offset', 'int', false, 'simple');
    }
    if (name.startsWith('input.') || name === 'input') {
      const defval = argument(0, 'defval');
      if (name === 'input.enum') {
        if (!defval || !this.enums.has(defval.base) || defval.qualifier !== 'const')
          this.fail('type', node, 'input.enum requires a constant enum default.');
        const options = argument(2, 'options');
        if (
          options &&
          (options.base !== 'tuple' ||
            !options.elements?.length ||
            options.elements.some(
              (option) => option.base !== defval.base || option.qualifier !== 'const',
            ))
        )
          this.fail('type', node, 'input.enum options require constant members of the same enum.');
      }
      if (defval && name !== 'input.source' && defval.qualifier === 'series')
        this.fail('type', node, 'Input defaults must be constant values.');
      const leaf = name.split('.')[1];
      const base =
        (
          {
            price: 'float',
            source: 'float',
            time: 'int',
            timeframe: 'string',
            session: 'string',
            symbol: 'string',
            text_area: 'string',
          } as Record<string, string>
        )[leaf] ??
        (['int', 'float', 'bool', 'string', 'color'].includes(leaf)
          ? leaf
          : (defval?.base ?? 'unknown'));
      if (defval && !this.compatible(base, defval))
        this.fail('type', node, `Invalid default type for ${name}.`);
      return valueType(base, name === 'input.source' ? 'series' : 'input');
    }
    if (
      ['ta.macd', 'ta.bb', 'ta.kc', 'ta.dmi'].includes(name) ||
      (name === 'ta.vwap' && (node.args.length >= 3 || named.has('stdev_mult')))
    )
      return {
        base: 'tuple',
        qualifier: 'series',
        elements: [valueType('float'), valueType('float'), valueType('float')],
      };
    if (name === 'ta.supertrend')
      return {
        base: 'tuple',
        qualifier: 'series',
        elements: [valueType('float'), valueType('int')],
      };
    if (name === 'request.security' || name === 'request.security_lower_tf') {
      const expression = argument(2, 'expression') ?? valueType('unknown');
      const requested = (type: ValueType): ValueType => ({
        ...type,
        base:
          name === 'request.security_lower_tf' && !type.elements
            ? `array<${type.base}>`
            : type.base,
        qualifier: 'series',
        ...(type.elements ? { elements: type.elements.map(requested) } : {}),
      });
      return requested(expression);
    }
    if (name === 'ta.valuewhen')
      return { ...(argument(1, 'source') ?? valueType('unknown')), qualifier: 'series' };
    if (name === 'ta.pivot_point_levels') return valueType('array<float>');
    if (/^strategy\.(open|closed)trades\./.test(name)) {
      const leaf = name.split('.').at(-1)!;
      return valueType(
        /_(bar_index|time)$/.test(leaf) ? 'int' : /_(id|comment)$/.test(leaf) ? 'string' : 'float',
      );
    }
    if (
      name === 'na' ||
      /^ta\.(cross|crossover|crossunder|rising|falling)$/.test(name) ||
      /^str\.(contains|startswith|endswith)$/.test(name) ||
      name === 'timeframe.change'
    )
      return valueType('bool', qualify(...args));
    if (name === 'nz' || name === 'fixnan') return args[0] ?? valueType('unknown');
    if (['int', 'float', 'bool', 'string', 'color'].includes(name))
      return valueType(name, qualify(...args));
    if (name.startsWith('str.'))
      return valueType(
        name === 'str.tonumber'
          ? 'float'
          : ['str.length', 'str.pos'].includes(name)
            ? 'int'
            : name === 'str.split'
              ? 'array<string>'
              : 'string',
        qualify(...args),
      );
    if (
      [
        'timestamp',
        'time',
        'time_close',
        'year',
        'month',
        'weekofyear',
        'dayofmonth',
        'dayofweek',
        'hour',
        'minute',
        'second',
        'timeframe.in_seconds',
      ].includes(name)
    )
      return valueType('int', name === 'timestamp' ? qualify(...args) : 'series');
    if (name.startsWith('color.'))
      return valueType(
        ['color.r', 'color.g', 'color.b', 'color.t'].includes(name) ? 'float' : 'color',
        qualify(...args),
      );
    if (name.startsWith('chart.point.')) {
      const leaf = name.slice(12);
      const signature =
        leaf === 'new'
          ? ['time', 'index', 'price']
          : leaf === 'now'
            ? ['price']
            : leaf === 'copy'
              ? ['id']
              : leaf === 'from_index'
                ? ['index', 'price']
                : ['time', 'price'];
      const offset = node.implicitReceiver ? 1 : 0;
      let position = offset;
      const supplied = new Set(offset ? [signature[0]] : []);
      for (const arg of node.args) {
        const key = arg.name ?? signature[position++];
        if (!signature.includes(key) || supplied.has(key))
          this.fail('semantic', node, `Invalid chart.point.${leaf} argument ${key}.`);
        supplied.add(key);
      }
      for (const [index, key] of signature.entries()) {
        const actual = argument(index, key);
        if (!actual) {
          if (leaf !== 'now') this.fail('semantic', node, `chart.point.${leaf} requires ${key}.`);
          continue;
        }
        const expected = key === 'id' ? 'chart.point' : key === 'price' ? 'float' : 'int';
        if (!this.compatible(expected, actual))
          this.fail('type', node, `chart.point.${leaf} ${key} requires ${expected}.`);
      }
      return valueType('chart.point');
    }
    if (name.startsWith('array.')) {
      const leaf = name.slice(6);
      const element = args[0]?.base.match(/^array<(.*)>$/)?.[1] ?? 'unknown';
      if (leaf.startsWith('new')) {
        const element = node.typeArgs[0] ?? (leaf.slice(4) || 'unknown');
        const initial = argument(1, 'initial_value');
        if (initial) this.checkEnumTypes(valueType(element), initial, node);
        return valueType(`array<${element}>`);
      }
      if (leaf === 'from') {
        const enumElement = args.find((arg) => this.enums.has(arg.base));
        for (const arg of args) this.checkEnumTypes(enumElement ?? args[0], arg, node);
        return valueType(
          `array<${enumElement?.base ?? args.find((t) => t.base === 'float')?.base ?? args[0]?.base ?? 'unknown'}>`,
        );
      }
      const valueIndex =
        leaf === 'set' || leaf === 'insert'
          ? 2
          : ['push', 'unshift', 'fill', 'includes', 'indexof', 'lastindexof'].includes(leaf)
            ? 1
            : -1;
      if (valueIndex >= 0 && args[valueIndex])
        this.checkEnumTypes(valueType(element), args[valueIndex], node);
      if (leaf === 'concat' && args[1]) this.checkEnumTypes(args[0], args[1], node);
      if (leaf === 'includes') return valueType('bool');
      if (
        [
          'size',
          'indexof',
          'lastindexof',
          'binary_search',
          'binary_search_leftmost',
          'binary_search_rightmost',
        ].includes(leaf)
      )
        return valueType('int');
      if (leaf === 'join') return valueType('string');
      if (leaf === 'sort_indices') return valueType('array<int>');
      if (['copy', 'slice', 'concat', 'abs', 'standardize'].includes(leaf)) return args[0];
      return valueType(element);
    }
    if (name.startsWith('map.')) {
      const leaf = name.slice(4);
      const parts = args[0]?.base.match(/^map<([^,]+),(.+)>$/);
      if (leaf === 'new') return valueType(`map<${node.typeArgs.join(',')}>`);
      if (['put', 'get', 'contains', 'remove'].includes(leaf) && args[1])
        this.checkEnumTypes(valueType(parts?.[1] ?? 'unknown'), args[1], node);
      if (leaf === 'put' && args[2])
        this.checkEnumTypes(valueType(parts?.[2] ?? 'unknown'), args[2], node);
      if (leaf === 'put_all' && args[1]) this.checkEnumTypes(args[0], args[1], node);
      if (leaf === 'contains') return valueType('bool');
      if (leaf === 'copy') return args[0];
      if (leaf === 'size') return valueType('int');
      if (leaf === 'keys' || leaf === 'values')
        return valueType(`array<${parts?.[leaf === 'keys' ? 1 : 2] ?? 'unknown'}>`);
      return valueType(parts?.[2] ?? 'unknown');
    }
    if (name.startsWith('matrix.')) {
      const leaf = name.slice(7);
      const element = args[0]?.base.match(/^matrix<(.*)>$/)?.[1] ?? 'float';
      if (leaf === 'new') return valueType(`matrix<${node.typeArgs[0] ?? 'float'}>`);
      if (
        ['transpose', 'sum', 'diff', 'mult', 'copy', 'inv', 'pinv', 'pow', 'eigenvectors'].includes(
          leaf,
        )
      )
        return args[0];
      if (['eigenvalues', 'row', 'col', 'remove_row', 'remove_col'].includes(leaf))
        return valueType(`array<${element}>`);
      if (leaf === 'rows' || leaf === 'columns' || leaf === 'rank') return valueType('int');
      if (leaf.startsWith('is_')) return valueType('bool');
      return valueType(element);
    }
    if (/^(line|label|box|table|linefill|polyline)\.(new|copy)$/.test(name))
      return valueType(name.split('.')[0]);
    if (/^(box\.get_(left|right)|line\.get_x[12]|label\.get_x)$/.test(name))
      return valueType('int');
    if (name === 'label.get_text') return valueType('string');
    if (name.startsWith('math.')) {
      const integerOverload =
        ['math.abs', 'math.max', 'math.min', 'math.sign'].includes(name) &&
        args.every((arg) => arg.base === 'int');
      const integerRounding =
        ['math.floor', 'math.ceil'].includes(name) ||
        (name === 'math.round' && node.args.length === 1);
      return valueType(integerOverload || integerRounding ? 'int' : 'float', qualify(...args));
    }
    if (name === 'ta.barssince' || name === 'ta.highestbars' || name === 'ta.lowestbars')
      return valueType('int');
    return valueType('float');
  }
}

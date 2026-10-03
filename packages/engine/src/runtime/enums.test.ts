import assert from 'node:assert/strict';
import test from 'node:test';
import { compile, run } from '../index.ts';
import type { RunInput } from '../types.ts';
import { EnumRegistry } from './enums.ts';
import type { EnumDeclaration } from '../compiler/ast.ts';

const input: RunInput = {
  timeframe: '60',
  syminfo: { timezone: 'UTC', mintick: 0.01 },
  bars: Array.from({ length: 4 }, (_, i) => ({
    time: 1_700_000_000 + i * 3600,
    open: 10,
    high: 11,
    low: 9,
    close: 10,
    volume: 100,
  })),
};
const declaration =
  'enum Average\n    sma = "Simple average"\n    ema = "Exponential average"\n    none';

for (const version of [5, 6]) {
  test(`v${version}: enum members retain identity through functions, collections, and history`, () => {
    const result = run(
      `//@version=${version}
indicator("enum identity")
${declaration}
identity(Average value) => value
var first = Average.sma
current = bar_index % 2 == 0 ? Average.sma : Average.ema
members = array.from(current, Average.none)
byMember = map.new<Average, int>()
byMember.put(Average.sma, 7)
plot(first == Average.sma ? 1 : 0)
plot(identity(current) == current ? 1 : 0)
plot(members.get(0) == current ? 1 : 0)
plot(byMember.get(first))
plot(current[1] == Average.sma ? 1 : 0)
plot(str.tostring(Average.sma) == "Simple average" ? 1 : 0)
plot(str.tostring(Average.none) == "none" ? 1 : 0)
code = switch current
    Average.sma => 10
    Average.ema => 20
    => 30
plot(code)`,
      input,
    );
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(
      result.plots.map((plot) => plot.values),
      [
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [7, 7, 7, 7],
        [0, 1, 0, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [10, 20, 10, 20],
      ],
    );
  });

  test(`v${version}: input.enum resolves JSON overrides to declared members`, () => {
    const source = `//@version=${version}
indicator("enum input")
${declaration}
selected = input.enum(Average.sma, "Average", options=[Average.sma, Average.ema])
plot(selected == Average.ema ? 2 : 1)`;
    for (const override of ['ema', 'Average.ema', 'Exponential average']) {
      const result = run(source, { ...input, inputs: { Average: override } });
      assert.deepEqual(result.diagnostics, [], override);
      assert.deepEqual(result.plots[0].values, [2, 2, 2, 2]);
    }
    const defaults = run(source, input);
    assert.deepEqual(defaults.diagnostics, []);
    assert.deepEqual(defaults.plots[0].values, [1, 1, 1, 1]);
    for (const override of ['none', 'Average.none', 'unknown', '', 1, null, {}]) {
      const result = run(source, { ...input, inputs: { Average: override } });
      assert.equal(result.diagnostics.length, 1, JSON.stringify(override));
      assert.match(result.diagnostics[0].message, /input\.enum/);
    }
    // Separate runs recreate their registry without sharing mutable input state.
    assert.deepEqual(run(source, input), defaults);
  });

  test(`v${version}: invalid enum types fail during compilation`, () => {
    for (const body of [
      'input.enum(1)',
      `${declaration}\ninput.enum(Average.sma, options=[Average.sma, 1])`,
      `${declaration}\ninput.enum(Average.sma, options=[])`,
      `${declaration}\ninput.enum(bar_index > 0 ? Average.sma : Average.ema)`,
      `${declaration}\nenum Other\n    sma = "Simple average"\nplot(Average.sma == Other.sma ? 1 : 0)`,
      `${declaration}\nplot(Average.sma == "Simple average" ? 1 : 0)`,
      `${declaration}\nplot(Average.sma > Average.ema ? 1 : 0)`,
      `${declaration}\nenum Other\n    x\nz = true ? Average.sma : Other.x`,
      `${declaration}\nz = true ? Average.sma : "Simple average"`,
      `${declaration}\nz = if true\n    Average.sma\nelse\n    "Simple average"`,
      `${declaration}\nz = switch Average.sma\n    "Simple average" => 1\n    => 0`,
      `${declaration}\nz = switch\n    true => Average.sma\n    => "Simple average"`,
      `${declaration}\nenum Other\n    x\nz = switch\n    true => Average.sma\n    false => na\n    => Other.x`,
      `${declaration}\n[a, b] = true ? [Average.sma, 1] : ["Simple average", 1]`,
      `${declaration}\nenum Other\n    x\nvalues = array.from(Average.sma, Other.x)`,
      `${declaration}\nvalues = array.new<Average>(1, "Simple average")`,
      `${declaration}\nvalues = array.from(Average.sma)\nvalues.push("Simple average")`,
      `${declaration}\nvalues = array.from(Average.sma)\nvalues.set(0, "Simple average")`,
      `${declaration}\nvalues = array.from(Average.sma)\nvalues.includes("Simple average")`,
      `${declaration}\nvalues = true ? array.from(Average.sma) : array.from("Simple average")`,
      `${declaration}\nvalues = map.new<Average,int>()\nvalues.put("Simple average", 1)`,
      `${declaration}\nvalues = map.new<Average,int>()\nvalues.contains("Simple average")`,
      `${declaration}\nvalues = map.new<int,Average>()\nvalues.put(1, "Simple average")`,
    ]) {
      const result = compile(`//@version=${version}\nindicator("enum type errors")\n${body}`);
      assert.equal(result.success, false, body);
      assert.equal(result.diagnostics[0]?.kind, 'type', body);
    }
  });

  test(`v${version}: enum branches preserve their type with na alternatives`, () => {
    const result = run(
      `//@version=${version}
indicator("enum branch types")
${declaration}
x = true ? Average.sma : na
y = if true
    Average.sma
else
    na
z = switch Average.sma
    Average.sma => Average.ema
    Average.ema => na
    => na
plot(x == Average.sma ? 1 : 0)
plot(y == Average.sma ? 1 : 0)
plot(z == Average.ema ? 1 : 0)`,
      input,
    );
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(
      result.plots.map((plot) => plot.values),
      Array.from({ length: 3 }, () => [1, 1, 1, 1]),
    );
    const immutable = compile(
      `//@version=${version}\nindicator("enum immutable")\n${declaration}\nAverage.sma := Average.ema`,
    );
    assert.equal(immutable.success, false);
    assert.match(immutable.diagnostics[0].message, /Cannot reassign enum member/);
  });
}

test('enum titles do not collapse distinct members, and ambiguous overrides are rejected', () => {
  const registry = new EnumRegistry();
  const declaration: EnumDeclaration = {
    kind: 'enum',
    id: 1,
    line: 1,
    column: 1,
    name: 'Choice',
    fields: [
      { name: 'a', title: 'Same' },
      { name: 'b', title: 'Same' },
    ],
  };
  const values = registry.declare(declaration);
  assert.equal(registry.declare(declaration), values);
  assert.notEqual(values.a, values.b);
  assert.equal(String(values.a), String(values.b));
  assert.equal(registry.input(values.a, 'Choice.b'), values.b);
  assert.throws(() => registry.input(values.a, 'Same'), /ambiguous/);
  assert.throws(() => registry.input(values.a, undefined, [values.b]), /default/);
});

test('enum namespaces cannot be replaced by global variables, functions, or UDTs', () => {
  for (const version of [5, 6]) {
    for (const body of [
      'enum A\n    x\nA = 1',
      'enum A\n    x\ntype A\n    float value',
      'enum A\n    x\nA() => 1',
      'A() => 1\nenum A\n    x',
    ]) {
      const result = compile(`//@version=${version}\nindicator("enum namespace")\n${body}`);
      assert.equal(result.success, false, body);
      assert.equal(result.diagnostics[0].kind, 'semantic');
      assert.match(result.diagnostics[0].message, /already declared/);
    }
  }
});

test('member lookup respects local receivers that shadow enum namespaces', () => {
  for (const version of [5, 6]) {
    const rejected = compile(`//@version=${version}
indicator("shadowed enum")
enum A
    x
read() =>
    A = 1
    A.x == A.x
plot(read() ? 1 : 0)`);
    assert.equal(rejected.success, false);
    assert.equal(rejected.diagnostics[0].kind, 'undeclared');
    assert.match(rejected.diagnostics[0].message, /Unknown field x on int/);
    const result = run(
      `//@version=${version}
indicator("local enum name")
enum A
    x
type Value
    float x
read() =>
    A = Value.new(9.0)
    A.x
plot(read())
plot(A.x == A.x ? 1 : 0)`,
      input,
    );
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(
      result.plots.map((plot) => plot.values),
      [
        [9, 9, 9, 9],
        [1, 1, 1, 1],
      ],
    );
  }
});

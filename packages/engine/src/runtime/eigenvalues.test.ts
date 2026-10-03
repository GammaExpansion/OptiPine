import assert from 'node:assert/strict';
import test from 'node:test';
import { compile, run } from '../index.ts';
import { eigenvalues } from './eigenvalues.ts';

function close(actual: number[], expected: number[], tolerance = 1e-12): void {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(
      Math.abs(value - expected[index]) <= tolerance * Math.max(1, Math.abs(expected[index])),
      `${value} differs from ${expected[index]}`,
    );
  });
}

test('implicit QL eigenvalues handle signed, repeated, and scaled spectra without mutation', () => {
  const matrix = [
    [4, 1, 2],
    [1, 3, 0],
    [2, 0, 2],
  ];
  const before = structuredClone(matrix);
  const roots = eigenvalues(matrix).sort((a, b) => a - b);
  close(roots, [0.6385312338141735, 2.832550808891464, 5.528917957294362]);
  assert.deepEqual(matrix, before);
  close(
    eigenvalues([
      [0, 1],
      [1, 0],
    ]).sort((a, b) => a - b),
    [-1, 1],
  );
  close(
    eigenvalues([
      [2, 0, 0],
      [0, 2, 0],
      [0, 0, 2],
    ]),
    [2, 2, 2],
  );
  close(
    eigenvalues([
      [0, 0],
      [0, 0],
    ]),
    [0, 0],
  );
  close(eigenvalues([[3]]), [3]);
  for (const scale of [1e-200, 1e200])
    close(
      eigenvalues(matrix.map((row) => row.map((value) => value * scale)))
        .map((value) => value / scale)
        .sort((a, b) => a - b),
      roots,
    );
});

test('larger symmetric eigenvalues satisfy the trace, squared trace, and characteristic equation', () => {
  const matrix = [
    [8, -3, 0, 2],
    [-3, 5, 1, 0],
    [0, 1, 4, -1],
    [2, 0, -1, 6],
  ];
  const roots = eigenvalues(matrix);
  close([roots.reduce((total, root) => total + root, 0)], [23]);
  close([roots.reduce((total, root) => total + root * root, 0)], [171]);
  // Independently evaluate det(A - lambda I) using elimination with pivoting.
  for (const root of roots) {
    const work = matrix.map((row, i) => row.map((value, j) => value - (i === j ? root : 0)));
    let determinant = 1;
    for (let i = 0; i < work.length; i++) {
      let pivot = i;
      for (let j = i + 1; j < work.length; j++)
        if (Math.abs(work[j][i]) > Math.abs(work[pivot][i])) pivot = j;
      if (pivot !== i) {
        [work[i], work[pivot]] = [work[pivot], work[i]];
        determinant *= -1;
      }
      determinant *= work[i][i];
      for (let j = i + 1; j < work.length; j++) {
        const factor = work[j][i] / work[i][i];
        for (let k = i + 1; k < work.length; k++) work[j][k] -= factor * work[i][k];
      }
    }
    assert.ok(Math.abs(determinant) < 1e-10, `det(A - ${root} I) = ${determinant}`);
  }
});

for (const version of [5, 6]) {
  test(`v${version}: matrix returns chain into array and matrix methods`, () => {
    const source = `//@version=${version}
indicator("method return types")
values() => array.from(5.0, 7.0)
m = matrix.new<float>(2, 2, 0.0)
m.set(0, 0, 2.0)
m.set(0, 1, 1.0)
m.set(1, 0, 1.0)
m.set(1, 1, 2.0)
plot(m.eigenvalues().sum())
plot(matrix.eigenvalues(m).get(0) + m.eigenvalues().get(1))
plot(m.transpose().row(0).get(1))
plot(values().get(1))
plot(array.from(3.0, 1.0).sort_indices().get(0))
byName = map.new<string,float>()
byName.put("a", 9.0)
plot(byName.copy().get("a"))`;
    assert.equal(compile(source).success, true);
    const result = run(source, {
      timeframe: '60',
      syminfo: { timezone: 'UTC' },
      bars: [{ time: 1700000000, open: 1, high: 2, low: 1, close: 2, volume: 1 }],
    });
    assert.deepEqual(result.diagnostics, []);
    close(
      result.plots.map((plot) => {
        const value = plot.values[0];
        assert.equal(typeof value, 'number');
        return value as number;
      }),
      [4, 4, 1, 7, 1, 9],
    );
  });
}

test('invalid eigensystems fail explicitly', () => {
  for (const matrix of [[], [[1, 2]], [[1, 0], [0]], [[NaN]], [[Infinity]]])
    assert.throws(() => eigenvalues(matrix), /requires/);
});

test('an empty matrix compiles and fails at runtime on the eigenvalues call', () => {
  // Native RE10088 evidence is preserved in I_eigen_boundaries/capture-empty-notes.md.
  const source = `//@version=6
indicator("empty eigenvalues")
m = matrix.new<float>(0, 0, 0.0)
plot(m.eigenvalues().size())`;
  assert.equal(compile(source).success, true);
  const result = run(source, {
    timeframe: '60',
    syminfo: { timezone: 'UTC' },
    bars: [{ time: 1700000000, open: 1, high: 2, low: 1, close: 2, volume: 1 }],
  });
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].kind, 'runtime');
  assert.equal(result.diagnostics[0].line, 4);
  assert.match(result.diagnostics[0].message, /nonempty square matrix/);
});

test('complex pairs expose real components and preserve the total trace', () => {
  // TradingView's native I_eigen_complex export returns [0, 0] for this rotation.
  close(
    eigenvalues([
      [0, -1],
      [1, 0],
    ]),
    [0, 0],
  );
  close(
    eigenvalues([
      [2, -3],
      [3, 2],
    ]),
    [2, 2],
  );
  close(
    eigenvalues([
      [2, -3, 0],
      [3, 2, 0],
      [0, 0, 7],
    ]),
    [2, 2, 7],
  );
});

test('non-symmetric real spectra preserve deflation order and satisfy similarity invariance', () => {
  // The 2x2 order and descending symmetric order are observed in the native language probe.
  close(
    eigenvalues([
      [1, 2],
      [3, 4],
    ]),
    [(5 - Math.sqrt(33)) / 2, (5 + Math.sqrt(33)) / 2],
  );
  close(
    eigenvalues([
      [4, 0, 0],
      [0, -2, 0],
      [0, 0, 1],
    ]),
    [4, 1, -2],
  );
  close(
    eigenvalues([
      [1, 3, 4],
      [0, 2, -1],
      [0, 0, 3],
    ]),
    [1, 2, 3],
  );
  const symmetric = [
    [8, -3, 0, 2],
    [-3, 5, 1, 0],
    [0, 1, 4, -1],
    [2, 0, -1, 6],
  ];
  const expected = eigenvalues(symmetric).sort((a, b) => a - b);
  const factors = [1, 2, 4, 8];
  const similar = symmetric.map((row, i) =>
    row.map((value, j) => (value * factors[i]) / factors[j]),
  );
  const original = structuredClone(similar);
  close(
    eigenvalues(similar).sort((a, b) => a - b),
    expected,
  );
  assert.deepEqual(similar, original);
  for (const scale of [1e-200, 1e200])
    close(
      eigenvalues(similar.map((row) => row.map((value) => value * scale)))
        .map((value) => value / scale)
        .sort((a, b) => a - b),
      expected,
    );
});

test('integer matrices retain the native fractional eigenvalues', () => {
  const source = `//@version=6
indicator("integer eigenvalues")
m = matrix.new<int>(2, 2, 1)
m.set(1, 1, 2)
plot(m.eigenvalues().get(0))
plot(m.eigenvalues().get(1))`;
  const input = {
    timeframe: '60',
    syminfo: { timezone: 'UTC' },
    bars: [{ time: 1700000000, open: 1, high: 2, low: 1, close: 2, volume: 1 }],
  };
  const result = run(source, input);
  assert.deepEqual(result.diagnostics, []);
  close(
    result.plots.map((plot) => Number(plot.values[0])),
    [2.618033988749895, 0.3819660112501053],
  );
});

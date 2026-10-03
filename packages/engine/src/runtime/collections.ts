import { mean, missing, mode, num, percentile, sum, variance } from './numeric.ts';
import { tostring } from './format.ts';
import { eigenvalues } from './eigenvalues.ts';
import type { MutationJournal } from './rollback.ts';

/** TradingView caps every collection at 100,000 elements; matrices count rows × columns. */
export const MAX_COLLECTION_SIZE = 100_000;

/** Sizes come from script values: reject na, fractions and negatives before allocating. */
export function collectionSize(value: unknown, what: string): number {
  const size = num(value);
  if (!Number.isInteger(size) || size < 0)
    throw new Error(
      `Invalid ${what} (${missing(size) ? 'na' : String(value)}): expected a non-negative integer`,
    );
  return size;
}

/** Growth paths check capacity first, so an oversized request is a diagnostic, not an OOM. */
export function ensureCapacity(size: number, what: string): void {
  if (size > MAX_COLLECTION_SIZE)
    throw new Error(`${what} size ${size} exceeds the ${MAX_COLLECTION_SIZE} element limit`);
}

export function arrayBuiltin(name: string, a: unknown[], journal?: MutationJournal): unknown {
  if (
    [
      'set',
      'push',
      'pop',
      'shift',
      'unshift',
      'insert',
      'remove',
      'clear',
      'sort',
      'reverse',
      'concat',
      'fill',
    ].includes(name)
  )
    journal?.capture(a[0]);
  if (name === 'from') return [...a];
  if (name === 'new' || name.startsWith('new_')) {
    const size = collectionSize(a[0] ?? 0, 'array size');
    ensureCapacity(size, 'Array');
    return Array(size).fill(a[1] ?? NaN);
  }
  const arr = requireArray(a[0]),
    numeric = () => arr.map(num).filter((v) => !missing(v));
  const index = (value: unknown, allowEnd = false) => {
    const i = num(value);
    if (!Number.isInteger(i) || i < 0 || i >= arr.length + (allowEnd ? 1 : 0))
      throw new Error(`Array index ${i} is outside array of size ${arr.length}`);
    return i;
  };
  switch (name) {
    case 'size':
      return arr.length;
    case 'get':
      return arr[index(a[1])];
    case 'set':
      arr[index(a[1])] = a[2];
      return null;
    case 'push':
      ensureCapacity(arr.length + 1, 'Array');
      arr.push(a[1]);
      return null;
    case 'pop':
      if (!arr.length) throw new Error('Cannot pop empty array');
      return arr.pop();
    case 'shift':
      if (!arr.length) throw new Error('Cannot shift empty array');
      return arr.shift();
    case 'unshift':
      ensureCapacity(arr.length + 1, 'Array');
      arr.unshift(a[1]);
      return null;
    case 'insert':
      ensureCapacity(arr.length + 1, 'Array');
      arr.splice(index(a[1], true), 0, a[2]);
      return null;
    case 'remove':
      return arr.splice(index(a[1]), 1)[0];
    case 'clear':
      arr.length = 0;
      return null;
    case 'copy':
      return [...arr];
    case 'first':
      return arr[index(0)];
    case 'last':
      return arr[index(arr.length - 1)];
    case 'sum':
      return sum(numeric());
    case 'avg':
      return mean(numeric());
    case 'min':
      return [...numeric()].sort((a, b) => a - b)[num(a[1] ?? 0)] ?? NaN;
    case 'max':
      return [...numeric()].sort((a, b) => b - a)[num(a[1] ?? 0)] ?? NaN;
    case 'variance':
      return variance(numeric(), a[1] !== false);
    case 'stdev':
      return Math.sqrt(variance(numeric(), a[1] !== false));
    case 'median':
      return percentile(numeric(), 50);
    case 'mode':
      return mode(numeric());
    case 'range':
      return Math.max(...numeric()) - Math.min(...numeric());
    case 'sort':
      arr.sort(
        (x, y) =>
          (typeof x === 'string' ? x.localeCompare(String(y)) : num(x) - num(y)) *
          (a[1] === 'order.descending' ? -1 : 1),
      );
      return null;
    case 'sort_indices':
      return arr
        .map((_, i) => i)
        .sort((x, y) => (num(arr[x]) - num(arr[y])) * (a[1] === 'order.descending' ? -1 : 1));
    case 'reverse':
      arr.reverse();
      return null;
    case 'indexof':
      return arr.indexOf(a[1]);
    case 'lastindexof':
      return arr.lastIndexOf(a[1]);
    case 'includes':
      return arr.includes(a[1]);
    case 'binary_search': {
      let lo = 0,
        hi = arr.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] === a[1]) return mid;
        if (num(arr[mid]) < num(a[1])) lo = mid + 1;
        else hi = mid - 1;
      }
      return -1;
    }
    case 'binary_search_leftmost': {
      let i = 0;
      while (i < arr.length && num(arr[i]) < num(a[1])) i++;
      return i < arr.length && arr[i] === a[1] ? i : Math.max(0, i - 1);
    }
    case 'binary_search_rightmost': {
      let i = arr.length - 1;
      while (i >= 0 && num(arr[i]) > num(a[1])) i--;
      return i >= 0 && arr[i] === a[1] ? i : Math.min(arr.length - 1, i + 1);
    }
    case 'slice':
      return arr.slice(index(a[1], true), index(a[2], true));
    case 'concat': {
      const other = requireArray(a[1]);
      ensureCapacity(arr.length + other.length, 'Array');
      arr.push(...other);
      return arr;
    }
    case 'fill':
      arr.fill(a[1], num(a[2] ?? 0), num(a[3] ?? arr.length));
      return null;
    case 'abs':
      return arr.map((v) => Math.abs(num(v)));
    case 'join':
      return arr.map((v) => tostring(v)).join(String(a[1] ?? ','));
    case 'covariance': {
      const x = numeric(),
        y = requireArray(a[1]).map(num),
        mx = mean(x),
        my = mean(y);
      return sum(x.map((v, i) => (v - mx) * (y[i] - my))) / (x.length - (a[2] === false ? 1 : 0));
    }
    case 'percentile_nearest_rank':
      return percentile(numeric(), num(a[1]), true);
    case 'percentile_linear_interpolation':
      return percentile(numeric(), num(a[1]));
    case 'percentrank': {
      const valueIndex = index(a[1]);
      const values = arr.filter((_, i) => i !== valueIndex).map(num);
      return values.length
        ? (values.filter((v) => v <= num(arr[valueIndex])).length / values.length) * 100
        : NaN;
    }
    default:
      throw Object.assign(new Error(`Unsupported array.${name}`), { kind: 'unsupported' });
  }
}
const matrixStorageArguments: Record<string, string[]> = {
  new: ['rows', 'columns', 'initial_value'],
  set: ['id', 'row', 'column', 'value'],
  get: ['id', 'row', 'column'],
  row: ['id', 'row'],
  col: ['id', 'column'],
  rows: ['id'],
  columns: ['id'],
  copy: ['id'],
  transpose: ['id'],
  fill: ['id', 'value', 'from_row', 'to_row', 'from_column', 'to_column'],
};

export function matrixBuiltin(
  name: string,
  a: unknown[],
  journal?: MutationJournal,
  named: Record<string, unknown> = {},
): unknown {
  if (matrixStorageArguments[name])
    a = matrixStorageArguments[name].map((key, position) =>
      Object.hasOwn(named, key) ? named[key] : a[position],
    );
  if (name === 'new') {
    const rows = collectionSize(a[0] ?? 0, 'matrix row count'),
      columns = collectionSize(a[1] ?? 0, 'matrix column count');
    ensureCapacity(rows * columns, 'Matrix');
    return Array.from({ length: rows }, () => Array(columns).fill(a[2] ?? NaN));
  }
  const rows = requireArray(a[0]);
  const row = (value: unknown) => {
    const index = num(value);
    if (!Number.isInteger(index) || index < 0 || index >= rows.length)
      throw new Error('Matrix row is outside its bounds');
    return requireArray(rows[index]);
  };
  const cellIndex = (row: unknown[], value: unknown) => {
    const index = num(value);
    if (!Number.isInteger(index) || index < 0 || index >= row.length)
      throw new Error('Matrix column is outside its bounds');
    return index;
  };
  // Storage operations preserve element identity without interpreting drawing IDs.
  switch (name) {
    case 'set': {
      const target = row(a[1]);
      journal?.capture(target);
      target[cellIndex(target, a[2])] = a[3];
      return null;
    }
    case 'get':
      return row(a[1])[cellIndex(row(a[1]), a[2])];
    case 'row':
      return [...row(a[1])];
    case 'col':
      return rows.map((value) => {
        const cells = requireArray(value);
        return cells[cellIndex(cells, a[1])];
      });
    case 'rows':
      return rows.length;
    case 'columns':
      return rows.length ? requireArray(rows[0]).length : 0;
    case 'copy':
      return rows.map((row) => [...requireArray(row)]);
    case 'transpose':
      return (rows[0] ? requireArray(rows[0]) : []).map((_, index) =>
        rows.map((row) => requireArray(row)[index]),
      );
    case 'fill': {
      const fromRow = num(a[2] ?? 0),
        toRow = num(a[3] ?? rows.length);
      const fromColumn = num(a[4] ?? 0),
        toColumn = num(a[5] ?? (rows.length ? requireArray(rows[0]).length : 0));
      if (
        ![fromRow, toRow, fromColumn, toColumn].every(Number.isInteger) ||
        fromRow < 0 ||
        toRow > rows.length ||
        fromRow > toRow ||
        fromColumn < 0 ||
        fromColumn > toColumn ||
        rows.some((row) => toColumn > requireArray(row).length)
      )
        throw new Error('Matrix fill range is outside its bounds');
      for (let index = fromRow; index < toRow; index++) {
        const target = requireArray(rows[index]);
        journal?.capture(target);
        target.fill(a[1], fromColumn, toColumn);
      }
      return null;
    }
  }
  const m = rows.map((row) => requireArray(row).map(num));
  switch (name) {
    case 'eigenvalues':
      return eigenvalues(m);
    case 'avg':
      return mean(m.flat());
    case 'max':
      return Math.max(...m.flat());
    case 'min':
      return Math.min(...m.flat());
    case 'trace':
      return sum(m.map((row, i) => row[i]));
    case 'mult': {
      const other = a[1];
      if (typeof other === 'number') return m.map((row) => row.map((v) => v * other));
      const right = requireArray(other).map((row) => requireArray(row).map(num));
      if ((m[0]?.length ?? 0) !== right.length)
        throw new Error('Matrix multiplication dimensions do not agree');
      return m.map((row) =>
        (right[0] ?? []).map((_, j) => sum(row.map((v, k) => v * right[k][j]))),
      );
    }
    case 'det': {
      const copy = m.map((row) => [...row]);
      let determinant = 1;
      for (let i = 0; i < copy.length; i++) {
        let pivot = i;
        for (let k = i + 1; k < copy.length; k++)
          if (Math.abs(copy[k][i]) > Math.abs(copy[pivot][i])) pivot = k;
        if (!copy[pivot][i]) return 0;
        if (pivot !== i) {
          [copy[i], copy[pivot]] = [copy[pivot], copy[i]];
          determinant *= -1;
        }
        const d = copy[i][i];
        determinant *= d;
        for (let k = i + 1; k < copy.length; k++) {
          const f = copy[k][i] / d;
          for (let j = i + 1; j < copy.length; j++) copy[k][j] -= f * copy[i][j];
        }
      }
      return determinant;
    }
    default:
      throw Object.assign(new Error(`Unsupported matrix.${name}`), { kind: 'unsupported' });
  }
}

export function mapBuiltin(name: string, a: unknown[], journal?: MutationJournal): unknown {
  if (['put', 'put_all', 'remove', 'clear'].includes(name)) journal?.capture(a[0]);
  if (name === 'new') return new Map<unknown, unknown>();
  const map = a[0];
  if (!(map instanceof Map)) throw new Error('Expected a map');
  switch (name) {
    case 'new':
      return new Map();
    case 'put': {
      if (!map.has(a[1])) ensureCapacity(map.size + 1, 'Map');
      const old = map.get(a[1]);
      map.set(a[1], a[2]);
      return old ?? NaN;
    }
    case 'get':
      return map.get(a[1]) ?? NaN;
    case 'contains':
      return map.has(a[1]);
    case 'size':
      return map.size;
    case 'keys':
      return [...map.keys()];
    case 'values':
      return [...map.values()];
    case 'remove': {
      const old = map.get(a[1]);
      map.delete(a[1]);
      return old ?? NaN;
    }
    case 'clear':
      map.clear();
      return null;
    case 'copy':
      return new Map(map);
    case 'put_all': {
      const other = a[1];
      if (!(other instanceof Map)) throw new Error('Expected a map');
      ensureCapacity(map.size + other.size, 'Map');
      for (const [key, value] of other) map.set(key, value);
      return null;
    }
    default:
      throw Object.assign(new Error(`Unsupported map.${name}`), { kind: 'unsupported' });
  }
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected an array');
  return value;
}

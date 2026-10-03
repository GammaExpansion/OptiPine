/** Real parts of eigenvalues: implicit QL for symmetric matrices, Hessenberg QR otherwise. */
export function eigenvalues(matrix: number[][]): number[] {
  const size = matrix.length;
  if (!size || matrix.some((row) => row.length !== size))
    throw new Error('matrix.eigenvalues requires a nonempty square matrix');
  if (matrix.some((row) => row.some((value) => !Number.isFinite(value))))
    throw new Error('matrix.eigenvalues requires finite matrix elements');
  const symmetric = matrix.every((row, i) => row.every((value, j) => value === matrix[j][i]));

  // Scaling avoids overflow in the Householder norm and preserves very small matrices.
  const scale = Math.max(...matrix.flat().map(Math.abs));
  if (scale === 0) return Array(size).fill(0);
  const work = matrix.map((row) => row.map((value) => value / scale));
  const result = symmetric
    ? symmetricEigenvalues(work).sort((a, b) => b - a)
    : realEigenvalues(work);
  return result.map((value) => value * scale);
}

function symmetricEigenvalues(work: number[][]): number[] {
  const size = work.length;
  const diagonal = Array<number>(size).fill(0);
  const off = Array<number>(size).fill(0);
  for (let i = size - 1; i > 0; i--) {
    const last = i - 1;
    let norm = 0;
    let rowScale = 0;
    for (let k = 0; k <= last; k++) rowScale += Math.abs(work[i][k]);
    if (rowScale === 0) off[i] = work[i][last];
    else {
      for (let k = 0; k <= last; k++) {
        work[i][k] /= rowScale;
        norm += work[i][k] * work[i][k];
      }
      let f = work[i][last];
      let g = f >= 0 ? -Math.sqrt(norm) : Math.sqrt(norm);
      off[i] = rowScale * g;
      norm -= f * g;
      work[i][last] = f - g;
      f = 0;
      for (let j = 0; j <= last; j++) {
        g = 0;
        for (let k = 0; k <= j; k++) g += work[j][k] * work[i][k];
        for (let k = j + 1; k <= last; k++) g += work[k][j] * work[i][k];
        off[j] = g / norm;
        f += off[j] * work[i][j];
      }
      const adjustment = f / (2 * norm);
      for (let j = 0; j <= last; j++) {
        f = work[i][j];
        g = off[j] - adjustment * f;
        off[j] = g;
        for (let k = 0; k <= j; k++) work[j][k] -= f * off[k] + g * work[i][k];
      }
    }
  }
  for (let i = 0; i < size; i++) diagonal[i] = work[i][i];
  for (let i = 1; i < size; i++) off[i - 1] = off[i];
  off[size - 1] = 0;

  for (let start = 0; start < size; start++) {
    let iterations = 0;
    while (true) {
      let end = start;
      while (
        end < size - 1 &&
        Math.abs(off[end]) >
          Number.EPSILON * (Math.abs(diagonal[end]) + Math.abs(diagonal[end + 1]))
      )
        end++;
      if (end === start) break;
      if (++iterations > 100)
        throw new Error('matrix.eigenvalues did not converge within its iteration limit');
      let g = (diagonal[start + 1] - diagonal[start]) / (2 * off[start]);
      let r = Math.hypot(g, 1);
      g = diagonal[end] - diagonal[start] + off[start] / (g + (g >= 0 ? r : -r));
      let sine = 1;
      let cosine = 1;
      let shift = 0;
      let restart = false;
      for (let i = end - 1; i >= start; i--) {
        const f = sine * off[i];
        const b = cosine * off[i];
        r = Math.hypot(f, g);
        off[i + 1] = r;
        if (r === 0) {
          diagonal[i + 1] -= shift;
          off[end] = 0;
          restart = true;
          break;
        }
        sine = f / r;
        cosine = g / r;
        g = diagonal[i + 1] - shift;
        r = (diagonal[i] - g) * sine + 2 * cosine * b;
        shift = sine * r;
        diagonal[i + 1] = g + shift;
        g = cosine * r - b;
      }
      if (restart) continue;
      diagonal[start] -= shift;
      off[start] = g;
      off[end] = 0;
    }
  }
  return diagonal;
}

/** Orthogonal similarity transforms reduce the matrix to upper Hessenberg form. */
function hessenberg(matrix: number[][]): void {
  const size = matrix.length;
  for (let start = 1; start < size - 1; start++) {
    const vector = matrix.map((row, i) => (i >= start ? row[start - 1] : 0));
    let norm = Math.hypot(...vector);
    if (norm === 0) continue;
    if (vector[start] >= 0) norm = -norm;
    vector[start] -= norm;
    const denominator = vector.reduce((sum, value) => sum + value * value, 0) / 2;
    for (let j = start; j < size; j++) {
      let dot = 0;
      for (let i = start; i < size; i++) dot += vector[i] * matrix[i][j];
      dot /= denominator;
      for (let i = start; i < size; i++) matrix[i][j] -= dot * vector[i];
    }
    for (let i = 0; i < size; i++) {
      let dot = 0;
      for (let j = start; j < size; j++) dot += vector[j] * matrix[i][j];
      dot /= denominator;
      for (let j = start; j < size; j++) matrix[i][j] -= dot * vector[j];
    }
    matrix[start][start - 1] = norm;
    for (let i = start + 1; i < size; i++) matrix[i][start - 1] = 0;
  }
}

/** Francis double-shift QR; deflated roots retain their matrix order. */
function realEigenvalues(matrix: number[][]): number[] {
  hessenberg(matrix);
  const size = matrix.length;
  const roots = Array<number>(size).fill(0);
  const norm = matrix.reduce(
    (sum, row, i) =>
      sum + row.slice(Math.max(0, i - 1)).reduce((sum, value) => sum + Math.abs(value), 0),
    0,
  );
  let end = size - 1;
  let shift = 0;
  let iterations = 0;
  while (end >= 0) {
    let start = end;
    while (start > 0) {
      const scale = Math.abs(matrix[start - 1][start - 1]) + Math.abs(matrix[start][start]) || norm;
      if (Math.abs(matrix[start][start - 1]) <= Number.EPSILON * scale) break;
      start--;
    }
    let x = matrix[end][end];
    if (start === end) {
      roots[end--] = x + shift;
      iterations = 0;
      continue;
    }
    let y = matrix[end - 1][end - 1];
    let w = matrix[end][end - 1] * matrix[end - 1][end];
    if (start === end - 1) {
      const p = (y - x) / 2;
      const discriminant = p * p + w;
      if (discriminant < 0) {
        // Pine exposes the real components of a conjugate pair, observed for
        // the rotation matrix in I_eigen_complex's unmodified native export.
        roots[end - 1] = roots[end] = x + shift + p;
      } else {
        const z = p + (p >= 0 ? 1 : -1) * Math.sqrt(discriminant);
        roots[end - 1] = x + shift + z;
        roots[end] = z === 0 ? x + shift : x + shift - w / z;
      }
      end -= 2;
      iterations = 0;
      continue;
    }
    if (++iterations > 100)
      throw new Error('matrix.eigenvalues did not converge within its iteration limit');
    // Exceptional shifts break cycles when the normal trailing-block shift stalls.
    if (iterations === 10 || iterations === 20) {
      shift += x;
      for (let i = 0; i <= end; i++) matrix[i][i] -= x;
      const scale = Math.abs(matrix[end][end - 1]) + Math.abs(matrix[end - 1][end - 2]);
      x = y = 0.75 * scale;
      w = -0.4375 * scale * scale;
    }

    let pivot = end - 2;
    let p = 0;
    let q = 0;
    let r = 0;
    for (; pivot >= start; pivot--) {
      const z = matrix[pivot][pivot];
      const dx = x - z;
      const dy = y - z;
      p = (dx * dy - w) / matrix[pivot + 1][pivot] + matrix[pivot][pivot + 1];
      q = matrix[pivot + 1][pivot + 1] - z - dx - dy;
      r = matrix[pivot + 2][pivot + 1];
      const scale = Math.abs(p) + Math.abs(q) + Math.abs(r);
      if (scale === 0) break;
      p /= scale;
      q /= scale;
      r /= scale;
      if (pivot === start) break;
      const left = Math.abs(matrix[pivot][pivot - 1]) * (Math.abs(q) + Math.abs(r));
      const right =
        Number.EPSILON *
        Math.abs(p) *
        (Math.abs(matrix[pivot - 1][pivot - 1]) +
          Math.abs(z) +
          Math.abs(matrix[pivot + 1][pivot + 1]));
      if (left <= right) break;
    }
    for (let i = pivot + 2; i <= end; i++) {
      matrix[i][i - 2] = 0;
      if (i > pivot + 2) matrix[i][i - 3] = 0;
    }
    for (let k = pivot; k < end; k++) {
      const three = k !== end - 1;
      let scale = 1;
      if (k !== pivot) {
        p = matrix[k][k - 1];
        q = matrix[k + 1][k - 1];
        r = three ? matrix[k + 2][k - 1] : 0;
        scale = Math.abs(p) + Math.abs(q) + Math.abs(r);
        if (scale === 0) continue;
        p /= scale;
        q /= scale;
        r /= scale;
      }
      const magnitude = (p >= 0 ? 1 : -1) * Math.hypot(p, q, r);
      if (magnitude === 0) continue;
      if (k !== pivot) matrix[k][k - 1] = -magnitude * scale;
      else if (start !== pivot) matrix[k][k - 1] = -matrix[k][k - 1];
      p += magnitude;
      const a = p / magnitude;
      const b = q / magnitude;
      const c = r / magnitude;
      q /= p;
      r /= p;
      for (let j = k; j <= end; j++) {
        let value = matrix[k][j] + q * matrix[k + 1][j];
        if (three) {
          value += r * matrix[k + 2][j];
          matrix[k + 2][j] -= value * c;
        }
        matrix[k + 1][j] -= value * b;
        matrix[k][j] -= value * a;
      }
      for (let i = start; i <= Math.min(end, k + 3); i++) {
        let value = a * matrix[i][k] + b * matrix[i][k + 1];
        if (three) {
          value += c * matrix[i][k + 2];
          matrix[i][k + 2] -= value * r;
        }
        matrix[i][k + 1] -= value * q;
        matrix[i][k] -= value;
      }
    }
  }
  return roots;
}

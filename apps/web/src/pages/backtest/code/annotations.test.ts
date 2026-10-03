import { expect, test } from 'vitest';
import type { BacktestState } from '../../../workflows/backtest.ts';
import type { InputField } from '../../../workflows/inputs.ts';
import { codeMarks, inputNotes, lineKinds, visualWidth, wordAt } from './annotations.ts';

const field = (title: string, line: number, changed = false, readOnly = false) =>
  ({
    descriptor: { title, line, type: 'int' },
    value: 1,
    changed,
    readOnly: readOnly ? { kind: 'message', id: 'x', values: {} } : null,
  }) as unknown as InputField;
const failedCompile = {
  status: 'failed',
  error: null,
  diagnostics: [
    { kind: 'undeclared', line: 15, column: 21, message: "Undeclared identifier 'lenght'" },
    { kind: 'unsupported', line: 19, message: 'request.security() is not supported' },
  ],
};
const failedRun = {
  status: 'failed',
  startedAt: 1,
  finishedAt: 2,
  failure: {
    diagnostics: [{ kind: 'runtime', line: 31, bar: 3, message: 'Stopped' }],
    bar: 3,
    error: null,
  },
};

test('compile and run diagnostics become marks; unsupported features are not errors', () => {
  const marks = codeMarks({
    compile: failedCompile,
    run: failedRun,
    preview: null,
  } as unknown as BacktestState);
  expect(marks).toEqual([
    { line: 15, column: 21, kind: 'er', message: "Undeclared identifier 'lenght'" },
    { line: 19, column: null, kind: 'fx', message: 'request.security() is not supported' },
    { line: 31, column: null, kind: 'er', message: 'Stopped' },
  ]);
  const preview = { run: { status: 'done' } };
  expect(
    codeMarks({
      compile: { status: 'compiled' },
      run: failedRun,
      preview,
    } as unknown as BacktestState),
  ).toEqual([]);
});

test('editable inputs annotate their lines unless the compile failed', () => {
  const inputs = [field('Length', 9), field('ATR', 10, false, true), field('Mult', 11, true)];
  const notes = inputNotes({ compile: { status: 'compiled' }, inputs } as unknown as BacktestState);
  expect(notes.map((note) => note.line)).toEqual([9, 11]);
  expect(inputNotes({ compile: failedCompile, inputs } as unknown as BacktestState)).toEqual([]);
  const marks = codeMarks({ compile: failedCompile, run: failedRun, preview: null } as never);
  const kinds = lineKinds(marks, [...notes, { line: 15, field: field('X', 15, true) }]);
  expect([...kinds].sort(([a], [b]) => a - b)).toEqual([
    [11, 'in'],
    [15, 'er'],
    [19, 'fx'],
    [31, 'er'],
  ]);
});

test('a squiggle covers the identifier or dotted name at a 1-based column', () => {
  const text = 'daily = request.security(syminfo.tickerid, "D", close)';
  expect(wordAt(text, 9)).toEqual({ from: 8, to: 24 });
  expect(wordAt('basis = ta.sma(src, lenght)', 21)).toEqual({ from: 20, to: 26 });
  expect(wordAt('a + b', 3)).toEqual({ from: 2, to: 3 });
  expect(wordAt('abc', 4)).toBeNull();
  expect(wordAt('abc', 0)).toBeNull();
});

test('tabs widen a line to the next stop', () => {
  expect(visualWidth('abc')).toBe(3);
  expect(visualWidth('\tx')).toBe(5);
  expect(visualWidth('ab\tx', 4)).toBe(5);
});

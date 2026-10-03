import type { Diagnostic } from '@pine/engine';
import type { BacktestState } from '../../../workflows/backtest.ts';
import type { InputField } from '../../../workflows/inputs.ts';

/**
 * The mock's line kinds (`.cl.in`, `.cl.fx`, `.cl.er`): an input whose value the right panel
 * overrides, missing engine support, and an error.
 */
export type LineKind = 'in' | 'fx' | 'er';

/** A diagnostic on a line of the source, squiggled from its column when it has one (B10). */
export interface CodeMark {
  readonly line: number;
  /** 1-based, as the engine reports it. */
  readonly column: number | null;
  readonly kind: Exclude<LineKind, 'in'>;
  readonly message: string;
}

/** An input's current value beside its declaration line (B3). */
export interface InputNote {
  readonly line: number;
  readonly field: InputField;
}

const markOf = (diagnostic: Diagnostic): CodeMark => ({
  line: diagnostic.line,
  column: diagnostic.column ?? null,
  kind: diagnostic.kind === 'unsupported' ? 'fx' : 'er',
  message: diagnostic.message,
});

/** The failed compile's diagnostics, then the displayed run's (the preview's while it is open). */
export function codeMarks(state: Pick<BacktestState, 'compile' | 'run' | 'preview'>): CodeMark[] {
  const marks =
    state.compile.status === 'failed' ? state.compile.diagnostics.map(markOf) : ([] as CodeMark[]);
  const { run } = state.preview ?? state;
  if (run.status === 'failed') marks.push(...run.failure.diagnostics.map(markOf));
  return marks;
}

/**
 * Editable inputs by declaration line. A failed compile hides them: they come from the last
 * successful compile and may no longer sit on those lines (B10).
 */
export function inputNotes(state: Pick<BacktestState, 'compile' | 'inputs'>): InputNote[] {
  if (state.compile.status === 'failed') return [];
  return state.inputs
    .filter((field) => !field.readOnly)
    .map((field) => ({ line: field.descriptor.line, field }));
}

/** Each line's kind, the strongest first: an error, then missing support, then an override. */
export function lineKinds(marks: readonly CodeMark[], notes: readonly InputNote[]) {
  const kinds = new Map<number, LineKind>();
  const rank = { er: 3, fx: 2, in: 1 };
  const add = (line: number, kind: LineKind) => {
    const current = kinds.get(line);
    if (!current || rank[kind] > rank[current]) kinds.set(line, kind);
  };
  for (const mark of marks) add(mark.line, mark.kind);
  for (const note of notes) if (note.field.changed) add(note.line, 'in');
  return kinds;
}

/**
 * The squiggled span of a line from a 1-based column: the identifier or dotted name starting
 * there, at least one character. Offsets are 0-based within `text`; null past its end.
 */
export function wordAt(text: string, column: number): { from: number; to: number } | null {
  const from = column - 1;
  if (from < 0 || from >= text.length) return null;
  let to = from;
  while (to < text.length && /[\w.]/.test(text[to])) to++;
  return { from, to: Math.max(to, from + 1) };
}

/** Columns a line occupies in a monospace font, tabs expanded to `tabSize`. */
export function visualWidth(text: string, tabSize = 4): number {
  let width = 0;
  for (const char of text) width = char === '\t' ? width + tabSize - (width % tabSize) : width + 1;
  return width;
}

import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  HighlightStyle,
  StreamLanguage,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import {
  Compartment,
  EditorSelection,
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  WidgetType,
  drawSelection,
  gutterLineClass,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { visualWidth, wordAt, type CodeMark, type LineKind } from './annotations.ts';
import { pineTokens, type PineState, type PineStream } from './pine-tokens.ts';

/** An input's value beside its declaration line, already translated (B3). */
export interface ValueNote {
  readonly line: number;
  readonly text: string;
}

export interface Annotations {
  readonly marks: readonly CodeMark[];
  readonly values: readonly ValueNote[];
  readonly kinds: ReadonlyMap<number, LineKind>;
}

/** The callbacks an editor calls; the owner replaces `current` as its props change. */
export interface EditorHandlers {
  onChange(source: string): void;
  onRun(): void;
  onDropFile(file: File): void;
}

export const noAnnotations: Annotations = { marks: [], values: [], kinds: new Map() };
export const setAnnotations = StateEffect.define<Annotations>();

const annotationField = StateField.define<Annotations>({
  create: () => noAnnotations,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setAnnotations)) value = effect.value;
    return value;
  },
});

/** Annotations sit from this column, the mock's 556 px code column at 7.5 px per character. */
const valueColumn = 74;

class ValueWidget extends WidgetType {
  readonly text: string;
  readonly pad: number;
  constructor(text: string, pad: number) {
    super();
    this.text = text;
    this.pad = pad;
  }
  eq(other: ValueWidget) {
    return other.text === this.text && other.pad === this.pad;
  }
  toDOM() {
    const note = document.createElement('span');
    note.className = 'cm-input-value';
    const pad = document.createElement('span');
    pad.className = 'cm-input-value-pad';
    // `ch` in the code font, so the notes align however long their lines are.
    pad.style.width = `${this.pad}ch`;
    const label = document.createElement('span');
    label.className = 'cm-input-value-label';
    label.textContent = this.text;
    note.append(pad, label);
    return note;
  }
}

class KindMarker extends GutterMarker {
  readonly elementClass: string;
  constructor(kind: LineKind) {
    super();
    this.elementClass = `cm-gutter-${kind}`;
  }
}
const kindMarkers = {
  in: new KindMarker('in'),
  fx: new KindMarker('fx'),
  er: new KindMarker('er'),
};

const annotationDecorations = EditorView.decorations.compute(['doc', annotationField], (state) => {
  const { marks, values, kinds } = state.field(annotationField);
  const doc = state.doc;
  const ranges: Range<Decoration>[] = [];
  for (const [number, kind] of kinds)
    if (number >= 1 && number <= doc.lines)
      ranges.push(Decoration.line({ class: `cm-line-${kind}` }).range(doc.line(number).from));
  for (const mark of marks) {
    if (mark.column === null || mark.line < 1 || mark.line > doc.lines) continue;
    const line = doc.line(mark.line);
    const word = wordAt(line.text, mark.column);
    if (word)
      ranges.push(
        Decoration.mark({ class: 'cm-squiggle', attributes: { title: mark.message } }).range(
          line.from + word.from,
          line.from + word.to,
        ),
      );
  }
  for (const value of values) {
    if (value.line < 1 || value.line > doc.lines) continue;
    const line = doc.line(value.line);
    const pad = Math.max(3, valueColumn - visualWidth(line.text, state.tabSize));
    ranges.push(
      Decoration.widget({ widget: new ValueWidget(value.text, pad), side: 1 }).range(line.to),
    );
  }
  return Decoration.set(ranges, true);
});

const annotationGutter = gutterLineClass.compute(['doc', annotationField], (state) => {
  const builder = new RangeSetBuilder<GutterMarker>();
  const doc = state.doc;
  const lines = [...state.field(annotationField).kinds].sort(([a], [b]) => a - b);
  for (const [number, kind] of lines)
    if (number >= 1 && number <= doc.lines) {
      const from = doc.line(number).from;
      builder.add(from, from, kindMarkers[kind]);
    }
  return builder.finish();
});

const pineLanguage = StreamLanguage.define<PineState>({
  ...pineTokens,
  // StringStream types `next()` as `string | void`; at runtime it returns undefined at the end.
  token: (stream, state) => pineTokens.token(stream as unknown as PineStream, state),
});

/** The mock's syntax colours (`.kw`, `.fn`, `.st`, `.nu`, `.cm` in gen/ui.mjs). */
const pineHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.typeName], color: '#8fb8de' },
  { tag: tags.function(tags.variableName), color: '#d9c38c' },
  { tag: tags.string, color: '#a9c98f' },
  { tag: tags.number, color: '#e0a577' },
  { tag: tags.comment, color: '#6b727b' },
  { tag: tags.operator, color: 'var(--text)' },
]);

/** The mock's `.code` and `.cl` lines: 12.5 / 19 px, 46 px numbers, a 2 px kind border. */
const pineTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'var(--code-background)',
      color: 'var(--text)',
      fontSize: '12.5px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--font-code)', lineHeight: '19px' },
    '.cm-content': { padding: '10px 0', caretColor: 'var(--text)' },
    '.cm-line': { padding: '0' },
    '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--code-caption)' },
    '.cm-lineNumbers .cm-gutterElement': {
      boxSizing: 'border-box',
      minWidth: '48px',
      padding: '0 14px 0 0',
      borderLeft: '2px solid transparent',
      fontVariantNumeric: 'tabular-nums',
    },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgb(255 255 255 / 3.5%)' },
    '.cm-cursor, .cm-dropCursor': { borderLeft: '1.5px solid var(--text)' },
    '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
      { backgroundColor: 'var(--amber-border)' },
    '.cm-placeholder': { color: 'var(--code-caption)' },
    '.cm-line-in, .cm-gutterElement.cm-gutter-in': { backgroundColor: 'rgb(242 163 58 / 6%)' },
    '.cm-line-fx, .cm-gutterElement.cm-gutter-fx': {
      backgroundColor: 'rgb(255 255 255 / 2.5%)',
    },
    '.cm-line-er, .cm-gutterElement.cm-gutter-er': {
      backgroundColor: 'rgb(240 106 93 / 10%)',
    },
    '.cm-gutterElement.cm-gutter-in': {
      borderLeftColor: 'var(--primary)',
      color: 'var(--secondary)',
    },
    '.cm-gutterElement.cm-gutter-fx': {
      borderLeftColor: 'var(--subtle-border)',
      color: 'var(--secondary)',
    },
    '.cm-gutterElement.cm-gutter-er': {
      borderLeftColor: 'var(--loss)',
      color: 'var(--danger-text)',
    },
    '.cm-squiggle': {
      textDecoration: 'underline wavy var(--loss)',
      textUnderlineOffset: '3px',
    },
    '.cm-input-value-pad': { display: 'inline-block' },
    '.cm-input-value-label': {
      fontFamily: 'var(--font-body)',
      fontSize: '12px',
      color: 'var(--secondary)',
      fontVariantNumeric: 'tabular-nums',
    },
  },
  { dark: true },
);

/** Language-dependent configuration, shared by every editor so a kept state can be updated. */
const localized = new Compartment();

export function localizedConfig(label: string, emptyText: string): Extension {
  return [placeholder(emptyText), EditorView.contentAttributes.of({ 'aria-label': label })];
}

export interface EditorOptions {
  readonly readOnly: boolean;
  readonly label: string;
  readonly emptyText: string;
}

/** Everything a Pine editor needs; `handlers.current` is read at call time. */
export function pineExtensions(
  handlers: { current: EditorHandlers },
  { readOnly, label, emptyText }: EditorOptions,
): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    indentUnit.of('    '),
    pineLanguage,
    syntaxHighlighting(pineHighlight),
    pineTheme,
    annotationField,
    annotationDecorations,
    annotationGutter,
    localized.of(localizedConfig(label, emptyText)),
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    keymap.of([
      // The page's run shortcut; editors own their keys, so the editor runs it itself.
      {
        key: 'Mod-Enter',
        run: () => {
          handlers.current.onRun();
          return true;
        },
      },
      ...historyKeymap,
      ...defaultKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) handlers.current.onChange(update.state.doc.toString());
    }),
    EditorView.domEventHandlers({
      dragover(event) {
        if (!event.dataTransfer?.types.includes('Files')) return false;
        event.preventDefault();
        return true;
      },
      drop(event) {
        const file = event.dataTransfer?.files[0];
        if (!file) return false;
        // A dropped file replaces the script; it is never inserted as text.
        event.preventDefault();
        handlers.current.onDropFile(file);
        return true;
      },
    }),
  ];
}

export function relocalize(view: EditorView, label: string, emptyText: string): void {
  view.dispatch({ effects: localized.reconfigure(localizedConfig(label, emptyText)) });
}

/** Scroll `line` to the middle of the view and, when `select`, select it and focus the editor. */
export function revealLine(view: EditorView, line: number, select: boolean): void {
  const doc = view.state.doc;
  const target = doc.line(Math.min(Math.max(1, line), doc.lines));
  view.dispatch({
    selection: select ? EditorSelection.range(target.from, target.to) : undefined,
    effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
  });
  if (select) view.focus();
}

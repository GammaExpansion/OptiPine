import { useEffect, useLayoutEffect, useRef } from 'react';
import { EditorState, type StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  pineExtensions,
  relocalize,
  revealLine,
  setAnnotations,
  type Annotations,
  type EditorHandlers,
  type EditorOptions,
} from './editor.ts';

/** A request to scroll to a line; a new `seq` repeats the request for the same line. */
export interface RevealRequest {
  readonly line: number;
  readonly seq: number;
}

interface Kept {
  state: EditorState;
  handlers: { current: EditorHandlers };
  scroll: StateEffect<unknown>;
  revealed: RevealRequest | null;
}
/** Editor states by owner, so switching dock tabs keeps the cursor, scroll and undo history. */
const kept = new WeakMap<object, Kept>();

const ignore = () => {};

export function PineEditor({
  source,
  annotations,
  label,
  emptyText,
  readOnly = false,
  reveal = null,
  selectOnReveal = false,
  keepAs,
  onChange = ignore,
  onRun = ignore,
  onDropFile = ignore,
  className,
}: {
  source: string;
  annotations: Annotations;
  label: string;
  emptyText: string;
  readOnly?: boolean;
  reveal?: RevealRequest | null;
  /** Select the revealed line and focus the editor; otherwise only scroll to it. */
  selectOnReveal?: boolean;
  /** The owner whose editor state outlives this component; omit for a fresh state per mount. */
  keepAs?: object;
  className?: string;
} & Partial<EditorHandlers>) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef<{ current: EditorHandlers }>({
    current: { onChange, onRun, onDropFile },
  });
  const revealed = useRef<RevealRequest | null>(null);
  const latest = useRef({ annotations, options: { readOnly, label, emptyText } as EditorOptions });
  latest.current = { annotations, options: { readOnly, label, emptyText } };

  // The view lives as long as the component; the effects below apply prop changes to it.
  useLayoutEffect(() => {
    const saved = keepAs ? kept.get(keepAs) : undefined;
    const reuse = saved && saved.state.doc.toString() === source ? saved : undefined;
    if (saved) {
      handlers.current = saved.handlers;
      revealed.current = saved.revealed;
    }
    const editor = new EditorView({
      parent: host.current!,
      state:
        reuse?.state ??
        EditorState.create({
          doc: source,
          extensions: pineExtensions(handlers.current, latest.current.options),
        }),
      scrollTo: reuse?.scroll,
    });
    view.current = editor;
    return () => {
      if (keepAs)
        kept.set(keepAs, {
          state: editor.state,
          handlers: handlers.current,
          scroll: editor.scrollSnapshot(),
          revealed: revealed.current,
        });
      editor.destroy();
      view.current = null;
    };
  }, []);

  // After the mount effect, which may adopt a kept handler object.
  useLayoutEffect(() => {
    handlers.current.current = { onChange, onRun, onDropFile };
  });

  useEffect(() => {
    const editor = view.current!;
    if (editor.state.doc.toString() === source) return;
    // A different script: a new state, so undo cannot reach across scripts.
    editor.setState(
      EditorState.create({
        doc: source,
        extensions: pineExtensions(handlers.current, latest.current.options),
      }),
    );
    editor.dispatch({ effects: setAnnotations.of(latest.current.annotations) });
  }, [source]);

  useEffect(() => {
    view.current!.dispatch({ effects: setAnnotations.of(annotations) });
  }, [annotations]);

  useEffect(() => {
    relocalize(view.current!, label, emptyText);
  }, [label, emptyText]);

  // A request made while the editor is hidden, inside a collapsed dock, waits until it shows:
  // a hidden editor can neither scroll nor take focus.
  useEffect(() => {
    const previous = revealed.current;
    if (!reveal || (previous && previous.line === reveal.line && previous.seq === reveal.seq))
      return;
    const element = host.current!;
    const apply = () => {
      if (element.closest('[hidden]')) return false;
      revealed.current = reveal;
      revealLine(view.current!, reveal.line, selectOnReveal);
      return true;
    };
    if (apply()) return;
    const observer = new ResizeObserver(() => {
      if (apply()) observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [reveal, selectOnReveal]);

  return <div ref={host} className={className} />;
}

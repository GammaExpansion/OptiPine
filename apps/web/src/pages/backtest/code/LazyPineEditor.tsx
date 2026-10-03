import { lazy, startTransition, Suspense, useEffect, useRef, useState } from 'react';
import type { PineEditorProps } from './PineEditor.tsx';
import styles from './StaticEditor.module.css';

const PineEditor = lazy(() =>
  import('./PineEditor.tsx').then((module) => ({ default: module.PineEditor })),
);

/**
 * The empty editor without CodeMirror: it looks the same, and typing, pasting or dropping into it
 * reaches the editor's handlers, so nothing is lost while CodeMirror loads.
 */
function StaticEditor({
  source,
  label,
  emptyText,
  readOnly = false,
  className = '',
  onChange,
  onRun,
  onDropFile,
  onFocus,
  onBlur,
}: PineEditorProps & { onFocus: () => void; onBlur: () => void }) {
  return (
    <div className={`${className} ${styles.static}`}>
      <div className={styles.gutter} aria-hidden="true">
        {1}
      </div>
      <textarea
        className={styles.text}
        aria-label={label}
        placeholder={emptyText}
        value={source}
        readOnly={readOnly}
        spellCheck={false}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(event) => onChange?.(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onRun?.();
          }
        }}
        onDrop={(event) => {
          const file = event.dataTransfer.files[0];
          if (!file) return;
          event.preventDefault();
          onDropFile?.(file);
        }}
      />
    </div>
  );
}

/**
 * The Pine editor with CodeMirror in a chunk of its own. An empty editor, as the first screen
 * shows it, stays a static look-alike until there is a script or it takes focus, a paste or a
 * drop; CodeMirror then loads in a transition, so the look-alike stays until it can take over,
 * with the focus and the text typed meanwhile.
 */
export function LazyPineEditor(props: PineEditorProps) {
  const [wanted, setWanted] = useState(props.source !== '');
  const focused = useRef(false);
  const want = () => {
    if (!wanted) startTransition(() => setWanted(true));
  };
  useEffect(() => {
    if (props.source !== '') want();
  });
  const placeholder = (
    <StaticEditor
      {...props}
      onFocus={() => {
        focused.current = true;
        want();
      }}
      onBlur={() => (focused.current = false)}
    />
  );
  // An editor that mounts with a script waits for CodeMirror in an empty area of its size.
  return (
    <Suspense fallback={props.source === '' ? placeholder : <div className={props.className} />}>
      {wanted ? <PineEditor {...props} autoFocus={focused.current} /> : placeholder}
    </Suspense>
  );
}

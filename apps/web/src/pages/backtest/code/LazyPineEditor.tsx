import { lazy, Suspense } from 'react';
import type { PineEditorProps } from './PineEditor.tsx';

const PineEditor = lazy(() =>
  import('./PineEditor.tsx').then((module) => ({ default: module.PineEditor })),
);

/**
 * The Pine editor with CodeMirror in a chunk of its own, loaded when a code view first mounts, so
 * the first screen does not wait for it. Until then an empty area of the same size holds its place.
 */
export function LazyPineEditor(props: PineEditorProps) {
  return (
    <Suspense fallback={<div className={props.className} />}>
      <PineEditor {...props} />
    </Suspense>
  );
}

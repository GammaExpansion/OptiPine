import { lazy, startTransition, Suspense, useState } from 'react';
import { ScriptButton } from './ScriptButton.tsx';

const load = () => import('./ScriptMenuContent.tsx');
const ScriptMenuContent = lazy(() =>
  load().then((module) => ({ default: module.ScriptMenuContent })),
);

/**
 * The header's script button and menu (S2). The menu and its primitives are fetched when the
 * pointer or the focus first reaches the button, not with the page, and take the button's place
 * when it is first activated, opening at once. Until then the plain button stays in place.
 */
export function ScriptMenu() {
  const [requested, setRequested] = useState(false);
  const request = () => startTransition(() => setRequested(true));
  const button = (
    <ScriptButton
      onPointerEnter={() => void load()}
      onFocus={() => void load()}
      onClick={request}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown') return;
        event.preventDefault();
        request();
      }}
    />
  );
  return <Suspense fallback={button}>{requested ? <ScriptMenuContent /> : button}</Suspense>;
}

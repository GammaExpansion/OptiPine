import { getBacktestStore } from '../state/backtest.ts';
import { uiStore } from '../state/ui.ts';

let filePicker: (() => void) | undefined;

/** The script/file UI registers its picker while mounted; stale cleanup cannot remove a newer one. */
export function registerFilePicker(handler: () => void): () => void {
  filePicker = handler;
  return () => {
    if (filePicker === handler) filePicker = undefined;
  };
}

/** The element the key event is for, through shadow roots. */
function targetOf(event: KeyboardEvent): Element | undefined {
  return event.composedPath().find((item): item is Element => item instanceof Element);
}

/**
 * Ctrl + Enter runs the backtest and Ctrl + O opens a file. The listener runs in the capture
 * phase, ahead of a focused button's own Enter: the script menu's trigger, which keeps the focus
 * after an example loads, would otherwise reopen its menu and swallow the shortcut.
 *
 * Ctrl + O (Cmd + O too) is also the browser's Open File, which replaces the app with the chosen
 * file and loses the session, since nothing is saved (WEB.md 4.8). So the app takes it everywhere,
 * in the code editor and in fields too: it opens the app's picker, except in a dialog or a menu,
 * which keep the focus, and a held key opens one picker.
 */
export function installShortcuts(target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey) return;
    const element = targetOf(event);
    if (event.key.toLowerCase() === 'o' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const inDialog =
        uiStore.getState().openDialogs.length > 0 ||
        !!element?.closest('[role="dialog"], [role="alertdialog"], [role="menu"]');
      if (!event.repeat && !inDialog) filePicker?.();
      return;
    }
    if (event.repeat || !event.ctrlKey || event.metaKey || uiStore.getState().openDialogs.length)
      return;
    // Editors, input widgets and open menus own their other keys. A dialog also owns keys before
    // its UI state updates.
    if (
      element?.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), ' +
          '[role="textbox"], [role="combobox"], [role="spinbutton"], [role="dialog"], ' +
          '[role="alertdialog"], [role="menu"]',
      )
    )
      return;
    if (event.key === 'Enter' && uiStore.getState().page === 'backtest') {
      const state = getBacktestStore().getState();
      if ((state.preview ?? state).readiness.ok) {
        event.preventDefault();
        void state.actions.run();
      }
    }
  };
  target.addEventListener('keydown', onKeyDown, true);
  return () => target.removeEventListener('keydown', onKeyDown, true);
}

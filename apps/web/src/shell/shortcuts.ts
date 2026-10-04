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

/**
 * Ctrl + Enter runs the backtest and Ctrl + O opens a file. The listener runs in the capture
 * phase, ahead of a focused button's own Enter: the script menu's trigger, which keeps the focus
 * after an example loads, would otherwise reopen its menu and swallow the shortcut.
 */
export function installShortcuts(target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.repeat ||
      !event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey ||
      uiStore.getState().openDialogs.length
    )
      return;
    // Editors, input widgets and open menus own their keys. A dialog also owns keys before its UI
    // state updates.
    const element = event.composedPath().find((item) => item instanceof Element);
    if (
      element instanceof Element &&
      element.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), ' +
          '[role="textbox"], [role="combobox"], [role="spinbutton"], [role="dialog"], ' +
          '[role="alertdialog"], [role="menu"]',
      )
    )
      return;
    if (event.key.toLowerCase() === 'o' && filePicker) {
      event.preventDefault();
      filePicker();
    } else if (event.key === 'Enter' && uiStore.getState().page === 'backtest') {
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

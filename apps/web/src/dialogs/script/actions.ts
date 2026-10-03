import { createStore } from 'zustand/vanilla';
import { getBacktestStore } from '../../state/backtest.ts';
import { uiStore } from '../../state/ui.ts';

export const pasteStore = createStore(() => ({ source: '', clipboardFailed: false }));
let picker: (() => void) | undefined;

/** The header keeps the native picker mounted, including after first launch. */
export function setScriptPicker(next: () => void): () => void {
  picker = next;
  return () => {
    if (picker === next) picker = undefined;
  };
}
export function pickScriptFile(): void {
  picker?.();
}

export async function showPaste(readClipboard = false): Promise<void> {
  let source = '';
  let clipboardFailed = false;
  if (readClipboard) {
    try {
      source = await navigator.clipboard.readText();
    } catch {
      clipboardFailed = true;
    }
  }
  pasteStore.setState({ source, clipboardFailed });
  uiStore.getState().setDialogOpen('script', true);
}

export function downloadScript(fallbackName: string): void {
  const { source, fileName } = getBacktestStore().getState();
  const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName ?? fallbackName;
  link.click();
  // Allow the browser to begin reading the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

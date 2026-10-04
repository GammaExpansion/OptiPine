import { createStore } from 'zustand/vanilla';
import { getBacktestStore } from '../../state/backtest.ts';
import { uiStore } from '../../state/ui.ts';

export const pasteStore = createStore(() => ({ source: '', clipboardFailed: false }));
let picker: (() => void) | undefined;
let reader: ((file: File) => void) | undefined;

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

/** The header's picker also reads dropped files, so a drop fails the way a chosen file does. */
export function setScriptReader(next: (file: File) => void): () => void {
  reader = next;
  return () => {
    if (reader === next) reader = undefined;
  };
}
/** Open `file` as the script, or explain that only a readable .pine file opens. */
export function openScriptFile(file: File): void {
  reader?.(file);
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

/** Whether replacing the current script would lose edits made since it was opened. */
export function replacingLosesEdits(): boolean {
  const { source, origin } = getBacktestStore().getState();
  return source.trim() !== '' && !!origin?.edited;
}

/** The replacement the replace dialog holds until the user answers it. */
export const replaceStore = createStore<{ replace: (() => void) | null }>(() => ({
  replace: null,
}));

/**
 * Open another script through `replace` (an example, a file, a drop): at once when the current
 * script is empty or unedited since it was opened, otherwise once the user agrees to lose the edits.
 */
export function confirmReplace(replace: () => void): void {
  if (!replacingLosesEdits()) return replace();
  replaceStore.setState({ replace });
  uiStore.getState().setDialogOpen('replaceScript', true);
}

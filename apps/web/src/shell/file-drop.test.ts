import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setScriptReader } from '../dialogs/script/actions.ts';
import { uiStore } from '../state/ui.ts';
import { installFileDrop } from './file-drop.ts';

let remove: () => void;
let release: () => void;
const read = vi.fn<(file: File) => void>();
beforeEach(() => {
  read.mockClear();
  release = setScriptReader(read);
  remove = installFileDrop();
  uiStore.setState({ openDialogs: [] });
});
afterEach(() => {
  remove();
  release();
});

/** A drag event as the browser sends it for files from the desktop, which jsdom cannot build. */
function drag(type: 'dragover' | 'drop', files: File[], handled = false) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  const dataTransfer = { types: files.length ? ['Files'] : ['text/plain'], files, dropEffect: '' };
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  if (handled) event.preventDefault();
  document.body.dispatchEvent(event);
  return { event, dataTransfer };
}

const file = (name: string) => new File(['//@version=6'], name);

test('a file dropped outside the editor opens as the script instead of leaving the app', () => {
  const over = drag('dragover', [file('breakout.pine')]);
  expect(over.event.defaultPrevented).toBe(true);
  expect(over.dataTransfer.dropEffect).toBe('copy');
  const dropped = file('breakout.pine');
  expect(drag('drop', [dropped]).event.defaultPrevented).toBe(true);
  expect(read).toHaveBeenCalledWith(dropped);
  // The reader explains a file that is not a .pine script, as the Open file picker does.
  const notes = file('notes.txt');
  drag('drop', [notes]);
  expect(read).toHaveBeenLastCalledWith(notes);
});

test('drop targets of their own, text drags and open dialogs are left alone', () => {
  expect(drag('drop', [file('editor.pine')], true).event.defaultPrevented).toBe(true);
  expect(drag('dragover', []).event.defaultPrevented).toBe(false);
  expect(drag('drop', []).event.defaultPrevented).toBe(false);
  expect(read).not.toHaveBeenCalled();
  uiStore.setState({ openDialogs: ['marketData'] });
  const over = drag('dragover', [file('breakout.pine')]);
  expect([over.event.defaultPrevented, over.dataTransfer.dropEffect]).toEqual([true, 'none']);
  expect(drag('drop', [file('breakout.pine')]).event.defaultPrevented).toBe(true);
  expect(read).not.toHaveBeenCalled();
});

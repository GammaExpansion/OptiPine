import { openScriptFile } from '../dialogs/script/actions.ts';
import { uiStore } from '../state/ui.ts';

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

/**
 * A file dropped anywhere on the page opens as the script, as one dropped on the Pine code editor
 * does, instead of the browser leaving the app to show the file and losing the session. Drop
 * targets of their own, such as the editor and the CSV upload, handle their drops first; while a
 * dialog is open a stray drop is refused.
 */
export function installFileDrop(target: Window = window): () => void {
  const onDragOver = (event: DragEvent) => {
    if (event.defaultPrevented || !carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = uiStore.getState().openDialogs.length ? 'none' : 'copy';
  };
  const onDrop = (event: DragEvent) => {
    if (event.defaultPrevented || !carriesFiles(event)) return;
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file && !uiStore.getState().openDialogs.length) openScriptFile(file);
  };
  target.addEventListener('dragover', onDragOver);
  target.addEventListener('drop', onDrop);
  return () => {
    target.removeEventListener('dragover', onDragOver);
    target.removeEventListener('drop', onDrop);
  };
}

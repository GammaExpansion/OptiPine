import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { getBacktestStore, openScript, useBacktestStore } from '../../../state/backtest.ts';
import { useSelectionStore } from '../../../state/selection.ts';
import { PineEditor } from '../code/PineEditor.tsx';
import { useCodeAnnotations } from '../code/useCodeAnnotations.ts';
import styles from './CodeTab.module.css';

/** Typing into the empty editor starts a script of its own; later edits recompile it. */
function editSource(source: string) {
  const state = getBacktestStore().getState();
  if (!state.source.trim() && state.origin === null)
    openScript({ source, fileName: null, origin: { kind: 'pasted' } });
  else state.actions.setSource(source);
}

function runIfReady() {
  const state = getBacktestStore().getState();
  if ((state.preview ?? state).readiness.ok) void state.actions.run();
}

async function openDroppedFile(file: File) {
  if (!/\.pine$/i.test(file.name)) return;
  openScript({ source: await file.text(), fileName: file.name, origin: { kind: 'file' } });
}

/** The Pine code tab (B3, B4, B10): editing recompiles in the background. */
export function CodeTab() {
  const { t } = useI18n();
  const source = useBacktestStore((state) => state.source);
  const codeLine = useSelectionStore((state) => state.codeLine);
  const annotations = useCodeAnnotations(true);
  return (
    <PineEditor
      className={styles.code}
      keepAs={getBacktestStore()}
      source={source}
      annotations={annotations}
      label={t('code.editor')}
      emptyText={t('backtest.codePlaceholder')}
      reveal={codeLine}
      selectOnReveal
      onChange={editSource}
      onRun={runIfReady}
      onDropFile={openDroppedFile}
    />
  );
}

import { confirmReplace } from '../../../dialogs/script/actions.ts';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { getBacktestStore, openScript, useBacktestStore } from '../../../state/backtest.ts';
import { useSelectionStore } from '../../../state/selection.ts';
import { LazyPineEditor } from '../code/LazyPineEditor.tsx';
import { useCodeAnnotations, useSettledCompile } from '../code/useCodeAnnotations.ts';
import { DockActions } from './DockActions.tsx';
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
  const source = await file.text();
  confirmReplace(() => openScript({ source, fileName: file.name, origin: { kind: 'file' } }));
}

/** B3's "v6 compiled" in the dock bar, or that the script is compiling or failed to compile. */
function CompileStatus() {
  const { t } = useI18n();
  const compile = useSettledCompile();
  if (compile.status === 'empty') return null;
  const version = compile.status === 'compiled' ? compile.description.version : undefined;
  return (
    <span className={styles.status} data-state={compile.status}>
      <span className={styles.dot} />
      {compile.status === 'compiling'
        ? t('code.compiling')
        : compile.status === 'failed'
          ? t('code.failed')
          : version
            ? t('code.compiled', { version })
            : t('code.compiledPlain')}
    </span>
  );
}

/** The Pine code tab (B3, B4, B10): editing recompiles in the background. */
export function CodeTab() {
  const { t } = useI18n();
  const source = useBacktestStore((state) => state.source);
  const codeLine = useSelectionStore((state) => state.codeLine);
  const annotations = useCodeAnnotations(true);
  return (
    <>
      <DockActions>
        <CompileStatus />
      </DockActions>
      <LazyPineEditor
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
    </>
  );
}

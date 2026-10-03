import { Button } from '../../../components/Button.tsx';
import { EmptyState } from '../../../components/EmptyState.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useSelectionStore } from '../../../state/selection.ts';
import { useUiStore } from '../../../state/ui.ts';
import type { ChartNote } from './chart-view.ts';
import styles from './ChartNoteCard.module.css';

function RunFailed({ note }: { note: Extract<ChartNote, { kind: 'runFailed' }> }) {
  const { t, text } = useI18n();
  const setDockTab = useUiStore((state) => state.setDockTab);
  const revealCodeLine = useSelectionStore((state) => state.revealCodeLine);
  const { line, bar, error } = note;
  return (
    <EmptyState
      title={t('run.failedTitle')}
      actions={
        <>
          <Button onClick={() => setDockTab('issues')}>{t('run.viewIssues')}</Button>
          {line !== null && (
            <Button onClick={() => revealCodeLine(line)}>{t('run.goToLine', { line })}</Button>
          )}
        </>
      }
    >
      {error !== null || line === null
        ? t('run.failedWorker', { reason: error === null ? '' : text(error) })
        : bar !== null
          ? // The engine's bar is zero-based; the note counts bars from one (B11).
            t('run.failedAtBar', { line, bar: bar + 1 })
          : t('run.failedAtLine', { line })}
    </EmptyState>
  );
}

function NoTrades() {
  const { t } = useI18n();
  const setDockTab = useUiStore((state) => state.setDockTab);
  return (
    <EmptyState
      title={t('run.noTradesTitle')}
      actions={<Button onClick={() => setDockTab('code')}>{t('run.viewCode')}</Button>}
    >
      {t('run.noTradesBody')}
    </EmptyState>
  );
}

/** B11 and B12 over the chart, which stays visible around them. */
export function ChartNoteCard({ note }: { note: ChartNote }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="status">
        {note.kind === 'runFailed' ? <RunFailed note={note} /> : <NoTrades />}
      </div>
    </div>
  );
}

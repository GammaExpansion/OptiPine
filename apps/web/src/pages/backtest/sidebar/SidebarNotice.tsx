import { useMemo } from 'react';
import { Button } from '../../../components/Button.tsx';
import { Icon } from '../../../components/Icon.tsx';
import { Note } from '../../../components/Note.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../state/backtest.ts';
import { outdatedNotice } from './input-display.ts';
import styles from '../Sidebar.module.css';

/**
 * The note above the inputs: after a failed compile, that they come from the last successful one
 * (B10); otherwise, for an outdated result, what it used and the way back (B9).
 */
export function SidebarNotice() {
  const { t, text } = useI18n();
  const stale = useBacktestStore(
    (state) => state.compile.status === 'failed' && state.description !== null,
  );
  // A previewed set is shown as such (B16); the current inputs' result is not on screen.
  const outdated = useBacktestStore((state) => (state.preview ? null : state.outdated));
  const inputs = useBacktestStore((state) => state.inputs);
  const restore = useBacktestStore((state) => state.actions.restoreResultInputs);
  const notice = useMemo(() => outdatedNotice(outdated, inputs), [outdated, inputs]);
  if (stale) return <Note>{t('inputs.lastCompile')}</Note>;
  if (!notice) return null;
  return (
    <Note tone="amber" icon={<Icon name="warning" />} role="status" className={styles.notice}>
      {notice.sentences.map((sentence, index) => (
        <span key={index}>{text(sentence)}</span>
      ))}
      <span className={styles.next}>{t('inputs.outdatedNext')}</span>
      {notice.restore && (
        <Button variant="link" className={styles.restore} onClick={restore}>
          {text(notice.restore)}
        </Button>
      )}
    </Note>
  );
}

import { useState } from 'react';
import { Button } from '../../components/Button.tsx';
import { Dialog } from '../../components/Dialog.tsx';
import { Note } from '../../components/Note.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { openScript } from '../../state/backtest.ts';
import { useUiStore } from '../../state/ui.ts';
import { pasteStore, replacingLosesEdits } from './actions.ts';
import { DownloadButton, ReplaceNotice } from './ReplaceScriptDialog.tsx';
import styles from './Script.module.css';

export function ScriptDialog() {
  const { t } = useI18n();
  const close = useUiStore((state) => state.setDialogOpen);
  const [draft, setDraft] = useState(pasteStore.getState().source);
  const [confirm, setConfirm] = useState(false);
  const replace = () => {
    openScript({ source: draft, fileName: null, origin: { kind: 'pasted' } });
    close('script', false);
  };
  return (
    <Dialog
      open
      onOpenChange={(value) => close('script', value)}
      title={t(confirm ? 'script.replaceTitle' : 'script.pasteTitle')}
      closeLabel={t('data.close')}
      description={confirm ? undefined : t('script.pasteHint')}
      footer={
        <>
          {confirm && <DownloadButton />}
          <Button onClick={() => (confirm ? setConfirm(false) : close('script', false))}>
            {t('data.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!draft.trim()}
            // As for an example or a file, only edits made since the script opened need asking.
            onClick={() => (!confirm && replacingLosesEdits() ? setConfirm(true) : replace())}
          >
            {t(confirm ? 'script.replace' : 'script.useCode')}
          </Button>
        </>
      }
    >
      {confirm ? (
        <ReplaceNotice />
      ) : (
        <div className={styles.stack}>
          {pasteStore.getState().clipboardFailed && <Note>{t('script.clipboardError')}</Note>}
          <textarea
            autoFocus
            className={styles.editor}
            aria-label={t('script.source')}
            placeholder={t('script.pastePlaceholder')}
            spellCheck={false}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
      )}
    </Dialog>
  );
}

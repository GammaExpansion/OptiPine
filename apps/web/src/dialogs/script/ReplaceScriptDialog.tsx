import { useStore } from 'zustand';
import { Button } from '../../components/Button.tsx';
import { Dialog } from '../../components/Dialog.tsx';
import { Icon } from '../../components/Icon.tsx';
import { Note } from '../../components/Note.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../state/backtest.ts';
import { useUiStore } from '../../state/ui.ts';
import { downloadScript, replaceStore } from './actions.ts';
import { scriptName } from './ScriptButton.tsx';

/**
 * What replacing the edited script loses, with a way to keep it first. The paste dialog shows the
 * same notice before its own replacement.
 */
export function ReplaceNotice() {
  const { t } = useI18n();
  const fileName = useBacktestStore((state) => state.fileName);
  const source = useBacktestStore((state) => state.source);
  return (
    <Note tone="amber">
      {t('script.replaceEdited', { name: scriptName(t, fileName, source) })}{' '}
      {t('script.downloadReminder')}
    </Note>
  );
}

/** Download .pine from the replace notice, under the script's own file name. */
export function DownloadButton() {
  const { t } = useI18n();
  return (
    <Button onClick={() => downloadScript(t('script.defaultFileName'))}>
      <Icon name="download" />
      {t('script.download')}
    </Button>
  );
}

/** Asks before an example, a file or a drop replaces a script edited since it was opened. */
export function ReplaceScriptDialog() {
  const { t } = useI18n();
  const setDialogOpen = useUiStore((state) => state.setDialogOpen);
  const replace = useStore(replaceStore, (state) => state.replace);
  const close = () => {
    replaceStore.setState({ replace: null });
    setDialogOpen('replaceScript', false);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={t('script.replaceTitle')}
      closeLabel={t('data.close')}
      size="small"
      footer={
        <>
          <DownloadButton />
          <Button onClick={close}>{t('data.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              close();
              replace?.();
            }}
          >
            {t('script.replace')}
          </Button>
        </>
      }
    >
      <ReplaceNotice />
    </Dialog>
  );
}

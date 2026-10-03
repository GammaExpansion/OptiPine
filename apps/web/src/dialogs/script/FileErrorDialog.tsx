import { Button } from '../../components/Button.tsx';
import { Dialog } from '../../components/Dialog.tsx';
import { Note } from '../../components/Note.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';

/** A picked file that is not a readable .pine file. */
export function FileErrorDialog({ close }: { close: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={t('script.openFile')}
      closeLabel={t('data.close')}
      footer={<Button onClick={close}>{t('data.close')}</Button>}
      size="small"
    >
      <Note tone="danger">{t('script.fileError')}</Note>
    </Dialog>
  );
}

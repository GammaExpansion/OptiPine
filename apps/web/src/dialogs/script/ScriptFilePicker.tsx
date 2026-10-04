import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { openScript } from '../../state/backtest.ts';
import { registerFilePicker } from '../../shell/shortcuts.ts';
import { setScriptPicker, setScriptReader } from './actions.ts';

// Only a file that cannot be opened shows it, so it loads then.
const FileErrorDialog = lazy(() =>
  import('./FileErrorDialog.tsx').then((module) => ({ default: module.FileErrorDialog })),
);

export function ScriptFilePicker() {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const pick = () => input.current?.click();
    const unregister = registerFilePicker(pick);
    const release = setScriptPicker(pick);
    // `read` keeps only refs and state setters, so the first render's copy stays current.
    const releaseReader = setScriptReader((file) => void read(file));
    return () => {
      revision.current++;
      unregister();
      release();
      releaseReader();
    };
  }, []);
  const read = async (file: File | undefined) => {
    if (!file) return;
    const version = ++revision.current;
    try {
      if (!file.name.toLowerCase().endsWith('.pine')) {
        setFailed(true);
        return;
      }
      const source = await file.text();
      if (revision.current === version)
        openScript({ source, fileName: file.name, origin: { kind: 'file' } });
    } catch {
      if (revision.current === version) setFailed(true);
    }
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".pine"
        hidden
        aria-label={t('script.openFile')}
        onChange={(event) => {
          void read(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {failed && (
        <Suspense fallback={null}>
          <FileErrorDialog close={() => setFailed(false)} />
        </Suspense>
      )}
    </>
  );
}

import type { ComponentPropsWithRef } from 'react';
import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../state/backtest.ts';
import styles from './Script.module.css';

/** The script's file name in the header, with its compile status (S1, S2). */
export function scriptName(
  t: ReturnType<typeof useI18n>['t'],
  fileName: string | null,
  source: string,
) {
  return fileName ?? t(source ? 'script.defaultFileName' : 'shell.openScript');
}

/** The header's script button; it forwards a menu trigger's props and ref. */
export function ScriptButton(props: ComponentPropsWithRef<'button'>) {
  const { t } = useI18n();
  const fileName = useBacktestStore((state) => state.fileName);
  const compile = useBacktestStore((state) => state.compile.status);
  const source = useBacktestStore((state) => state.source);
  return (
    <Button
      {...props}
      variant="toolbar"
      className={styles.trigger}
      title={scriptName(t, fileName, source)}
    >
      <Icon name="file" />
      <span className={styles.filename} data-loaded={!!source}>
        {scriptName(t, fileName, source)}
      </span>
      {source && (
        <span className={styles.dot} data-status={compile} aria-label={t(`script.${compile}`)} />
      )}
      <Icon name="chevron" size={12} />
    </Button>
  );
}

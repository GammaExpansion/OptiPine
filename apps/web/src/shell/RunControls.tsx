import type { ReactNode } from 'react';
import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icon.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { useUiStore } from '../state/ui.ts';
import styles from './Header.module.css';

export function RunControls({ facts }: { facts?: ReactNode }) {
  const { t } = useI18n();
  const page = useUiStore((state) => state.page);
  return (
    <>
      <div className={styles.facts} aria-label={t('shell.facts')}>
        {facts ??
          (page === 'backtest' ? (
            <span id="run-missing">{t('shell.runMissing')}</span>
          ) : (
            t('optimize.empty')
          ))}
      </div>
      {page === 'backtest' && (
        <Button
          variant="primary"
          disabled
          disabledReason={t('shell.runMissing')}
          aria-keyshortcuts="Control+Enter"
          icon={<Icon name="play" size={11} />}
          shortcut={t('shell.shortcut')}
        >
          <span>{t('shell.runBacktest')}</span>
        </Button>
      )}
    </>
  );
}

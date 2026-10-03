import type { ReactNode } from 'react';
import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icon.tsx';
import { PageTabs } from '../components/PageTabs.tsx';
import { SegmentedControl } from '../components/SegmentedControl.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { useUiStore } from '../state/ui.ts';
import styles from './Header.module.css';

export function Header({
  canOptimize = false,
  facts,
}: {
  canOptimize?: boolean;
  facts?: ReactNode;
}) {
  const { t, language } = useI18n();
  const page = useUiStore((state) => state.page);
  const setPage = useUiStore((state) => state.setPage);
  const setLanguage = useUiStore((state) => state.setLanguage);
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <Icon name="logo" size={18} />
        <span>{t('shell.brand')}</span>
      </div>
      <div className={styles.divider} />
      <PageTabs
        label={t('shell.pages')}
        value={page}
        onChange={setPage}
        options={[
          { value: 'backtest', label: t('shell.backtest') },
          {
            value: 'optimize',
            label: t('shell.optimize'),
            disabled: !canOptimize,
            disabledReason: t('shell.runMissing'),
          },
        ]}
      />
      <div className={styles.divider} />
      <Button variant="toolbar">
        <Icon name="file" />
        {t('shell.openScript')}
        <Icon name="chevron" size={12} />
      </Button>
      <Button variant="toolbar">
        {t('shell.selectData')}
        <Icon name="chevron" size={12} />
      </Button>
      <SegmentedControl
        label={t('shell.timeframe')}
        value=""
        disabled
        options={[
          { value: '15', label: t('shell.15m') },
          { value: '60', label: t('shell.1h') },
          { value: '240', label: t('shell.4h') },
          { value: 'D', label: t('shell.1D') },
        ]}
      />
      <Button variant="toolbar" disabled>
        <Icon name="calendar" />
        {t('shell.dateRange')}
      </Button>
      <div className={styles.spacer} />
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
      <SegmentedControl
        label={t('shell.language')}
        value={language}
        onChange={(value) => setLanguage(value === 'zh' ? 'zh' : 'en')}
        options={[
          { value: 'zh', label: t('shell.chinese') },
          { value: 'en', label: t('shell.english') },
        ]}
      />
    </header>
  );
}

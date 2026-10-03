import { Icon } from '../components/Icon.tsx';
import { PageTabs } from '../components/PageTabs.tsx';
import { SegmentedControl } from '../components/SegmentedControl.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../state/optimization.ts';
import { useUiStore } from '../state/ui.ts';
import { HeaderData } from './HeaderData.tsx';
import { optimizeNeedsAttention } from './optimize-status.ts';
import { RunControls } from './RunControls.tsx';
import styles from './Header.module.css';

export function Header({ canOptimize = false }: { canOptimize?: boolean }) {
  const { t, language } = useI18n();
  const optimizeChanged = useOptimizationStore(optimizeNeedsAttention);
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
            changed: optimizeChanged,
          },
        ]}
      />
      <div className={styles.divider} />
      <HeaderData />
      <div className={styles.spacer} />
      <RunControls />
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

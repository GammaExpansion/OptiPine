import { useRef } from 'react';
import { Icon } from '../components/Icon.tsx';
import { IconButton } from '../components/IconButton.tsx';
import { IconLink } from '../components/IconLink.tsx';
import { PageTabs } from '../components/PageTabs.tsx';
import { SegmentedControl } from '../components/SegmentedControl.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { repositoryUrl } from '../repository.ts';
import { useOptimizationPresence } from '../state/optimization.ts';
import { useUiStore } from '../state/ui.ts';
import { HeaderData } from './HeaderData.tsx';
import { RunControls } from './RunControls.tsx';
import { drawerToggleId } from './layout.ts';
import { useLayout } from './useLayout.ts';
import { useHeaderFit } from './useHeaderFit.ts';
import styles from './Header.module.css';

/**
 * The top bar (G5) compacts its optional text to fit the available desktop width. Tablet (G2)
 * adds the drawer toggle and omits ordinary facts and dates, keeping progress/errors on another
 * line. Phone (G3, G4) separates the page switch/actions, Optimize status and data controls.
 * About stays with the actions and GitHub beside the language switch so counts remain readable.
 */
export function Header({ canOptimize = false }: { canOptimize?: boolean }) {
  const { t, language } = useI18n();
  const layout = useLayout();
  const header = useRef<HTMLElement>(null);
  useHeaderFit(header, layout);
  // R1, R5 and B16 mark Optimize while it holds complete results, outdated or not; a first run
  // in progress has none yet (O8). Before the Optimize page first opens there are none either.
  const optimizeResults = useOptimizationPresence((presence) => presence.hasResults);
  const page = useUiStore((state) => state.page);
  const setPage = useUiStore((state) => state.setPage);
  const setLanguage = useUiStore((state) => state.setLanguage);
  const setDialogOpen = useUiStore((state) => state.setDialogOpen);
  const drawerOpen = useUiStore((state) => state.drawerOpen);
  const setDrawerOpen = useUiStore((state) => state.setDrawerOpen);
  const pages = (
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
          changed: optimizeResults,
        },
      ]}
    />
  );
  const about = (
    <IconButton
      className={styles.about}
      icon="info"
      label={t('shell.licenses')}
      aria-haspopup="dialog"
      onClick={() => setDialogOpen('licenses', true)}
    />
  );
  const github = (
    <IconLink
      className={styles.github}
      icon="github"
      label={t('shell.github')}
      href={repositoryUrl}
    />
  );
  const languages = (
    <div className={styles.preferences}>
      <SegmentedControl
        small={layout === 'phone'}
        label={t('shell.language')}
        value={language}
        onChange={(value) => setLanguage(value === 'zh' ? 'zh' : 'en')}
        options={[
          { value: 'zh', label: t('shell.chinese') },
          { value: 'en', label: t('shell.english') },
        ]}
      />
      {layout !== 'phone' && about}
      {layout !== 'phone' && github}
    </div>
  );
  if (layout === 'phone')
    return (
      <header className={`${styles.header} ${styles.phone}`} data-layout={layout} data-page={page}>
        <div className={styles.row}>
          <Icon name="logo" size={18} />
          <div className={styles.pageSwitch}>{pages}</div>
          <div className={styles.spacer} />
          <RunControls />
          {about}
        </div>
        <div className={`${styles.row} ${styles.data}`}>
          <HeaderData layout={layout} />
          <div className={styles.spacer} />
          {languages}
          {github}
        </div>
      </header>
    );
  return (
    <header ref={header} className={styles.header} data-layout={layout} data-page={page}>
      <div className={styles.brand}>
        <Icon name="logo" size={18} />
        {layout === 'desktop' && <span>{t('shell.brand')}</span>}
      </div>
      <div className={styles.divider} />
      {pages}
      <div className={styles.divider} />
      <HeaderData layout={layout} />
      <div className={styles.spacer} />
      <RunControls />
      {languages}
      {layout === 'tablet' && (
        <IconButton
          id={drawerToggleId}
          className={styles.toggle}
          icon="panel"
          label={t('layout.rightPanel')}
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
          onClick={() => setDrawerOpen(!drawerOpen)}
        />
      )}
    </header>
  );
}

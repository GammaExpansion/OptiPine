import { Dialog } from '../../components/Dialog.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useUiStore } from '../../state/ui.ts';
import { appUrl, demoBuild } from '../../demo.ts';
import styles from './LicensesDialog.module.css';

export function LicensesDialog() {
  const { t } = useI18n();
  const setOpen = useUiStore((state) => state.setDialogOpen);
  return (
    <Dialog
      open
      title={t('licenses.title')}
      description={t('licenses.description')}
      closeLabel={t('data.close')}
      onOpenChange={(open) => setOpen('licenses', open)}
      footer={
        <a href={appUrl('licenses/THIRD_PARTY_NOTICES.txt')} target="_blank" rel="noreferrer">
          {t('licenses.notices')}
        </a>
      }
    >
      <div className={styles.content}>
        {demoBuild && <p>{t('licenses.demoNotice')}</p>}
        <section>
          <h3>{t('licenses.app')}</h3>
          <p>{t('licenses.copyright')}</p>
          <a href={appUrl('licenses/OptiPine.txt')} target="_blank" rel="noreferrer">
            {t('licenses.appLicense')}
          </a>
        </section>
        <section>
          <h3>{t('licenses.charts')}</h3>
          <p lang="en">{t('licenses.chartNotice')}</p>
          <div className={styles.links}>
            <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
              {t('licenses.tradingView')}
            </a>
            <a href={appUrl('licenses/lightweight-charts.txt')} target="_blank" rel="noreferrer">
              {t('licenses.chartLicense')}
            </a>
          </div>
          <p>{t('licenses.tslib')}</p>
        </section>
        <section>
          <h3>{t('licenses.fonts')}</h3>
          <p>{t('licenses.fontsource')}</p>
          <dl className={styles.fonts}>
            <dt>
              <a href={appUrl('licenses/barlow.txt')} target="_blank" rel="noreferrer">
                {t('licenses.barlow')}
              </a>
            </dt>
            <dd>{t('licenses.barlowCredit')}</dd>
            <dt>
              <a href={appUrl('licenses/noto-sans-sc.txt')} target="_blank" rel="noreferrer">
                {t('licenses.noto')}
              </a>
            </dt>
            <dd>{t('licenses.notoCredit')}</dd>
            <dt>
              <a href={appUrl('licenses/source-code-pro.txt')} target="_blank" rel="noreferrer">
                {t('licenses.source')}
              </a>
            </dt>
            <dd>{t('licenses.sourceCredit')}</dd>
          </dl>
        </section>
        <section>
          <h3>{t('licenses.libraries')}</h3>
          <p>{t('licenses.mitLibraries')}</p>
          <p>{t('licenses.libraryLicenses')}</p>
        </section>
        <p className={styles.independent}>{t('licenses.independent')}</p>
      </div>
    </Dialog>
  );
}

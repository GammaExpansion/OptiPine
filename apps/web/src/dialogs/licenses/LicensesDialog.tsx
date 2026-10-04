import { Dialog } from '../../components/Dialog.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { licensesEn } from '../../i18n/licenses-en.ts';
import { licensesZh } from '../../i18n/licenses-zh.ts';
import { useUiStore } from '../../state/ui.ts';
import styles from './LicensesDialog.module.css';

export function LicensesDialog() {
  const { t, language } = useI18n();
  const copy = language === 'zh' ? licensesZh : licensesEn;
  const setOpen = useUiStore((state) => state.setDialogOpen);
  return (
    <Dialog
      open
      title={copy.title}
      description={copy.description}
      closeLabel={t('data.close')}
      onOpenChange={(open) => setOpen('licenses', open)}
      footer={
        <a href="/licenses/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">
          {copy.notices}
        </a>
      }
    >
      <div className={styles.content}>
        <section>
          <h3>{copy.app}</h3>
          <p>{copy.copyright}</p>
          <a href="/licenses/OptiPine.txt" target="_blank" rel="noreferrer">
            {copy.appLicense}
          </a>
        </section>
        <section>
          <h3>{copy.charts}</h3>
          <p lang="en">{copy.chartNotice}</p>
          <div className={styles.links}>
            <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
              {copy.tradingView}
            </a>
            <a href="/licenses/lightweight-charts.txt" target="_blank" rel="noreferrer">
              {copy.chartLicense}
            </a>
          </div>
          <p>{copy.tslib}</p>
        </section>
        <section>
          <h3>{copy.fonts}</h3>
          <p>{copy.fontsource}</p>
          <dl className={styles.fonts}>
            <dt>
              <a href="/licenses/barlow.txt" target="_blank" rel="noreferrer">
                {copy.barlow}
              </a>
            </dt>
            <dd>{copy.barlowCredit}</dd>
            <dt>
              <a href="/licenses/noto-sans-sc.txt" target="_blank" rel="noreferrer">
                {copy.noto}
              </a>
            </dt>
            <dd>{copy.notoCredit}</dd>
            <dt>
              <a href="/licenses/source-code-pro.txt" target="_blank" rel="noreferrer">
                {copy.source}
              </a>
            </dt>
            <dd>{copy.sourceCredit}</dd>
          </dl>
        </section>
        <section>
          <h3>{copy.libraries}</h3>
          <p>{copy.mitLibraries}</p>
          <p>{copy.libraryLicenses}</p>
        </section>
        <p className={styles.independent}>{copy.independent}</p>
      </div>
    </Dialog>
  );
}

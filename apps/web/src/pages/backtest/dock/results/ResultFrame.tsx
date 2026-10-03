import type { ReactNode } from 'react';
import { Button } from '../../../../components/Button.tsx';
import { Icon } from '../../../../components/Icon.tsx';
import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../../state/backtest.ts';
import { shownResult } from '../../states/chart-view.ts';
import { EmptyResults } from './EmptyResults.tsx';
import styles from './Results.module.css';

export function ResultFrame({
  children,
  empty = false,
}: {
  children?: ReactNode;
  empty?: boolean;
}) {
  const { t } = useI18n();
  const result = useBacktestStore(shownResult);
  const outdated = useBacktestStore((state) => (state.preview ? null : state.outdated));
  const restore = useBacktestStore((state) => state.actions.restoreResultInputs);
  const stale = Boolean(outdated?.reasons.length);
  if (!result || empty) return <EmptyResults />;
  return (
    <section className={styles.frame} data-outdated={stale}>
      {stale && (
        <div className={styles.outdated} role="status">
          <Icon name="warning" size={14} />
          <span>
            {outdated!.inputs.length
              ? t('report.computedWith', {
                  inputs: outdated!.inputs
                    .map((input) =>
                      t('report.inputValue', {
                        title: input.title,
                        value:
                          input.computed === undefined
                            ? t('common.unavailable')
                            : String(input.computed),
                      }),
                    )
                    .join(t('report.separator')),
                })
              : t('report.outdated')}
          </span>
          <span className={styles.secondary}>{t('report.rerun')}</span>
          {outdated!.inputs.length > 0 && (
            <Button variant="link" onClick={restore}>
              {t('report.restoreInputs')}
            </Button>
          )}
        </div>
      )}
      <div className={styles.content} data-dimmed={stale}>
        {children}
      </div>
    </section>
  );
}

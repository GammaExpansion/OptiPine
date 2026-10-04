import type { ReactNode } from 'react';
import type { LiteralValue } from '@pine/engine';
import { Button } from '../../../../components/Button.tsx';
import { Icon } from '../../../../components/Icon.tsx';
import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../../state/backtest.ts';
import { inputValueText } from '../../sidebar/input-display.ts';
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
  const { t, text } = useI18n();
  const result = useBacktestStore(shownResult);
  const outdated = useBacktestStore((state) => (state.preview ? null : state.outdated));
  const restore = useBacktestStore((state) => state.actions.restoreResultInputs);
  const fields = useBacktestStore((state) => state.inputs);
  // Values as the right panel shows them: the step's decimals, on and off (B9).
  const shown = (title: string, value: LiteralValue | undefined) =>
    text(
      inputValueText(fields.find((field) => field.descriptor.title === title)?.descriptor, value),
    );
  const stale = Boolean(outdated?.reasons.length);
  const running = useBacktestStore(
    (state) => (state.preview?.run ?? state.run).status === 'running',
  );
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
                        value: shown(input.title, input.computed),
                      }),
                    )
                    .join(t('report.separator')),
                })
              : t('report.outdated')}
          </span>
          <span className={styles.secondary}>{t('report.rerun')}</span>
          {outdated!.inputs.length > 0 && (
            <Button variant="link" onClick={restore}>
              {outdated!.inputs.length === 1 && outdated!.inputs[0].computed !== undefined
                ? t('report.restoreInputValue', {
                    value: shown(outdated!.inputs[0].title, outdated!.inputs[0].computed),
                  })
                : t('report.restoreInputs')}
            </Button>
          )}
        </div>
      )}
      <div className={styles.content} data-dimmed={stale || running}>
        {children}
      </div>
    </section>
  );
}

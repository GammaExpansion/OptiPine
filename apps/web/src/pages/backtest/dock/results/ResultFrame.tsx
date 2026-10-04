import type { ReactNode } from 'react';
import type { LiteralValue } from '@pine/engine';
import { Button } from '../../../../components/Button.tsx';
import { Icon } from '../../../../components/Icon.tsx';
import { valueText } from '../../../../dialogs/properties/property-display.ts';
import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../../state/backtest.ts';
import { inputValueText } from '../../sidebar/input-display.ts';
import { shownResult } from '../../states/chart-view.ts';
import { EmptyResults } from './EmptyResults.tsx';
import styles from './Results.module.css';

/**
 * A result tab's frame: the outdated banner over its content. `account` marks a tab about the
 * strategy's account (Report, Equity), which an indicator's run does not have.
 */
export function ResultFrame({
  children,
  empty = false,
  account = false,
}: {
  children?: ReactNode;
  empty?: boolean;
  account?: boolean;
}) {
  const { t, text } = useI18n();
  const result = useBacktestStore(shownResult);
  const outdated = useBacktestStore((state) => (state.preview ? null : state.outdated));
  const restore = useBacktestStore((state) => state.actions.restoreResultSettings);
  const fields = useBacktestStore((state) => state.inputs);
  const stale = Boolean(outdated?.reasons.length);
  const running = useBacktestStore(
    (state) => (state.preview?.run ?? state.run).status === 'running',
  );
  if (account && result?.initialCapital === null)
    return <EmptyResults message="backtest.indicatorResults" />;
  if (!result || empty) return <EmptyResults />;
  // What the result used, as the right panel and the properties dialog show it (B9): an input
  // with its step's decimals or on and off, a property in the dialog's wording.
  const inputValue = (title: string, value: LiteralValue | undefined) =>
    text(
      inputValueText(fields.find((field) => field.descriptor.title === title)?.descriptor, value),
    );
  const changes = [
    ...(outdated?.inputs ?? []).map((input) => ({
      title: input.title,
      value: inputValue(input.title, input.computed),
      known: input.computed !== undefined,
    })),
    ...(outdated?.properties ?? []).map((property) => ({
      title: t(`backtest.property.${property.id}`),
      value:
        property.computed === undefined
          ? t('properties.scriptComputed')
          : text(valueText(property.id, property.computed)),
      known: property.computed !== undefined,
    })),
  ];
  return (
    <section className={styles.frame} data-outdated={stale}>
      {stale && (
        <div className={styles.outdated} role="status">
          <Icon name="warning" size={14} />
          <span>
            {changes.length
              ? t('report.computedWith', {
                  inputs: changes
                    .map(({ title, value }) => t('report.inputValue', { title, value }))
                    .join(t('report.separator')),
                })
              : t('report.outdated')}
          </span>
          <span className={styles.secondary}>{t('report.rerun')}</span>
          {changes.length > 0 && (
            <Button variant="link" onClick={restore}>
              {changes.length === 1 && changes[0].known
                ? t('report.restoreInputValue', { value: changes[0].value })
                : t(
                    outdated!.properties.length ? 'report.restoreSettings' : 'report.restoreInputs',
                  )}
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

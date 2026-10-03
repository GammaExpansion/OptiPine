import { useId, useState } from 'react';
import type { LiteralValue } from '@pine/engine';
import { Checkbox } from '../../../components/Checkbox.tsx';
import { Chip } from '../../../components/Chip.tsx';
import { Popover } from '../../../components/Popover.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import type { SearchRow } from '../../../workflows/optimize-setup.ts';
import { chipOrder, choiceText } from './search-display.ts';
import styles from './OptimizeSidebar.module.css';

const sameValue = (a: LiteralValue, b: LiteralValue) => JSON.stringify(a) === JSON.stringify(b);

/**
 * An option or bool row's values as chips to keep or drop, the rest behind "N more" with the full
 * list (O4). The chips in sight are chosen when the row appears, so a dropped value stays put.
 */
export function ValueChips({ row }: { row: SearchRow }) {
  const { t, text } = useI18n();
  const id = useId();
  const setValueKept = useOptimizationStore((state) => state.actions.setValueKept);
  const [order] = useState(() => chipOrder(row.choices));
  const { descriptor, choices } = row;
  const title = descriptor.title;
  const kept = (value: LiteralValue) =>
    choices.some((choice) => choice.kept && sameValue(choice.value, value));
  const label = (value: LiteralValue) => text(choiceText(descriptor, value));
  return (
    <div className={styles.chips} role="group" aria-label={t('optimize.setup.values', { title })}>
      {order.visible.map((value) => (
        <Chip
          key={JSON.stringify(value)}
          label={label(value)}
          pressed={kept(value)}
          onPressedChange={(next) => setValueKept(title, value, next)}
        />
      ))}
      {order.more > 0 && (
        <Popover
          label={t('optimize.setup.values', { title })}
          align="start"
          trigger={
            <Chip className={styles.more} label={t('optimize.setup.more', { count: order.more })} />
          }
        >
          <div className={styles.listHeading}>
            <strong>{t('optimize.setup.values', { title })}</strong>
            <span>
              {t('optimize.setup.selected', {
                count: choices.filter((choice) => choice.kept).length,
                total: choices.length,
              })}
            </span>
          </div>
          <div className={styles.list}>
            {choices.map((choice, index) => (
              <label key={JSON.stringify(choice.value)} htmlFor={`${id}-${index}`}>
                <Checkbox
                  id={`${id}-${index}`}
                  label={label(choice.value)}
                  checked={choice.kept}
                  onCheckedChange={(checked) => setValueKept(title, choice.value, checked === true)}
                />
                {label(choice.value)}
              </label>
            ))}
          </div>
          <p className={styles.listHint}>{t('optimize.setup.fixedHint')}</p>
        </Popover>
      )}
    </div>
  );
}

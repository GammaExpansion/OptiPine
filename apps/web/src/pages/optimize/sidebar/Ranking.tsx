import { useRef, useState, type KeyboardEvent } from 'react';
import { Chip } from '../../../components/Chip.tsx';
import { Icon } from '../../../components/Icon.tsx';
import { Popover } from '../../../components/Popover.tsx';
import { SectionHeading } from '../../../components/SectionHeading.tsx';
import { SegmentedControl } from '../../../components/SegmentedControl.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import type { MessageId } from '../../../i18n/translate.ts';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { objectiveGroups, type ObjectiveId } from '../../../workflows/optimize-ranking.ts';
import type { ValidationMode } from '../../../workflows/optimize-setup.ts';
import { AddConditionTrigger } from '../filters/AddConditionTrigger.tsx';
import { filterLabel } from '../filters/filter-label.ts';
import styles from './OptimizeSidebar.module.css';

/** Net profit is ranked by its IS figure unless validation is None (O2, O7). */
function objectiveId(objective: ObjectiveId, mode: ValidationMode): MessageId {
  return objective === 'netProfit' && mode !== 'none'
    ? 'optimize.setup.objective.isNetProfit'
    : `optimize.setup.objective.${objective}`;
}

/** Up and down move between the objectives; Home and End go to the first and last. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === 'ArrowDown'
      ? (at + 1) % items.length
      : event.key === 'ArrowUp'
        ? (at - 1 + items.length) % items.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : null;
  if (next === null) return;
  event.preventDefault();
  items[next].focus();
}

/** The ranking objective, grouped as O7, with the direction at the top of its menu. */
function ObjectiveMenu() {
  const { t } = useI18n();
  const settings = useOptimizationStore((state) => state.viewSettings);
  const mode = useOptimizationStore((state) => state.validation.mode);
  const actions = useOptimizationStore((state) => state.actions);
  const [open, setOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  return (
    <Popover
      label={t('optimize.setup.objective')}
      open={open}
      onOpenChange={setOpen}
      align="start"
      className={styles.objectiveMenu}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        list.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
      }}
      trigger={
        <button type="button" className={styles.objective}>
          <span>
            <span className={styles.caption}>{t('optimize.setup.by')} </span>
            {t(objectiveId(settings.objective, mode))}
            <span className={styles.caption}>
              {t(
                settings.direction === 'maximize' ? 'optimize.setup.byMax' : 'optimize.setup.byMin',
              )}
            </span>
          </span>
          <Icon name="chevron" size={12} />
        </button>
      }
    >
      <div className={styles.direction}>
        <span className={styles.secondary}>{t('optimize.setup.direction')}</span>
        <SegmentedControl
          small
          label={t('optimize.setup.direction')}
          value={settings.direction}
          onChange={(value) => actions.setDirection(value === 'minimize' ? 'minimize' : 'maximize')}
          options={[
            { value: 'maximize', label: t('optimize.setup.max') },
            { value: 'minimize', label: t('optimize.setup.min') },
          ]}
        />
      </div>
      <div
        ref={list}
        role="radiogroup"
        aria-label={t('optimize.setup.objective')}
        className={styles.objectives}
        onKeyDown={moveFocus}
      >
        {objectiveGroups.map(({ group, objectives }) => (
          <div key={group} role="group" aria-label={t(`optimize.setup.group.${group}`)}>
            <span className={styles.groupHeading}>{t(`optimize.setup.group.${group}`)}</span>
            {objectives.map((objective) => {
              const checked = objective === settings.objective;
              return (
                <button
                  key={objective}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  className={styles.objectiveItem}
                  onClick={() => {
                    actions.setObjective(objective);
                    setOpen(false);
                  }}
                >
                  <span>{t(objectiveId(objective, mode))}</span>
                  {checked && <Icon name="check" size={11} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Popover>
  );
}

/**
 * Ranking and filters (O1, O7), or per-window selection for walk-forward (O3): the objective,
 * the filter chips and + Condition. They only change how results are viewed (WEB.md 3.1).
 */
export function Ranking() {
  const { t, text } = useI18n();
  const mode = useOptimizationStore((state) => state.validation.mode);
  const filters = useOptimizationStore((state) => state.viewSettings.filters);
  const removeFilter = useOptimizationStore((state) => state.actions.removeFilter);
  return (
    <section className={styles.section}>
      <SectionHeading>
        {t(mode === 'walk-forward' ? 'optimize.setup.perWindow' : 'optimize.ranking')}
      </SectionHeading>
      <ObjectiveMenu />
      <div className={styles.chips} role="group" aria-label={t('optimize.setup.filters')}>
        {filters.map((filter, index) => {
          const label = text(filterLabel(filter));
          return (
            <Chip
              key={`${index}-${label}`}
              label={label}
              removeLabel={t('optimize.setup.removeFilter', { filter: label })}
              onRemove={() => removeFilter(index)}
            />
          );
        })}
        <AddConditionTrigger />
      </div>
    </section>
  );
}

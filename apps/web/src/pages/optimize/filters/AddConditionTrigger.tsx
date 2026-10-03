import { useState } from 'react';
import { Chip } from '../../../components/Chip.tsx';
import { Popover } from '../../../components/Popover.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { ConditionPopover } from './ConditionPopover.tsx';
import styles from './AddConditionTrigger.module.css';

/**
 * + Condition, which opens R10's popover beside it: in the leaderboard's filter chips and in the
 * right panel's Ranking and filters. Each trigger opens its own popover; closing one drops the
 * condition being written, so its preview ends with it.
 */
export function AddConditionTrigger() {
  const { t } = useI18n();
  const setDraft = useOptimizationStore((state) => state.actions.setDraftFilter);
  const [open, setOpen] = useState(false);
  const change = (next: boolean) => {
    setOpen(next);
    if (!next) setDraft(null);
  };
  return (
    <Popover
      label={t('optimize.setup.addCondition')}
      open={open}
      onOpenChange={change}
      align="start"
      trigger={<Chip className={styles.trigger} label={t('optimize.addCondition')} dashed />}
    >
      <ConditionPopover close={() => change(false)} />
    </Popover>
  );
}

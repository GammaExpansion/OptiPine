/**
 * The body of R10's add-condition popover: metric, ≥ or ≤, value, presets and the preview of what
 * the condition would exclude. `close` closes the popover after Add or Cancel.
 */
import { useEffect, useState } from 'react';
import { Button } from '../../../components/Button.tsx';
import { Chip } from '../../../components/Chip.tsx';
import { Note } from '../../../components/Note.tsx';
import { NumberField } from '../../../components/NumberField.tsx';
import { SegmentedControl } from '../../../components/SegmentedControl.tsx';
import { Select } from '../../../components/Select.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import {
  filterMetricIds,
  filterPresets,
  filterValueError,
  type FilterMetricId,
} from '../../../workflows/optimize-ranking.ts';
import { useResultFormat } from '../leaderboard/useResultFormat.ts';
import styles from '../leaderboard/Leaderboard.module.css';

export function ConditionPopover({ close }: { close: () => void }) {
  const { t, text } = useI18n();
  const { condition } = useResultFormat();
  const actions = useOptimizationStore((state) => state.actions);
  const preview = useOptimizationStore((state) => state.views?.draftPreview);
  const pending = useOptimizationStore((state) => state.views?.pending);
  const hasViews = useOptimizationStore((state) => !!state.views);
  const [metric, setMetric] = useState<FilterMetricId>('profitFactor');
  const [operator, setOperator] = useState<'>=' | '<='>('>=');
  const [raw, setRaw] = useState('1.3');
  const value = raw.trim() ? Number(raw) : NaN;
  const error = filterValueError(value);
  useEffect(() => {
    actions.setDraftFilter(error ? null : { metric, operator, value });
  }, [actions, metric, operator, value, !!error]);
  const current =
    !pending &&
    preview &&
    preview.filter.metric === metric &&
    preview.filter.operator === operator &&
    preview.filter.value === value;
  return (
    <form
      className={styles.condition}
      onSubmit={(event) => {
        event.preventDefault();
        if (!error) {
          actions.addFilter({ metric, operator, value });
          close();
        }
      }}
    >
      <div className={styles.heading}>
        <strong>{t('optimize.leaderboard.addTitle')}</strong>
        <span>{t('optimize.leaderboard.escape')}</span>
      </div>
      <label className={styles.field}>
        <span>{t('optimize.leaderboard.metric')}</span>
        <Select
          label={t('optimize.leaderboard.metric')}
          value={metric}
          options={filterMetricIds.map((id) => ({
            value: id,
            label: t(`optimize.leaderboard.metric.${id}`),
          }))}
          onChange={(next) => setMetric(next as FilterMetricId)}
        />
      </label>
      <div className={styles.conditionFields}>
        <div className={styles.field}>
          <span>{t('optimize.leaderboard.operator')}</span>
          <SegmentedControl
            label={t('optimize.leaderboard.operator')}
            value={operator}
            options={[
              { value: '>=', label: t('optimize.leaderboard.greater') },
              { value: '<=', label: t('optimize.leaderboard.less') },
            ]}
            onChange={(next) => setOperator(next as '>=' | '<=')}
          />
        </div>
        <label className={styles.field}>
          <span>{t('optimize.leaderboard.value')}</span>
          <NumberField
            label={t('optimize.leaderboard.value')}
            value={raw}
            onChange={setRaw}
            stepper={false}
            decrementLabel={t('inputs.decrease', { title: t('optimize.leaderboard.value') })}
            incrementLabel={t('inputs.increase', { title: t('optimize.leaderboard.value') })}
            error={error ? text(error) : undefined}
          />
        </label>
      </div>
      <div className={styles.field}>
        <span>{t('optimize.leaderboard.presets')}</span>
        <div className={styles.chips}>
          {filterPresets.map((preset) => (
            <Chip
              key={preset.metric}
              label={condition(preset)}
              onClick={() => {
                setMetric(preset.metric);
                setOperator(preset.operator);
                setRaw(String(preset.value));
              }}
            />
          ))}
        </div>
      </div>
      <Note role="status">
        {hasViews ? (
          current ? (
            <>
              {t('optimize.leaderboard.preview', { count: preview.excluded })}
              <div>
                {preview.pageRanks.length
                  ? t('optimize.leaderboard.dropRanks', {
                      count: preview.pageRanks.length,
                      ranks: preview.pageRanks.join(', '),
                    })
                  : t('optimize.leaderboard.noDrop')}
              </div>
            </>
          ) : error ? (
            text(error)
          ) : (
            t('optimize.leaderboard.pending')
          )
        ) : (
          t('optimize.leaderboard.noResults')
        )}
      </Note>
      <div className={styles.actions}>
        <Button type="button" onClick={close}>
          {t('optimize.leaderboard.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={!!error}>
          {t('optimize.leaderboard.add')}
        </Button>
      </div>
    </form>
  );
}

import { useId } from 'react';
import type { LiteralValue } from '@pine/engine';
import { Checkbox } from '../../../components/Checkbox.tsx';
import { Icon } from '../../../components/Icon.tsx';
import { Note } from '../../../components/Note.tsx';
import { SectionHeading } from '../../../components/SectionHeading.tsx';
import { SegmentedControl } from '../../../components/SegmentedControl.tsx';
import { Select } from '../../../components/Select.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../../i18n/translate.ts';
import { useBacktestStore } from '../../../state/backtest.ts';
import { useOptimizationStore } from '../../../state/optimization.ts';
import type { SearchRow } from '../../../workflows/optimize-setup.ts';
import { MiniNumber } from './MiniNumber.tsx';
import { choiceText, invalidFields, rangeText } from './search-display.ts';
import { ValueChips } from './ValueChips.tsx';
import styles from './OptimizeSidebar.module.css';

const key = (value: LiteralValue | undefined) => JSON.stringify(value ?? null);

/** The value a row that is not searched runs with: a number field, or the input's choices. */
function FixedValue({ row }: { row: SearchRow }) {
  const { t, text } = useI18n();
  const setFixedValue = useOptimizationStore((state) => state.actions.setFixedValue);
  const { descriptor, draft } = row;
  const title = descriptor.title;
  const value = row.values[0] ?? draft?.fixed;
  if (draft?.values.kind === 'range')
    return (
      <MiniNumber
        width={60}
        label={t('optimize.setup.fixedLabel', { title })}
        value={typeof value === 'number' ? value : NaN}
        format={(number) => rangeText(descriptor, number)}
        step={descriptor.step}
        invalid={!!row.error}
        onChange={(number) => setFixedValue(title, number)}
      />
    );
  return (
    <Select
      className={styles.fixedSelect}
      label={t('optimize.setup.fixedLabel', { title })}
      value={key(value)}
      aria-invalid={row.error ? true : undefined}
      options={row.choices.map((choice) => ({
        value: key(choice.value),
        label: text(choiceText(descriptor, choice.value)),
      }))}
      onChange={(next) => {
        const choice = row.choices.find((item) => key(item.value) === next);
        if (choice) setFixedValue(title, choice.value);
      }}
    />
  );
}

/** From, to and step of a numeric row (O1), with the fields its error is about marked (O6). */
function RangeFields({ row }: { row: SearchRow }) {
  const { t } = useI18n();
  const setRange = useOptimizationStore((state) => state.actions.setRange);
  const { descriptor, draft } = row;
  if (draft?.values.kind !== 'range') return null;
  const { from, to, step } = draft.values;
  const title = descriptor.title;
  const invalid = invalidFields(row);
  const format = (value: number) => rangeText(descriptor, value);
  return (
    <div className={styles.range}>
      <MiniNumber
        width={60}
        label={t('optimize.setup.fromLabel', { title })}
        value={from}
        format={format}
        step={step}
        invalid={invalid.has('from')}
        onChange={(value) => setRange(title, { from: value })}
      />
      <span className={styles.caption}>{t('optimize.setup.to')}</span>
      <MiniNumber
        width={60}
        label={t('optimize.setup.toLabel', { title })}
        value={to}
        format={format}
        step={step}
        invalid={invalid.has('to')}
        onChange={(value) => setRange(title, { to: value })}
      />
      <span className={`${styles.caption} ${styles.stepLabel}`}>{t('optimize.setup.step')}</span>
      <MiniNumber
        width={52}
        label={t('optimize.setup.stepLabel', { title })}
        value={step}
        format={format}
        invalid={invalid.has('step')}
        onChange={(value) => setRange(title, { step: value })}
      />
    </div>
  );
}

/** One input's row: searched with its values, fixed at one value, or not searchable (O1, O4–O6). */
function SearchRowView({ row }: { row: SearchRow }) {
  const { t, text } = useI18n();
  const setSearched = useOptimizationStore((state) => state.actions.setSearched);
  const errorId = useId();
  const { descriptor, draft } = row;
  const title = descriptor.title;
  const error = row.error && (
    <span id={errorId} className={styles.rowError} role="alert">
      {text(row.error)}
    </span>
  );
  if (!draft)
    return (
      <div className={styles.row}>
        <div className={styles.rowHead}>
          <Checkbox label={t('optimize.setup.searchInput', { title })} checked={false} disabled />
          <span className={styles.muted}>{title}</span>
        </div>
        {row.excluded && (
          <span className={styles.rowNote}>
            <Icon name="lock" size={11} />
            {text(row.excluded)}
          </span>
        )}
      </div>
    );
  const checkbox = (
    <Checkbox
      label={t('optimize.setup.searchInput', { title })}
      checked={draft.searched}
      aria-describedby={row.error ? errorId : undefined}
      onCheckedChange={(checked) => setSearched(title, checked === true)}
    />
  );
  if (!draft.searched)
    return (
      <div className={styles.row}>
        <div className={styles.rowHead}>
          {checkbox}
          <span className={styles.muted}>{title}</span>
          <span className={styles.fixed}>{t('optimize.setup.fixed')}</span>
          <FixedValue row={row} />
        </div>
        {error}
      </div>
    );
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        {checkbox}
        <span className={styles.title}>{title}</span>
        <span className={row.error ? styles.countError : styles.count}>
          {row.error ? t('common.unavailable') : formatNumber(row.values.length)}
        </span>
      </div>
      {draft.values.kind === 'range' ? (
        <RangeFields row={row} />
      ) : (
        <div className={styles.indent}>
          <ValueChips key={JSON.stringify(row.choices.map((choice) => choice.value))} row={row} />
        </div>
      )}
      {error}
    </div>
  );
}

/** Random sampling's sample count and seed, and why the grid switched to it (O5). */
function Sampling() {
  const { t, text } = useI18n();
  const sampling = useOptimizationStore((state) => state.search.sampling);
  const settings = useOptimizationStore((state) => state.sampling);
  const setSampling = useOptimizationStore((state) => state.actions.setSampling);
  return (
    <>
      {sampling?.notice && <Note tone="amber">{text(sampling.notice)}</Note>}
      <div className={styles.sampling}>
        <span className={styles.secondary}>{t('optimize.setup.samples')}</span>
        <MiniNumber
          width={68}
          label={t('optimize.setup.sampleCount')}
          value={settings.count}
          invalid={!!sampling?.error}
          onChange={(count) => setSampling({ count })}
        />
        <span className={styles.caption}>{t('optimize.combos')}</span>
        <span className={`${styles.secondary} ${styles.seedLabel}`}>
          {t('optimize.setup.seed')}
        </span>
        <MiniNumber
          width={60}
          label={t('optimize.setup.seedLabel')}
          value={settings.seed}
          invalid={!!sampling?.error}
          onChange={(seed) => setSampling({ seed })}
        />
      </div>
      {sampling?.error && (
        <span className={styles.error} role="alert">
          {text(sampling.error)}
        </span>
      )}
    </>
  );
}

/**
 * Search ranges (O1, O4–O6): Grid or Random, one row per input in declaration order, and random
 * sampling's settings when the run samples at random, by choice or because the grid is too large.
 */
export function SearchRanges() {
  const { t, text } = useI18n();
  const compiled = useBacktestStore((state) => state.description !== null);
  const search = useOptimizationStore((state) => state.search);
  const chosen = useOptimizationStore((state) => state.sampling.method);
  const setSampling = useOptimizationStore((state) => state.actions.setSampling);
  const method = search.sampling?.method ?? chosen;
  return (
    <section className={styles.section}>
      <SectionHeading
        action={
          <SegmentedControl
            small
            label={t('optimize.searchMethod')}
            value={method}
            onChange={(value) => setSampling({ method: value === 'random' ? 'random' : 'grid' })}
            options={[
              { value: 'grid', label: t('optimize.grid') },
              { value: 'random', label: t('optimize.random') },
            ]}
          />
        }
      >
        {t('optimize.searchRanges')}
      </SectionHeading>
      {!compiled ? (
        <p className={styles.hint}>{t('backtest.inputsHint')}</p>
      ) : !search.rows.length ? (
        <p className={styles.hint}>{t('inputs.none')}</p>
      ) : (
        search.rows.map((row) => <SearchRowView key={row.descriptor.id} row={row} />)
      )}
      {search.error && (
        <span className={styles.error} role="alert">
          {text(search.error)}
        </span>
      )}
      {method === 'random' && <Sampling />}
    </section>
  );
}

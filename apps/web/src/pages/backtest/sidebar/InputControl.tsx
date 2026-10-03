import { useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../../components/Icon.tsx';
import { NumberField } from '../../../components/NumberField.tsx';
import { Select } from '../../../components/Select.tsx';
import { TextInput } from '../../../components/TextInput.tsx';
import { ToggleSwitch } from '../../../components/ToggleSwitch.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../state/backtest.ts';
import type { InputField } from '../../../workflows/inputs.ts';
import {
  inputControl,
  inputEditText,
  inputError,
  inputHint,
  inputValueText,
  parseInputText,
  selectValues,
} from './input-display.ts';
import styles from '../Sidebar.module.css';

/**
 * Text typed into a focused field, kept while it still reads as the session's value: "2." stays
 * as typed, and a value set elsewhere (Reset, a stepper) shows formatted.
 */
function useDraft(field: InputField) {
  const { descriptor } = field;
  const element = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const current =
    draft !== null && Object.is(parseInputText(descriptor, draft), field.value)
      ? draft
      : inputEditText(descriptor, field.value);
  return {
    element,
    current,
    edit(raw: string) {
      setDraft(element.current === document.activeElement ? raw : null);
      return parseInputText(descriptor, raw);
    },
    end: () => setDraft(null),
  };
}

/** One input in the right panel, with the control its type takes (B1, B14). */
export function InputControl({ field }: { field: InputField }) {
  const { t, text } = useI18n();
  const setInput = useBacktestStore((state) => state.actions.setInput);
  const id = useId();
  const draft = useDraft(field);
  const { descriptor } = field;
  const title = descriptor.title;
  const control = inputControl(field);
  const hint = inputHint(field);
  const error = inputError(field);
  const errorText = error ? text(error) : undefined;
  const label = (
    <label htmlFor={id} className={styles.label}>
      {title}
      {field.changed && <span className={styles.changed} />}
    </label>
  );
  if (control === 'toggle')
    return (
      <div className={styles.toggle}>
        {label}
        <ToggleSwitch
          id={id}
          label={title}
          checked={field.value === true}
          onCheckedChange={(checked) => setInput(title, checked)}
        />
      </div>
    );
  const heading = (
    <div className={styles.heading}>
      {label}
      {field.readOnly ? (
        <span className={styles.hint}>
          <Icon name="lock" size={11} />
          {text(field.readOnly)}
        </span>
      ) : (
        hint && <span className={styles.hint}>{text(hint)}</span>
      )}
    </div>
  );
  if (control === 'number')
    return (
      <div className={styles.input}>
        {heading}
        <NumberField
          ref={draft.element}
          id={id}
          value={draft.current}
          label={title}
          decrementLabel={t('inputs.decrease', { title })}
          incrementLabel={t('inputs.increase', { title })}
          min={descriptor.min}
          max={descriptor.max}
          step={descriptor.step}
          error={errorText}
          onChange={(raw) => setInput(title, draft.edit(raw))}
          onBlur={draft.end}
        />
      </div>
    );
  let body: ReactNode;
  if (control === 'select') {
    const key = (value: unknown) => JSON.stringify(value ?? null);
    const values = selectValues(field);
    body = (
      <Select
        id={id}
        label={title}
        value={key(field.value)}
        aria-invalid={error ? true : undefined}
        options={values.map((value) => ({
          value: key(value),
          label: text(inputValueText(descriptor, value)),
        }))}
        onChange={(value) => setInput(title, values.find((item) => key(item) === value) ?? null)}
      />
    );
  } else if (control === 'readOnly') {
    body = (
      <TextInput
        id={id}
        className={styles.centered}
        value={text(inputValueText(descriptor, field.value))}
        readOnly
      />
    );
  } else {
    body = (
      <TextInput
        ref={draft.element}
        id={id}
        className={styles.centered}
        value={draft.current}
        aria-invalid={error ? true : undefined}
        onChange={(event) => setInput(title, draft.edit(event.target.value))}
        onBlur={draft.end}
      />
    );
  }
  return (
    <div className={styles.input}>
      {heading}
      {body}
      {errorText && (
        <span className={styles.error} role="alert">
          {errorText}
        </span>
      )}
    </div>
  );
}

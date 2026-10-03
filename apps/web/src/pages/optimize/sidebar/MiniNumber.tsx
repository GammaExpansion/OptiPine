import { NumberField } from '../../../components/NumberField.tsx';
import { useNumberText } from './useNumberText.ts';
import styles from './OptimizeSidebar.module.css';

/**
 * The right panel's small number field (O1, O3, O5): no stepper, the arrow keys still step, and
 * typed text stays while it means the stored number. `onChange` receives NaN for text that is not
 * a number, which the session reports.
 */
export function MiniNumber({
  value,
  onChange,
  label,
  width,
  format,
  step,
  invalid = false,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  width: 36 | 42 | 52 | 60 | 68;
  format?: (value: number) => string;
  step?: number;
  invalid?: boolean;
}) {
  const draft = useNumberText(value, format);
  return (
    <NumberField
      className={styles[`w${width}`]}
      compact
      stepper={false}
      value={draft.text}
      label={label}
      decrementLabel={label}
      incrementLabel={label}
      step={step}
      aria-invalid={invalid || undefined}
      onChange={(raw) => onChange(draft.edit(raw))}
      onBlur={draft.end}
    />
  );
}

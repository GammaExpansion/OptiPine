import { useMemo, useRef } from 'react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../state/backtest.ts';
import { inputValueText } from '../sidebar/input-display.ts';
import { codeMarks, inputNotes, lineKinds } from './annotations.ts';
import type { Annotations } from './editor.ts';

/**
 * The code's diagnostics and, with `values`, each input's current value (B3, B10). While a new
 * compile is pending the previous outcome stays, so typing does not make the marks flicker.
 */
export function useCodeAnnotations(values: boolean): Annotations {
  const { t } = useI18n();
  const compile = useBacktestStore((state) => state.compile);
  const run = useBacktestStore((state) => (state.preview ?? state).run);
  const inputs = useBacktestStore((state) => state.inputs);
  const settled = useRef(compile);
  if (compile.status !== 'compiling') settled.current = compile;
  const shown = settled.current;
  return useMemo(() => {
    const marks = codeMarks({ compile: shown, run, preview: null });
    const notes = values ? inputNotes({ compile: shown, inputs }) : [];
    return {
      marks,
      values: notes.map(({ line, field }) => ({
        line,
        text: t('code.current', { value: inputValueText(field.descriptor, field.value) }),
      })),
      kinds: lineKinds(marks, notes),
    };
  }, [shown, run, inputs, values, t]);
}

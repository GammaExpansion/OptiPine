import { useMemo, useRef } from 'react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../state/backtest.ts';
import type { CompileState } from '../../../workflows/backtest.ts';
import { inputValueText } from '../sidebar/input-display.ts';
import { codeMarks, inputNotes, lineKinds } from './annotations.ts';
import type { Annotations } from './editor.ts';

/**
 * The last compile outcome: while a new compile is pending the previous outcome stays, so typing
 * does not make the code's marks and status flicker. Compiling only before any outcome.
 */
export function useSettledCompile(): CompileState {
  const compile = useBacktestStore((state) => state.compile);
  const settled = useRef(compile);
  if (compile.status !== 'compiling' || settled.current.status === 'empty')
    settled.current = compile;
  return settled.current;
}

/** The code's diagnostics and, with `values`, each input's current value (B3, B10). */
export function useCodeAnnotations(values: boolean): Annotations {
  const { t } = useI18n();
  const compile = useSettledCompile();
  const run = useBacktestStore((state) => (state.preview ?? state).run);
  const inputs = useBacktestStore((state) => state.inputs);
  return useMemo(() => {
    const marks = codeMarks({ compile, run, preview: null });
    const notes = values ? inputNotes({ compile, inputs }) : [];
    return {
      marks,
      values: notes.map(({ line, field }) => ({
        line,
        text: t('code.current', { value: inputValueText(field.descriptor, field.value) }),
      })),
      kinds: lineKinds(marks, notes),
    };
  }, [compile, run, inputs, values, t]);
}

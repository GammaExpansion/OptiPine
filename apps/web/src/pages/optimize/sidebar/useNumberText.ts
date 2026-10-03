import { useState } from 'react';
import { parseNumber } from './search-display.ts';

const plain = (value: number) => (Number.isNaN(value) ? '' : String(value));

/**
 * A number field's text: what was typed while it still reads as the stored number, so "2." and
 * "abc" stay as typed, and the number formatted once it changes elsewhere or the field blurs.
 */
export function useNumberText(value: number, format: (value: number) => string = plain) {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    text: draft !== null && Object.is(parseNumber(draft), value) ? draft : format(value),
    /** Keep the typed text and return the number it reads as (NaN when none). */
    edit(raw: string): number {
      setDraft(raw);
      return parseNumber(raw);
    },
    end: () => setDraft(null),
  };
}

import type { RunInput, SymbolInfo } from '../types.ts';

/** One defaults table for every consumer: interpreter, broker, clock and formatters. */
export const SYMBOL_DEFAULTS: Readonly<SymbolInfo> = {
  mintick: 0.01,
  pointvalue: 1,
  mincontract: 1,
  timezone: 'Etc/UTC',
  session_hours: '0000-0000',
  currency: 'USD',
};

const positiveNumbers = ['mintick', 'pointvalue', 'mincontract'] as const;
const strings = ['timezone', 'session_hours', 'currency'] as const;

/**
 * Validate caller metadata once per run. Missing keys take the shared defaults, present keys
 * must have the documented type, and unknown keys pass through for `syminfo.*` reads.
 */
export function resolveSymbolInfo(raw: RunInput['syminfo']): SymbolInfo {
  const resolved = { ...SYMBOL_DEFAULTS, ...raw } as SymbolInfo;
  for (const key of positiveNumbers) {
    const value: unknown = raw[key];
    if (value === undefined || value === null) resolved[key] = SYMBOL_DEFAULTS[key];
    else if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
      throw new Error(
        `syminfo.${key} must be a positive finite number, not ${JSON.stringify(value)}`,
      );
  }
  for (const key of strings) {
    const value: unknown = raw[key];
    if (value === undefined || value === null) resolved[key] = SYMBOL_DEFAULTS[key];
    else if (typeof value !== 'string')
      throw new Error(`syminfo.${key} must be a string, not ${JSON.stringify(value)}`);
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: resolved.timezone });
  } catch {
    throw new Error(`syminfo.timezone is not a valid IANA time zone: ${resolved.timezone}`);
  }
  return resolved;
}

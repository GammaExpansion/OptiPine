import { renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import { I18nProvider } from '../../../i18n/I18nProvider.tsx';
import { useOptimizeTestServices } from '../test-support.tsx';
import { useResultFormat } from './useResultFormat.ts';

useOptimizeTestServices();
test('formats financial units, missing values and script parameters without losing precision', () => {
  const { result } = renderHook(useResultFormat, { wrapper: I18nProvider });
  expect(result.current.number(null)).toBe('—');
  expect(result.current.number(NaN)).toBe('—');
  expect(result.current.number(1234.567, true)).toBe('+1,234.57');
  // R1's figures keep their decimals, and negatives take a minus sign (bug bash #27).
  expect(result.current.number(53264.2, true, 2)).toBe('+53,264.20');
  expect(result.current.number(-15877.4, true, 0)).toBe('−15,877');
  expect(result.current.number(5.5, false, 2)).toBe('5.50');
  expect(result.current.drawdown(9.8)).toBe('−9.8%');
  expect(result.current.drawdown(0)).toBe('0.0%');
  expect(result.current.drawdown(null)).toBe('—');
  expect(result.current.parameter(0.001)).toBe('0.001');
  expect(result.current.parameter(false)).toBe('off');
  expect(result.current.parameter('close')).toBe('close');
  expect(result.current.metricValue('maxDrawdown', null)).toBe('—');
  expect(result.current.condition({ metric: 'winRate', operator: '>=', value: 45 })).toBe(
    'Win rate ≥ 45%',
  );
});

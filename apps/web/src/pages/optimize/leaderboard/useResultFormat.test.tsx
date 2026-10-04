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
  // Presets, the leaderboard's chips and R9 read conditions as the right panel's chips do (R10).
  expect(result.current.condition({ metric: 'profitFactor', operator: '>=', value: 1.2 })).toBe(
    'PF ≥ 1.2',
  );
  expect(result.current.condition({ metric: 'sharpeRatio', operator: '>=', value: 1 })).toBe(
    'Sharpe ratio ≥ 1.0',
  );
});

test('objective values read as R1 writes them, on the map, its tooltip and sensitivity', () => {
  const { result } = renderHook(useResultFormat, { wrapper: I18nProvider });
  const { objective } = result.current;
  expect([objective(31_642.38, 'netProfit'), objective(-1_078.84, 'netProfit')]).toEqual([
    '+31,642',
    '−1,079',
  ]);
  expect(objective(1.714, 'profitFactor')).toBe('1.71');
  expect(objective(-0.5, 'sharpeRatio')).toBe('−0.50');
  expect(objective(12.4, 'maxDrawdown')).toBe('12.40%');
  expect(objective(8.256, 'annualizedReturn')).toBe('+8.26%');
  expect(objective(31_738.2540496, 'neighbourhoodMean')).toBe('+31,738');
  expect(objective(null, 'netProfit')).toBe('—');
});

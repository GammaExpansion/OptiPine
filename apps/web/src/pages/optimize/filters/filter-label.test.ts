import { expect, test } from 'vitest';
import { translate } from '../../../i18n/translate.ts';
import { defaultFilters, filterPresets } from '../../../workflows/optimize-ranking.ts';
import { filterLabel } from './filter-label.ts';

test('filter chips read as short metric names with their units (O1, R10)', () => {
  expect(defaultFilters.map((filter) => translate(filterLabel(filter), 'en'))).toEqual([
    'Trades ≥ 30',
    'Max DD ≤ 15%',
  ]);
  expect(filterPresets.map((filter) => translate(filterLabel(filter), 'en'))).toEqual([
    'PF ≥ 1.2',
    'Win rate ≥ 45%',
    'Sharpe ratio ≥ 1.0',
    'Avg P&L ≥ 0',
    'Consecutive losses ≤ 6',
  ]);
  expect(translate(filterLabel(defaultFilters[1]), 'zh')).toBe('最大回撤 ≤ 15%');
  expect(translate(filterLabel(filterPresets[0]), 'zh')).toBe('盈利因子 ≥ 1.2');
  // A ratio keeps one decimal at least and a typed value its own (R10).
  const ratio = (value: number) =>
    translate(filterLabel({ metric: 'sortinoRatio', operator: '>=', value }), 'en');
  expect([ratio(2), ratio(1.25)]).toEqual(['Sortino ratio ≥ 2.0', 'Sortino ratio ≥ 1.25']);
});

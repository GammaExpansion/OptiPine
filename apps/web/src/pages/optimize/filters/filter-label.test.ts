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
    'Sharpe ratio ≥ 1',
    'Avg P&L ≥ 0',
    'Consecutive losses ≤ 6',
  ]);
  expect(translate(filterLabel(defaultFilters[1]), 'zh')).toBe('最大回撤 ≤ 15%');
});

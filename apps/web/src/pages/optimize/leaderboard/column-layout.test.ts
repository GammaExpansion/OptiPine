import { expect, test } from 'vitest';
import { inputColumns } from './column-layout.ts';

test('keeps the axis-first order and collapses remaining inputs as the pane shrinks', () => {
  const columns = ['Length', 'Multiplier', 'Source', 'Use trailing stop', 'Trail %'];
  expect(inputColumns(columns, 624, true)).toEqual({
    visible: columns.slice(0, 2),
    hidden: columns.slice(2),
  });
  expect(inputColumns(columns, 1200, true)).toEqual({ visible: columns, hidden: [] });
  expect(inputColumns(columns, 320, true)).toEqual({ visible: [], hidden: columns });
  expect(inputColumns(['Length'], 460, true)).toEqual({ visible: ['Length'], hidden: [] });
});

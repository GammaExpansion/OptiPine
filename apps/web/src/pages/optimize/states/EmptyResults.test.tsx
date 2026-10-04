import { act, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { uiStore } from '../../../state/ui.ts';
import { setViewportWidth } from '../../../test/viewport.ts';
import { optimization, renderInEnglish, useOptimizeTestServices } from '../test-support.tsx';
import { EmptyResults } from './EmptyResults.tsx';

useOptimizeTestServices();

test('the empty results name what the chosen validation shows after a run (O1, W1, #16)', () => {
  renderInEnglish(<EmptyResults />);
  expect(
    screen.getByText(/the summary chart, leaderboard, parameter map and sensitivity/),
  ).toBeVisible();
  act(() => optimization().actions.setValidation({ mode: 'walk-forward' }));
  expect(
    screen.getByText(
      'Set the search ranges and the walk-forward windows on the right. After a run, the stitched OOS equity, the results of each window and their stability appear here.',
    ),
  ).toBeVisible();
  expect(screen.queryByText(/leaderboard/)).toBeNull();
});

test('a phone points walk-forward to Settings and its tabs, in both languages (G4, #16)', () => {
  setViewportWidth(390);
  act(() => optimization().actions.setValidation({ mode: 'walk-forward' }));
  renderInEnglish(<EmptyResults />);
  expect(
    screen.getByText(
      'Set the search ranges and the walk-forward windows under Settings. After a run, the stitched OOS equity appears above the tabs, and the windows and their stability in their tabs.',
    ),
  ).toBeVisible();
  act(() => uiStore.getState().setLanguage('zh'));
  expect(
    screen.getByText(
      '在「设置」中设置搜索范围与滚动窗口。运行后，拼接样本外权益显示在标签页上方，各窗口结果及其稳定性显示在各自的标签页。',
    ),
  ).toBeVisible();
});

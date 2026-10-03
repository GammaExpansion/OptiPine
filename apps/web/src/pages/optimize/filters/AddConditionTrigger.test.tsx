import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { optimization, renderInEnglish, useOptimizeTestServices } from '../test-support.tsx';
import { AddConditionTrigger } from './AddConditionTrigger.tsx';

useOptimizeTestServices();

test('+ Condition opens its popover, and closing it drops the condition being written', async () => {
  const user = userEvent.setup();
  renderInEnglish(<AddConditionTrigger />);
  const trigger = screen.getByRole('button', { name: '+ Condition' });
  await user.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Add condition' })).toBeVisible();
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  act(() =>
    optimization().actions.setDraftFilter({ metric: 'profitFactor', operator: '>=', value: 1.3 }),
  );
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'Add condition' })).toBeNull();
  expect(optimization().viewSettings.draft).toBeNull();
  expect(trigger).toHaveFocus();
});

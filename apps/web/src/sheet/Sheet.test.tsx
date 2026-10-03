import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { uiStore } from '../state/ui.ts';
import { Sheet } from './Sheet.tsx';

beforeEach(() => uiStore.setState({ language: 'en' }));
test('sheet renders the reference and switches the entire catalog to Chinese', async () => {
  const user = userEvent.setup();
  render(
    <I18nProvider>
      <Sheet />
    </I18nProvider>,
  );
  expect(screen.getByTestId('g5-sheet')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Surfaces and text' })).toBeVisible();
  await user.click(screen.getByRole('radio', { name: '中' }));
  expect(screen.getByRole('heading', { name: '底色与文字' })).toBeVisible();
  expect(document.title).toBe('组件与状态');
});
test('properties sample supports editing and resetting to script values', async () => {
  const user = userEvent.setup();
  render(
    <I18nProvider>
      <Sheet />
    </I18nProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Properties' }));
  const dialog = screen.getByRole('dialog');
  const slippage = within(dialog).getByRole('spinbutton', { name: 'Slippage' });
  expect(slippage).toHaveValue('1');
  await user.click(within(dialog).getByRole('button', { name: 'Reset all to script values' }));
  expect(slippage).toHaveValue('0');
  expect(within(dialog).queryByText('Overridden; the script value is 0.')).not.toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

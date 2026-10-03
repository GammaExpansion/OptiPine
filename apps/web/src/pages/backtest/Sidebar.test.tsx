import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { getBacktestStore } from '../../state/backtest.ts';
import { uiStore } from '../../state/ui.ts';
import { strategySource } from '../../workflows/test-support.ts';
import { Sidebar } from './Sidebar.tsx';
import {
  loadScript,
  renderInEnglish,
  runBacktest,
  useBacktestTestServices,
} from './states/test-support.tsx';

useBacktestTestServices();
const length = () => screen.getByRole('spinbutton', { name: 'Length' });

test('before a compile the panel explains where inputs and properties come from', () => {
  renderInEnglish(<Sidebar />);
  expect(
    screen.getByText('Once the script compiles, its inputs are listed here in declaration order.'),
  ).toBeInTheDocument();
  expect(screen.getByText('Defaults come from the strategy() call.')).toBeInTheDocument();
});

test('inputs edit the session, show their default once changed, and explain invalid values', async () => {
  await loadScript();
  renderInEnglish(<Sidebar />);
  expect(screen.getByText('2 – 50')).toBeInTheDocument();
  expect(screen.getByText('Step 0.25')).toBeInTheDocument();
  expect(length()).toHaveValue('5');
  expect(screen.getByRole('spinbutton', { name: 'Multiplier' })).toHaveValue('1.00');
  fireEvent.click(screen.getByRole('button', { name: 'Increase Length' }));
  expect(getBacktestStore().getState().inputs[0].value).toBe(6);
  expect(screen.getByText('Default 5')).toBeInTheDocument();
  expect(screen.getByText('3 inputs, 1 changed')).toBeInTheDocument();
  length().focus();
  fireEvent.change(length(), { target: { value: 'abc' } });
  expect(length()).toHaveValue('abc');
  expect(screen.getByRole('alert')).toHaveTextContent('Length must be a whole number');
  expect(getBacktestStore().getState().readiness.ok).toBe(false);
  fireEvent.change(length(), { target: { value: '1' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Length must be at least 2');
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(getBacktestStore().getState().inputs[0].value).toBe(5);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(length()).toHaveValue('5');
});

test('a draft such as "2." stays as typed and settles formatted on blur', async () => {
  await loadScript();
  renderInEnglish(<Sidebar />);
  const multiplier = screen.getByRole('spinbutton', { name: 'Multiplier' });
  multiplier.focus();
  fireEvent.change(multiplier, { target: { value: '2.' } });
  expect(multiplier).toHaveValue('2.');
  expect(getBacktestStore().getState().inputs[1].value).toBe(2);
  fireEvent.blur(multiplier);
  expect(multiplier).toHaveValue('2.00');
});

test('an outdated result leaves the panel to the changed input’s dot and default (B9)', async () => {
  await loadScript();
  const view = renderInEnglish(<Sidebar />);
  await runBacktest();
  act(() => getBacktestStore().getState().actions.setInput('Length', 9));
  expect(getBacktestStore().getState().outdated?.reasons).toEqual(['inputs']);
  expect(screen.getByText('Default 5')).toBeInTheDocument();
  expect(screen.getByText('Length').querySelector('span')).toBeInTheDocument();
  expect(view.container).not.toHaveTextContent('Current results use');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('after a failed compile the last inputs stay, with a note (B10)', async () => {
  await loadScript();
  renderInEnglish(<Sidebar />);
  act(() => getBacktestStore().getState().actions.setSource('//@version=6\nplot(missing)'));
  await waitFor(() =>
    expect(
      screen.getByText(
        'These inputs are from the last successful compile and refresh once the script is fixed.',
      ),
    ).toBeInTheDocument(),
  );
  expect(length()).toBeInTheDocument();
});

test('read-only inputs state why, and the properties summary opens All settings', async () => {
  await loadScript(
    strategySource.replace(
      'src = input.source(close, "Source")',
      'src = input.source(close, "Source")\natr = input.int(math.round(14.0), "ATR length")',
    ),
  );
  renderInEnglish(<Sidebar />);
  expect(screen.getByText('Set by a script expression')).toBeInTheDocument();
  expect(screen.getByLabelText('ATR length')).toHaveAttribute('readonly');
  expect(screen.getByText('10,000 USD')).toBeInTheDocument();
  expect(screen.getByText('50% of equity')).toBeInTheDocument();
  act(() => getBacktestStore().getState().actions.setProperty('slippage', 2));
  expect(screen.getByText('script 0 ticks')).toBeInTheDocument();
  expect(screen.getByText('2 ticks')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'All settings' }));
  expect(uiStore.getState().openDialogs).toEqual(['properties']);
});

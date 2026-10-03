import { act, fireEvent, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import {
  loadScript,
  renderInEnglish,
  runBacktest,
  useBacktestTestServices,
} from '../../pages/backtest/states/test-support.tsx';
import { getBacktestStore } from '../../state/backtest.ts';
import { uiStore } from '../../state/ui.ts';
import { strategySource } from '../../workflows/test-support.ts';
import { PropertiesDialog } from './PropertiesDialog.tsx';

useBacktestTestServices();
const field = (name: string) => screen.getByRole('spinbutton', { name });

test('the three groups show the script’s values with the partial-support notes (B13)', async () => {
  await loadScript();
  act(() => uiStore.getState().setDialogOpen('properties', true));
  renderInEnglish(<PropertiesDialog />);
  expect(screen.getByRole('dialog', { name: 'Properties' })).toHaveAccessibleDescription(
    'Shared by backtest and optimization',
  );
  for (const group of ['General', 'Detalization and execution', 'Broker emulator'])
    expect(screen.getByRole('heading', { name: group })).toBeInTheDocument();
  expect(field('Initial capital')).toHaveValue('10,000');
  expect(field('Order size')).toHaveValue('50');
  expect(screen.getByRole('combobox', { name: 'Order size unit' })).toHaveTextContent('% equity');
  expect(field('Commission')).toHaveValue('0.1');
  expect(screen.getByText('Only the chart currency is supported.')).toBeInTheDocument();
  expect(screen.getByText('Only the default detalization is supported.')).toBeInTheDocument();
  expect(screen.getByText('0 overridden')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reset all to script values' })).toBeDisabled();
});

test('an override is marked with the script value and resets alone or with all (B13)', async () => {
  await loadScript();
  renderInEnglish(<PropertiesDialog />);
  const slippage = field('Slippage');
  slippage.focus();
  fireEvent.change(slippage, { target: { value: '2' } });
  expect(getBacktestStore().getState().propertyOverrides).toEqual({ slippage: 2 });
  expect(screen.getByText('Overridden; the script value is 0 ticks.')).toBeInTheDocument();
  expect(screen.getByText('1 overridden')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(getBacktestStore().getState().propertyOverrides).toEqual({});
  const capital = field('Initial capital');
  capital.focus();
  fireEvent.change(capital, { target: { value: '25,000' } });
  fireEvent.change(field('Pyramiding'), { target: { value: '-1' } });
  expect(getBacktestStore().getState().propertyOverrides).toEqual({
    initialCapital: 25000,
    pyramiding: -1,
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Must be a whole number, zero or greater');
  expect(getBacktestStore().getState().readiness.ok).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Reset all to script values' }));
  expect(getBacktestStore().getState().propertyOverrides).toEqual({});
});

test('an override of a value the script computes also resets alone', async () => {
  await loadScript(strategySource.replace('initial_capital=10000', 'initial_capital=5000 * 2'));
  renderInEnglish(<PropertiesDialog />);
  const capital = field('Initial capital');
  expect(capital).toHaveValue('');
  capital.focus();
  fireEvent.change(capital, { target: { value: '30000' } });
  expect(
    screen.getByText('Overridden; the script computes this value on line 2.'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(getBacktestStore().getState().propertyOverrides).toEqual({});
  expect(screen.queryByText(/Overridden/)).not.toBeInTheDocument();
});

test('a property override changes the next result', async () => {
  await loadScript();
  renderInEnglish(<PropertiesDialog />);
  await runBacktest();
  const before = getBacktestStore().getState().result!.initialCapital;
  const capital = field('Initial capital');
  capital.focus();
  fireEvent.change(capital, { target: { value: '50000' } });
  expect(getBacktestStore().getState().outdated?.reasons).toEqual(['properties']);
  await runBacktest();
  expect(before).toBe(10_000);
  expect(getBacktestStore().getState().result!.initialCapital).toBe(50_000);
});

test('Back to inputs and Escape close the panel', async () => {
  await loadScript();
  act(() => uiStore.getState().setDialogOpen('properties', true));
  renderInEnglish(<PropertiesDialog />);
  fireEvent.click(screen.getByRole('button', { name: 'Back to inputs' }));
  expect(uiStore.getState().openDialogs).toEqual([]);
  act(() => uiStore.getState().setDialogOpen('properties', true));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(uiStore.getState().openDialogs).toEqual([]);
});

test('on the Optimize page the panel goes back to the optimization settings', async () => {
  await loadScript();
  act(() => uiStore.setState({ page: 'optimize', openDialogs: ['properties'] }));
  renderInEnglish(<PropertiesDialog />);
  fireEvent.click(screen.getByRole('button', { name: 'Back to settings' }));
  expect(uiStore.getState().openDialogs).toEqual([]);
});

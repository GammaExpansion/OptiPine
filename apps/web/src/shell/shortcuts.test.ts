import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getBacktestStore, openScript } from '../state/backtest.ts';
import { getMarketDataStore } from '../state/marketData.ts';
import { replaceServices } from '../state/services.ts';
import { fakeServices, testInput } from '../state/test-support.ts';
import { uiStore } from '../state/ui.ts';
import { DropdownMenu } from '../components/DropdownMenu.tsx';
import { strategySource } from '../workflows/test-support.ts';
import { installShortcuts, registerFilePicker } from './shortcuts.ts';

let restore: () => void;
let remove: () => void;
beforeEach(() => {
  restore = replaceServices(() => fakeServices());
  remove = installShortcuts();
  uiStore.setState({ page: 'backtest', openDialogs: [] });
});
afterEach(() => {
  remove();
  cleanup();
  document.body.replaceChildren();
  restore();
});

function key(key: string, target: EventTarget = window, change: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...change,
  });
  target.dispatchEvent(event);
  return event;
}

async function ready() {
  openScript({ source: strategySource, fileName: 'test.pine', origin: { kind: 'file' } });
  getMarketDataStore().getState().actions.useCsv(testInput, 'prices.csv');
  await waitFor(() => expect(getBacktestStore().getState().readiness.ok).toBe(true));
}

test('Ctrl+Enter runs only a ready Backtest page and does not repeat while running', async () => {
  expect(key('Enter').defaultPrevented).toBe(false);
  await ready();
  uiStore.getState().setPage('optimize');
  expect(key('Enter').defaultPrevented).toBe(false);
  uiStore.getState().setPage('backtest');
  expect(key('Enter').defaultPrevented).toBe(true);
  expect(getBacktestStore().getState().run.status).toBe('running');
  expect(key('Enter').defaultPrevented).toBe(false);
  await waitFor(() => expect(getBacktestStore().getState().run.status).toBe('done'));
});

test('Ctrl+Enter on a focused menu trigger runs the backtest instead of opening the menu', async () => {
  await ready();
  const onOpenChange = vi.fn();
  // The script button keeps the focus after a menu item loads an example.
  render(
    createElement(DropdownMenu, {
      label: 'Script menu',
      trigger: createElement('button', { type: 'button' }, 'test.pine'),
      entries: [],
      onOpenChange,
    }),
  );
  const trigger = screen.getByRole('button', { name: 'test.pine' });
  trigger.focus();
  expect(key('Enter', trigger).defaultPrevented).toBe(true);
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(getBacktestStore().getState().run.status).toBe('running');
  await waitFor(() => expect(getBacktestStore().getState().run.status).toBe('done'));
});

test('Ctrl+O uses the current registered picker and cleanup cannot remove a newer handler', () => {
  const old = vi.fn();
  const picker = vi.fn();
  const unregisterOld = registerFilePicker(old);
  const unregister = registerFilePicker(picker);
  unregisterOld();
  expect(key('O').defaultPrevented).toBe(true);
  expect(picker).toHaveBeenCalledTimes(1);
  expect(old).not.toHaveBeenCalled();
  unregister();
  expect(key('o').defaultPrevented).toBe(false);
});

test.each(['input', 'textarea', 'select', 'editable', 'textbox', 'combobox', 'dialog', 'menu'])(
  '%s keeps its shortcut keys',
  async (kind) => {
    await ready();
    const element = document.createElement(
      ['input', 'textarea', 'select'].includes(kind) ? kind : 'div',
    );
    if (kind === 'editable') element.setAttribute('contenteditable', 'true');
    else if (!['input', 'textarea', 'select'].includes(kind)) element.setAttribute('role', kind);
    document.body.append(element);
    const picker = vi.fn();
    const unregister = registerFilePicker(picker);
    expect(key('Enter', element).defaultPrevented).toBe(false);
    expect(key('o', element).defaultPrevented).toBe(false);
    expect(getBacktestStore().getState().run.status).toBe('idle');
    expect(picker).not.toHaveBeenCalled();
    unregister();
  },
);

test('Escape is untouched; open dialogs, composition, repeats and handled events suppress shortcuts', () => {
  const picker = vi.fn();
  const unregister = registerFilePicker(picker);
  expect(key('Escape', window, { ctrlKey: false }).defaultPrevented).toBe(false);
  uiStore.getState().setDialogOpen('marketData', true);
  expect(key('o').defaultPrevented).toBe(false);
  uiStore.getState().setDialogOpen('marketData', false);
  for (const change of [
    { isComposing: true },
    { repeat: true },
    { shiftKey: true },
    { altKey: true },
    { ctrlKey: false },
  ])
    expect(key('o', window, change).defaultPrevented).toBe(false);
  const event = new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, cancelable: true });
  event.preventDefault();
  fireEvent(window, event);
  expect(picker).not.toHaveBeenCalled();
  remove();
  key('o');
  expect(picker).not.toHaveBeenCalled();
  unregister();
});

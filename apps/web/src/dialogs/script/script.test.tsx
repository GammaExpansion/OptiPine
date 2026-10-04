import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider.tsx';
import { getBacktestStore, openScript } from '../../state/backtest.ts';
import { replaceServices } from '../../state/services.ts';
import { fakeServices } from '../../state/test-support.ts';
import { uiStore } from '../../state/ui.ts';
import { FirstLaunch } from '../../pages/backtest/FirstLaunch.tsx';
import { HeaderData } from '../../shell/HeaderData.tsx';
import { DialogsRoot } from '../../shell/DialogsRoot.tsx';
import { installShortcuts } from '../../shell/shortcuts.ts';
import { downloadScript, pasteStore, showPaste } from './actions.ts';
import { preloadChunks } from '../../test/lazy-chunks.ts';

preloadChunks('dialogs');
let restore: () => void;
beforeEach(() => {
  restore = replaceServices(() => fakeServices());
  pasteStore.setState({ source: '', clipboardFailed: false });
  uiStore.setState({ language: 'en', openDialogs: [], page: 'backtest' });
});
afterEach(() => {
  cleanup();
  restore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function mount() {
  return render(
    <I18nProvider>
      <HeaderData />
      <FirstLaunch />
      <DialogsRoot />
    </I18nProvider>,
  );
}
const source = '//@version=6\nstrategy("Local")\nplot(close)';
function file(name: string, content: string | Promise<string>) {
  const value = new File([], name);
  Object.defineProperty(value, 'text', { value: () => Promise.resolve(content) });
  return value;
}

test('first launch explains missing prerequisites and allows the store run when ready', async () => {
  mount();
  const user = userEvent.setup();
  expect(screen.getByRole('button', { name: 'Run backtest' })).toHaveAccessibleDescription(
    'Open a script and select market data first',
  );
  expect(screen.getByText('Scripts and backtests run only in your browser')).toBeVisible();
  await user.click(screen.getByRole('button', { name: /Load example/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run backtest' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Run backtest' }));
  await waitFor(() => expect(getBacktestStore().getState().result).not.toBeNull());
});

test('pasted code asks before replacing an existing script and cancelling keeps the source', async () => {
  openScript({ source, fileName: 'local.pine', origin: { kind: 'file' } });
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Paste code' }));
  await user.type(
    await screen.findByRole('textbox', { name: 'Pine source' }),
    '//@version=6\nstrategy("Paste")',
  );
  await user.click(screen.getByRole('button', { name: 'Use this code' }));
  expect(screen.getByRole('dialog', { name: 'Replace the current script?' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(getBacktestStore().getState().source).toBe(source);
  await user.click(screen.getByRole('button', { name: 'Use this code' }));
  await user.click(screen.getByRole('button', { name: 'Replace script' }));
  expect(getBacktestStore().getState().origin).toEqual({ kind: 'pasted' });
  expect(getBacktestStore().getState().fileName).toBeNull();
});

test('clipboard menu seeds the paste dialog and failure still permits manual paste', async () => {
  mount();
  const user = userEvent.setup();
  await user.copy();
  vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue(source);
  // The menu loads on the first click and opens once it is in.
  await user.click(screen.getByRole('button', { name: 'Open script' }));
  await user.click(
    await screen.findByRole('menuitem', { name: 'Paste from clipboard and replace' }),
  );
  expect(await screen.findByRole('textbox', { name: 'Pine source' })).toHaveValue(source);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  vi.mocked(navigator.clipboard.readText).mockRejectedValue(new Error('denied'));
  await act(async () => showPaste(true));
  expect(screen.getByText(/Clipboard access is unavailable/)).toBeVisible();
});

test('the persistent file picker serves Ctrl+O and ignores superseded file reads', async () => {
  mount();
  const user = userEvent.setup();
  const input = screen.getByLabelText('Open .pine file') as HTMLInputElement;
  const click = vi.spyOn(input, 'click');
  const release = installShortcuts();
  await user.keyboard('{Control>}o{/Control}');
  expect(click).toHaveBeenCalledOnce();
  release();
  let done!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    done = resolve;
  });
  await user.upload(input, file('old.pine', pending));
  await user.upload(input, file('new.pine', source));
  await waitFor(() => expect(getBacktestStore().getState().fileName).toBe('new.pine'));
  await act(async () => done('old source'));
  expect(getBacktestStore().getState().source).toBe(source);
});

test('a file read failure is visible and does not replace the source', async () => {
  mount();
  const user = userEvent.setup();
  const value = new File([], 'unreadable.pine');
  Object.defineProperty(value, 'text', {
    value: async () => {
      throw new Error('unreadable');
    },
  });
  await user.upload(screen.getByLabelText('Open .pine file'), value);
  expect(await screen.findByText(/Could not open the file/)).toBeVisible();
  expect(getBacktestStore().getState().source).toBe('');
});

test('script menu has compile facts and marks the current example', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Load example/ }));
  await waitFor(() => expect(getBacktestStore().getState().compile.status).toBe('compiled'));
  await user.click(screen.getByRole('button', { name: /trend-breakout.pine/ }));
  expect(await screen.findByText(/Pine v6, 5 inputs, 3 plots, compiled in/)).toBeVisible();
  expect(
    screen.getByRole('menuitem', { name: 'Trend Breakout' }).querySelector('svg'),
  ).not.toBeNull();
  await user.click(screen.getByRole('menuitem', { name: 'MA Cross' }));
  expect(getBacktestStore().getState().origin).toEqual({ kind: 'example', id: 'ma-cross' });
});

test('download uses the exact file name and source blob', () => {
  vi.useFakeTimers();
  openScript({ source, fileName: 'my-strategy.pine', origin: { kind: 'file' } });
  const create = vi.fn((_blob: Blob) => 'blob:script');
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }),
  );
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    expect(this.download).toBe('my-strategy.pine');
    expect(this.href).toBe('blob:script');
  });
  downloadScript('script.pine');
  expect(click).toHaveBeenCalledOnce();
  expect(create.mock.calls[0][0]).toMatchObject({
    size: source.length,
    type: 'text/plain;charset=utf-8',
  });
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalledWith('blob:script');
});

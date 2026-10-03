import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { expect, test } from 'vitest';
import { getBacktestStore } from '../../../state/backtest.ts';
import { getSelectionStore } from '../../../state/selection.ts';
import { uiStore } from '../../../state/ui.ts';
import { strategySource } from '../../../workflows/test-support.ts';
import {
  failingSource,
  quietSource,
  loadScript,
  renderInEnglish,
  runBacktest,
  useBacktestTestServices,
} from '../states/test-support.tsx';
import { CodeTab } from './CodeTab.tsx';

useBacktestTestServices();
const editor = () =>
  EditorView.findFromDOM(screen.getByRole('textbox', { name: 'Pine code editor' }))!;
const line = (number: number) => document.querySelectorAll('.cm-line')[number - 1];

test('the empty editor shows the placeholder, and typing starts a pasted script', async () => {
  renderInEnglish(<CodeTab />);
  expect(screen.getByText('Paste strategy code here, or drop a .pine file')).toBeInTheDocument();
  act(() => editor().dispatch({ changes: { from: 0, insert: strategySource } }));
  expect(getBacktestStore().getState()).toMatchObject({
    source: strategySource,
    fileName: null,
    origin: { kind: 'pasted' },
  });
  await waitFor(() => expect(getBacktestStore().getState().compile.status).toBe('compiled'));
});

test('editing recompiles in the background and each input shows its current value', async () => {
  await loadScript();
  renderInEnglish(<CodeTab />);
  expect(screen.getByText('Current 5')).toBeInTheDocument();
  expect(screen.getByText('Current 1.00')).toBeInTheDocument();
  expect(screen.getByText('Current close')).toBeInTheDocument();
  act(() => getBacktestStore().getState().actions.setInput('Length', 8));
  expect(screen.getByText('Current 8')).toBeInTheDocument();
  expect(line(3)).toHaveClass('cm-line-in');
  const at = editor().state.doc.line(3).from;
  act(() =>
    editor().dispatch({ changes: { from: at, to: at + 'length'.length, insert: 'period' } }),
  );
  expect(getBacktestStore().getState().compile.status).toBe('compiling');
  expect(getBacktestStore().getState().source).toContain('period = input.int');
  await waitFor(() => expect(getBacktestStore().getState().compile.status).toBe('failed'));
  expect(line(6)).toHaveClass('cm-line-er');
  expect(document.querySelector('.cm-squiggle')).toHaveTextContent('length');
  expect(screen.queryByText('Current 8')).not.toBeInTheDocument();
});

test('Go to line opens the tab, selects the line and keeps it after switching tabs', async () => {
  await loadScript(failingSource);
  await runBacktest();
  const view = renderInEnglish(<CodeTab />);
  expect(line(14)).toHaveClass('cm-line-er');
  act(() => getSelectionStore().getState().revealCodeLine(14));
  expect(uiStore.getState().dockTab).toBe('code');
  const selection = editor().state.selection.main;
  expect([selection.from, selection.to]).toEqual([
    editor().state.doc.line(14).from,
    editor().state.doc.line(14).to,
  ]);
  act(() => editor().dispatch({ changes: { from: 0, insert: '// note\n' } }));
  view.unmount();
  renderInEnglish(<CodeTab />);
  expect(editor().state.doc.line(1).text).toBe('// note');
  // The request was handled before; remounting does not reveal it again.
  expect(editor().state.selection.main.from).not.toBe(editor().state.doc.line(14).from);
});

test('Ctrl + Enter in the editor runs a ready backtest', async () => {
  await loadScript();
  renderInEnglish(<CodeTab />);
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Pine code editor' }), {
    key: 'Enter',
    ctrlKey: true,
  });
  expect(getBacktestStore().getState().run.status).toBe('running');
  await waitFor(() => expect(getBacktestStore().getState().run.status).toBe('done'));
});

test('dropping a .pine file opens it as the script; other files are ignored', async () => {
  await loadScript();
  renderInEnglish(<CodeTab />);
  // jsdom's File has no text(); the editor reads only the name and the text.
  const file = (name: string, text: string) => ({ name, text: async () => text }) as File;
  const drop = (dropped: File) =>
    fireEvent.drop(screen.getByRole('textbox', { name: 'Pine code editor' }), {
      dataTransfer: { files: [dropped], types: ['Files'] },
    });
  drop(file('notes.txt', 'not pine'));
  drop(file('quiet.pine', quietSource));
  await waitFor(() =>
    expect(getBacktestStore().getState()).toMatchObject({
      source: quietSource,
      fileName: 'quiet.pine',
      origin: { kind: 'file' },
    }),
  );
  expect(editor().state.doc.toString()).toBe(quietSource);
});

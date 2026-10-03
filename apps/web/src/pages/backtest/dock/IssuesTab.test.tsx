import { act, fireEvent, screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { getSelectionStore } from '../../../state/selection.ts';
import { uiStore } from '../../../state/ui.ts';
import { strategySource } from '../../../workflows/test-support.ts';
import {
  failingSource,
  loadScript,
  renderInEnglish,
  runBacktest,
  useBacktestTestServices,
} from '../states/test-support.tsx';
import { IssuesTab } from './IssuesTab.tsx';

useBacktestTestServices();

test('without issues the tab says so', () => {
  renderInEnglish(<IssuesTab />);
  expect(screen.getByText('No issues')).toBeInTheDocument();
});

test('a compile error lists its line and column, with the code beside it (B10)', async () => {
  await loadScript('//@version=6\nstrategy("Broken")\nbasis = ta.sma(close, lenght)\nplot(basis)');
  renderInEnglish(<IssuesTab />);
  const row = within(screen.getByRole('list', { name: 'Issues' })).getByRole('button');
  expect(row).toHaveTextContent('Compile error');
  expect(row).toHaveTextContent('Line 3, column 23');
  expect(row).toHaveTextContent('lenght');
  expect(screen.getByText('Fix the errors to run.')).toBeInTheDocument();
  expect(await screen.findByRole('textbox', { name: 'Code around line 3' })).toHaveAttribute(
    'contenteditable',
    'false',
  );
  expect(document.querySelector('.cm-squiggle')).toHaveTextContent('lenght');
  fireEvent.click(row);
  expect(uiStore.getState().dockTab).toBe('code');
  expect(getSelectionStore().getState().codeLine).toMatchObject({ line: 3 });
});

test('a runtime error states its line and the bar counted from one (B11)', async () => {
  await loadScript(failingSource);
  await runBacktest();
  renderInEnglish(<IssuesTab />);
  const row = screen.getByRole('button', { name: /Runtime error/ });
  expect(row).toHaveTextContent('Line 14, bar 4');
  expect(row).toHaveTextContent('Stopped on purpose');
  expect(screen.getByText('An incomplete run shows no partial results.')).toBeInTheDocument();
  act(() => row.click());
  expect(getSelectionStore().getState().codeLine).toMatchObject({ line: 14 });
});

test('a complete result lists the effects the engine ignored', async () => {
  await loadScript(`${strategySource}log.info("checked")\n`);
  await runBacktest();
  renderInEnglish(<IssuesTab />);
  const row = screen.getByRole('button', { name: /Ignored effect/ });
  expect(row).toHaveTextContent('Line 13');
  expect(row).toHaveTextContent('log.info is ignored during execution.');
  expect(
    screen.getByText(
      'Ignored effects are calls the engine skips, such as alerts; the results are complete without them.',
    ),
  ).toBeInTheDocument();
});

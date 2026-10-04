import { act, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { uiStore } from '../../state/ui.ts';
import { Dock } from './Dock.tsx';
import {
  loadScript,
  renderInEnglish,
  runBacktest,
  useBacktestTestServices,
} from './states/test-support.tsx';

// The Report tab's chunk stays in flight until the test releases it, as on a slow first load.
const chunk = vi.hoisted(() => {
  let release!: () => void;
  const loaded = new Promise<void>((resolve) => (release = resolve));
  return { loaded, release };
});
vi.mock('./dock/ReportTab.tsx', async () => {
  await chunk.loaded;
  return { ReportTab: () => <p data-testid="report" /> };
});

useBacktestTestServices();

test('a result tab whose code is loading says so, never "run a backtest"', async () => {
  await loadScript();
  act(() => uiStore.getState().setDockTab('report'));
  renderInEnglish(<Dock>{null}</Dock>);
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Run a backtest to see results here.');
  await runBacktest();
  expect(screen.getByRole('status')).toHaveTextContent('Loading results…');
  // Suspense keeps the replaced content in the DOM, hidden.
  expect(screen.getByText('Run a backtest to see results here.')).not.toBeVisible();
  chunk.release();
  expect(await screen.findByTestId('report')).toBeVisible();
  await waitFor(() => expect(screen.queryByText('Loading results…')).toBeNull());
});

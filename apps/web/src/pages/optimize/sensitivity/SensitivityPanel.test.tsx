import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { getOptimizationStore } from '../../../state/optimization.ts';
import {
  loadOptimization,
  optimization,
  renderInEnglish,
  runOptimization,
  useOptimizeTestServices,
} from '../test-support.tsx';
import { SensitivityPanel } from './SensitivityPanel.tsx';

useOptimizeTestServices();

it('moves an axis only on Enter, restores focus and announces keyboard cancellation', async () => {
  await loadOptimization();
  await runOptimization();
  const results = optimization().results;
  renderInEnglish(<SensitivityPanel />);
  const marker = screen.getByRole('button', { name: /^Move X axis/ });
  const original = optimization().views!.summary.axes.x;
  fireEvent.keyDown(marker, { key: ' ' });
  fireEvent.keyDown(marker, { key: 'ArrowDown' });
  fireEvent.keyDown(marker, { key: 'ArrowUp' });
  expect(optimization().views!.summary.axes.x).toBe(original);
  fireEvent.keyDown(marker, { key: 'Escape' });
  expect(screen.getByRole('status')).toHaveTextContent('X axis move cancelled.');
  fireEvent.keyDown(marker, { key: ' ' });
  const rowIndex = optimization().views!.sensitivity.rows.findIndex((row) => row.role === 'x');
  fireEvent.keyDown(marker, { key: rowIndex === 0 ? 'ArrowDown' : 'ArrowUp' });
  fireEvent.keyDown(marker, { key: 'Enter' });
  await waitFor(() => expect(optimization().views!.summary.axes.x).not.toBe(original));
  expect(screen.getByRole('button', { name: /^Move X axis/ })).toHaveFocus();
  expect(screen.getByRole('status')).toHaveTextContent('X axis moved to');
  expect(optimization().results).toBe(results);
});

it('pointer capture commits a marker dropped on another sensitivity row', async () => {
  await loadOptimization();
  await runOptimization();
  const { container } = renderInEnglish(<SensitivityPanel />);
  const marker = screen.getByRole('button', { name: /^Move X axis/ });
  const rows = [...container.querySelectorAll<HTMLElement>('[data-sensitivity-row]')];
  const target = rows.find((row) => !row.contains(marker))!;
  const targetTitle =
    optimization().views!.sensitivity.rows[Number(target.dataset.sensitivityRow)].parameter;
  vi.stubGlobal('PointerEvent', MouseEvent);
  marker.setPointerCapture = vi.fn();
  marker.hasPointerCapture = () => true;
  marker.releasePointerCapture = vi.fn();
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
  fireEvent.pointerDown(marker, { button: 0 });
  fireEvent.pointerMove(marker, { clientX: 20, clientY: 50 });
  expect(target).toHaveAttribute('data-target', 'true');
  fireEvent.pointerUp(marker, { clientX: 20, clientY: 50 });
  await waitFor(() => expect(optimization().views!.summary.axes.x).toBe(targetTitle));
  vi.unstubAllGlobals();
});

it('hides sensitivity until the snapshot is complete', async () => {
  await loadOptimization();
  await runOptimization();
  act(() =>
    getOptimizationStore().setState({ views: { ...optimization().views!, inProgress: true } }),
  );
  renderInEnglish(<SensitivityPanel />);
  expect(screen.getByText('Shown when all sets finish')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

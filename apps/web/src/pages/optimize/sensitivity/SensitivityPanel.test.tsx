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

it('shows provisional sensitivity from live snapshots, with axis moves disabled until complete', async () => {
  await loadOptimization();
  await runOptimization();
  act(() =>
    getOptimizationStore().setState({ views: { ...optimization().views!, inProgress: true } }),
  );
  renderInEnglish(<SensitivityPanel />);
  expect(screen.getByText('In progress')).toBeInTheDocument();
  expect(screen.getAllByRole('img')).toHaveLength(2);
  for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
});

it('describes each value in the objective format, not as raw floats', async () => {
  await loadOptimization();
  await runOptimization();
  const { container } = renderInEnglish(<SensitivityPanel />);
  const titles = [...container.querySelectorAll('svg title')].map((title) => title.textContent);
  expect(titles.length).toBeGreaterThan(0);
  // Profit reads in whole amounts with a sign: "mean +2,317, spread +1,236–+3,330".
  for (const title of titles)
    for (const line of title!.split('\n'))
      expect(line).toMatch(/: mean (—|[+−]?[\d,]+), spread (—|[+−]?[\d,]+)–(—|[+−]?[\d,]+)$/);
});

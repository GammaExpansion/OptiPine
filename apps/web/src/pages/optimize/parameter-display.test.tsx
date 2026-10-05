import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { translateId } from '../../i18n/translate.ts';
import { getBacktestStore } from '../../state/backtest.ts';
import { uiStore } from '../../state/ui.ts';
import { strategySource } from '../../workflows/test-support.ts';
import { PreviewBanner } from '../backtest/preview/PreviewBanner.tsx';
import { loadScript } from '../backtest/states/test-support.tsx';
import { LeaderboardPanel } from './leaderboard/LeaderboardPanel.tsx';
import { CellValuesTable } from './map/CellValuesTable.tsx';
import { SelectionBar } from './selection/SelectionBar.tsx';
import { SensitivityPanel } from './sensitivity/SensitivityPanel.tsx';
import {
  optimization,
  renderInEnglish,
  runOptimization,
  useOptimizeTestServices,
} from './test-support.tsx';

useOptimizeTestServices();

for (const language of ['en', 'zh'] as const) {
  test(`run precision survives stale settings; summaries omit fixed inputs but apply them (${language})`, async () => {
    await loadScript(
      strategySource.replace(
        'length = input',
        'trail = input.float(3, "Trail %", step=0.25)\nlength = input',
      ),
    );
    act(() => {
      uiStore.getState().setLanguage(language);
      const { actions } = optimization();
      actions.setValidation({ mode: 'in-out' });
      // Inspect the full grid for this precision test, independent of the initial page capacity.
      actions.setPageSize(100);
      actions.setRange('Length', { from: 2, to: 3, step: 1 });
      actions.setSearched('Multiplier', true);
      actions.setRange('Multiplier', { from: 1.5, to: 1.75, step: 0.25 });
      // Every input starts searched over a range around its value; Trail % stays fixed.
      actions.setSearched('Trail %', false);
      actions.setFixedValue('Trail %', 7);
      actions.removeFilter(1);
      actions.removeFilter(0);
    });
    await runOptimization();
    const searched = optimization().views!.searchRows;
    const row = optimization().views!.leaderboard.rows.find(
      (row) =>
        row.parameters.Length === 2 &&
        row.parameters.Multiplier === 1.5 &&
        row.parameters.Source === 'close',
    )!;
    act(() => {
      optimization().actions.select(row.trialId);
      optimization().actions.setRange('Multiplier', { step: 0.1 });
      optimization().actions.setSearched('Source', false);
    });
    await waitFor(() => expect(optimization().views?.pending).toBe(false));
    expect(optimization().views!.searchRows).toBe(searched);
    const t = (id: Parameters<typeof translateId>[0]) => translateId(id, language);
    const user = userEvent.setup();
    renderInEnglish(
      <>
        <LeaderboardPanel />
        <SelectionBar />
        <PreviewBanner />
        <SensitivityPanel />
        <CellValuesTable
          x="Length"
          y="Multiplier"
          validated
          values={{
            values: [
              { x: 2, y: 1.5, inSample: 0, outOfSample: 0 },
              { x: 2, y: 1.75, inSample: 0, outOfSample: 0 },
            ],
            mean: { inSample: 0, outOfSample: 0 },
          }}
        />
      </>,
    );
    const selection = screen.getByRole('region', { name: t('optimize.selection.label') });
    expect(selection).toHaveTextContent('Length2Multiplier1.50Sourceclose');
    expect(selection).not.toHaveTextContent('Trail %');
    expect(
      within(screen.getByRole('table', { name: t('optimize.leaderboard.title') })).getAllByText(
        '1.50',
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('table', { name: t('optimize.map.coveredValues') })).toHaveTextContent(
      '2 / 1.50',
    );
    expect(
      screen.getByRole('img', { name: /Multiplier/ }).querySelector('title'),
    ).toHaveTextContent('1.50');
    await user.click(
      within(selection).getByRole('button', { name: t('optimize.selection.backtest') }),
    );
    await waitFor(() => expect(getBacktestStore().getState().preview?.run.status).toBe('done'));
    const banner = (await screen.findByText(t('preview.unchanged'))).closest('[role="status"]')!;
    expect(banner).toHaveTextContent('Length 2, Multiplier 1.50, close');
    expect(banner).not.toHaveTextContent('Trail %');
    await runOptimization();
    expect(optimization().results!.computedWith.search.rows).not.toBe(searched);
    expect(banner).toHaveTextContent('Length 2, Multiplier 1.50, close');
    expect(
      getBacktestStore()
        .getState()
        .inputs.find((field) => field.descriptor.title === 'Trail %')?.value,
    ).toBe(3);
    await user.click(screen.getByRole('button', { name: t('preview.apply') }));
    expect(
      getBacktestStore()
        .getState()
        .inputs.find((field) => field.descriptor.title === 'Trail %')?.value,
    ).toBe(7);
    expect(getBacktestStore().getState().result?.computedWith.inputs['Trail %']).toBe(7);
  });
}

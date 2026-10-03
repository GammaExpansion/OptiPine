import { afterEach, beforeEach, expect, test } from 'vitest';
import { strategySource } from '../workflows/test-support.ts';
import { getBacktestStore, openScript } from './backtest.ts';
import { getMarketDataStore } from './marketData.ts';
import { getSelectionStore } from './selection.ts';
import { replaceServices } from './services.ts';
import { fakeServices, testInput } from './test-support.ts';
import { uiStore } from './ui.ts';

let restore: () => void;
beforeEach(() => {
  restore = replaceServices(() => fakeServices());
  uiStore.setState({ dockTab: 'report' });
});
afterEach(() => restore());

async function run() {
  const backtest = getBacktestStore();
  await expect.poll(() => backtest.getState().readiness.ok).toBe(true);
  await backtest.getState().actions.run();
  expect(backtest.getState().run.status).toBe('done');
}

test('repeated requests stay distinguishable and Go to line opens the Pine code tab', () => {
  const selection = getSelectionStore();
  const { hoverTrade, focusTrade, revealCodeLine } = selection.getState();
  hoverTrade(3);
  expect(selection.getState().hoveredTrade).toBe(3);
  hoverTrade(null);
  expect(selection.getState().hoveredTrade).toBeNull();
  focusTrade(2);
  const first = selection.getState().focusedTrade!;
  focusTrade(2);
  expect(selection.getState().focusedTrade).toEqual({ trade: 2, seq: first.seq + 1 });
  revealCodeLine(12);
  expect(selection.getState().codeLine).toEqual({ line: 12, seq: first.seq + 2 });
  expect(uiStore.getState().dockTab).toBe('code');
});

test('a new result clears the trade selection but not edits that leave the result in place', async () => {
  openScript({ source: strategySource, fileName: 'test.pine', origin: { kind: 'file' } });
  getMarketDataStore().getState().actions.useCsv(testInput, 'prices.csv');
  await run();
  const selection = getSelectionStore();
  selection.getState().hoverTrade(4);
  selection.getState().focusTrade(4);
  selection.getState().revealCodeLine(3);
  getBacktestStore().getState().actions.setInput('Length', 7);
  expect(selection.getState()).toMatchObject({ hoveredTrade: 4, focusedTrade: { trade: 4 } });
  await run();
  expect(selection.getState()).toMatchObject({
    hoveredTrade: null,
    focusedTrade: null,
    codeLine: { line: 3 },
  });
});

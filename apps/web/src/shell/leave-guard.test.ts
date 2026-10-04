import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { getBacktestStore, openScript } from '../state/backtest.ts';
import { getMarketDataStore } from '../state/marketData.ts';
import { replaceServices } from '../state/services.ts';
import { fakeServices, testInput } from '../state/test-support.ts';
import { strategySource } from '../workflows/test-support.ts';
import { installLeaveGuard } from './leave-guard.ts';

let restore: () => void;
let remove: () => void;
beforeEach(() => {
  restore = replaceServices(() => fakeServices());
  remove = installLeaveGuard();
});
afterEach(() => {
  remove();
  restore();
});

const leave = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

test('leaving asks first while a run is in progress', async () => {
  expect(leave()).toBe(false);
  openScript({ source: strategySource, fileName: 'test.pine', origin: { kind: 'file' } });
  getMarketDataStore().getState().actions.useCsv(testInput, 'prices.csv');
  await waitFor(() => expect(getBacktestStore().getState().readiness.ok).toBe(true));
  expect(leave()).toBe(false);
  void getBacktestStore().getState().actions.run();
  expect(getBacktestStore().getState().run.status).toBe('running');
  expect(leave()).toBe(true);
  await waitFor(() => expect(getBacktestStore().getState().run.status).toBe('done'));
  expect(leave()).toBe(false);
});

test('leaving asks first while the script has edits since it was opened, or was typed in', async () => {
  const { actions } = getBacktestStore().getState();
  // Text typed into the empty editor exists nowhere else.
  actions.setSource(strategySource);
  expect(leave()).toBe(true);
  actions.setSource('');
  expect(leave()).toBe(false);
  // An opened file or example can be opened again, until it is edited.
  openScript({ source: strategySource, fileName: 'test.pine', origin: { kind: 'file' } });
  expect(leave()).toBe(false);
  actions.setSource(`${strategySource}
// mine`);
  expect(leave()).toBe(true);
  actions.setSource(strategySource);
  expect(leave()).toBe(false);
});

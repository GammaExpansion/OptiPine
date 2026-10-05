import { expect, it, vi } from 'vitest';
import type { IChartApi, LogicalRange } from 'lightweight-charts';
import { restorePriceView, savePriceView, type PriceView } from './view-state.ts';

function chart() {
  const time = {
    getVisibleLogicalRange: () => ({ from: 100, to: 180 }) as LogicalRange,
    setVisibleLogicalRange: vi.fn(),
  };
  const panes = [3, 2].map((stretch) => ({
    getStretchFactor: () => stretch,
    setStretchFactor: vi.fn(),
  }));
  const scales = [false, true].map((autoScale) => ({
    options: () => ({ autoScale, mode: 0 }),
    getVisibleRange: () => ({ from: 200, to: 400 }),
    setVisibleRange: vi.fn(),
    applyOptions: vi.fn(),
  }));
  const api = {
    timeScale: () => time,
    panes: () => panes,
    priceScale: (_: string, index: number) => scales[index],
  } as unknown as IChartApi;
  return { api, time, panes, scales };
}

it('restores time, manual price range, autoscaling and pane proportions after replacing plots', () => {
  const before = chart();
  const view: PriceView = {};
  savePriceView(before.api, view);
  const after = chart();
  expect(restorePriceView(after.api, view)).toBe(true);
  expect(after.time.setVisibleLogicalRange).toHaveBeenCalledWith({ from: 100, to: 180 });
  expect(after.scales[0].setVisibleRange).toHaveBeenCalledWith({ from: 200, to: 400 });
  expect(after.scales[0].applyOptions).toHaveBeenCalledWith({ autoScale: false, mode: 0 });
  expect(after.scales[1].applyOptions).toHaveBeenCalledWith({ autoScale: true, mode: 0 });
  expect(after.scales[1].setVisibleRange).not.toHaveBeenCalled();
  expect(after.panes[1].setStretchFactor).toHaveBeenCalledWith(2);
});

it('new data uses defaults; missing plot panes can return without losing their saved size', () => {
  const current = chart();
  expect(restorePriceView(current.api, {})).toBe(false);
  expect(current.time.setVisibleLogicalRange).not.toHaveBeenCalled();
  expect(current.scales[0].applyOptions).toHaveBeenCalledWith({ autoScale: true, mode: 0 });
  expect(current.panes[1].setStretchFactor).toHaveBeenCalledWith(1);
  const view: PriceView = {};
  savePriceView(current.api, view);
  current.panes.pop();
  savePriceView(current.api, view);
  const restored = chart();
  restorePriceView(restored.api, view);
  expect(restored.panes[1].setStretchFactor).toHaveBeenCalledWith(2);
});

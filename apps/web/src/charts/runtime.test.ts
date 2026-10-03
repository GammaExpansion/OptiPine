import { describe, expect, it, vi } from 'vitest';
import type { IChartApi } from 'lightweight-charts';
import { chartOptions, timeFormat, zoomChart } from './runtime.ts';

describe('chart time and navigation', () => {
  it('formats real instants in the symbol timezone across a DST fold', () => {
    const format = timeFormat('America/New_York');
    expect(format.format(Date.parse('2024-11-03T05:30:00Z'))).toContain('01:30');
    expect(format.format(Date.parse('2024-11-03T06:30:00Z'))).toContain('01:30');
    expect(timeFormat('Asia/Shanghai').format(Date.parse('2024-01-01T20:00:00Z'))).toContain(
      '02/01/2024, 04:00',
    );
  });
  it('uses CSS tokens and retains the built-in TradingView attribution link', () => {
    const node = document.createElement('div');
    node.style.setProperty('--canvas', '#0e1013');
    const options = chartOptions(node, 'Etc/UTC');
    expect(options.layout?.attributionLogo).toBe(true);
    expect(options.layout?.background).toMatchObject({ color: '#0e1013' });
  });
  it('zooms symmetrically and safely ignores an empty chart', () => {
    const setVisibleLogicalRange = vi.fn();
    const chart = {
      timeScale: () => ({
        getVisibleLogicalRange: () => ({ from: 20, to: 100 }),
        setVisibleLogicalRange,
      }),
    } as unknown as IChartApi;
    zoomChart(chart, 0.5);
    expect(setVisibleLogicalRange).toHaveBeenCalledWith({ from: 40, to: 80 });
    zoomChart(
      { timeScale: () => ({ getVisibleLogicalRange: () => null }) } as unknown as IChartApi,
      0.5,
    );
  });
});

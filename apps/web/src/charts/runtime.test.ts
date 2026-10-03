import { describe, expect, it, vi } from 'vitest';
import type { IChartApi } from 'lightweight-charts';
import { chartOptions, keepTimeLabelsInside, timeFormat, zoomChart } from './runtime.ts';

describe('chart time and navigation', () => {
  it('omits clipped time ticks and invalidates cached labels after pan and resize', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: () => ({ width: 30 }),
    } as unknown as CanvasRenderingContext2D);
    const scale = {
      timeToCoordinate: (time: number) => time,
      width: () => 100,
      subscribeVisibleLogicalRangeChange: vi.fn(),
      unsubscribeVisibleLogicalRangeChange: vi.fn(),
      subscribeSizeChange: vi.fn(),
      unsubscribeSizeChange: vi.fn(),
    };
    const applyOptions = vi.fn();
    const dispose = keepTimeLabelsInside(
      {
        timeScale: () => scale,
        options: () => ({ layout: { fontSize: 11, fontFamily: 'Barlow' } }),
        applyOptions,
      } as unknown as IChartApi,
      () => '12:00',
    );
    const formatter = applyOptions.mock.calls[0][0].timeScale.tickMarkFormatter;
    expect(formatter(10)).toBe('');
    expect(formatter(20)).toBe('12:00');
    expect(formatter(90)).toBe('');
    scale.subscribeVisibleLogicalRangeChange.mock.calls[0][0]();
    scale.subscribeSizeChange.mock.calls[0][0]();
    expect(applyOptions).toHaveBeenCalledTimes(3);
    dispose();
    expect(scale.unsubscribeVisibleLogicalRangeChange).toHaveBeenCalledWith(
      scale.subscribeVisibleLogicalRangeChange.mock.calls[0][0],
    );
    expect(scale.unsubscribeSizeChange).toHaveBeenCalledWith(
      scale.subscribeSizeChange.mock.calls[0][0],
    );
    vi.restoreAllMocks();
  });
  it('formats real instants in the symbol timezone across a DST fold', () => {
    const format = timeFormat('America/New_York');
    expect(format.format(Date.parse('2024-11-03T05:30:00Z'))).toContain('01:30');
    expect(format.format(Date.parse('2024-11-03T06:30:00Z'))).toContain('01:30');
    expect(timeFormat('Asia/Shanghai').format(Date.parse('2024-01-01T20:00:00Z'))).toContain(
      '2024-01-02 04:00',
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

import type { IChartApi, IRange, LogicalRange, PriceScaleMode } from 'lightweight-charts';

export interface PriceView {
  range?: LogicalRange;
  panes?: {
    stretch: number;
    autoScale: boolean;
    mode: PriceScaleMode;
    range: IRange<number> | null;
  }[];
}

export interface EquityView {
  range?: LogicalRange;
  unit?: 'amount' | 'percent';
}

/** Capture before removing plot series: their removal can delete a pane and its scale. */
export function savePriceView(chart: IChartApi, view: PriceView): void {
  const range = chart.timeScale().getVisibleLogicalRange();
  if (range) view.range = range;
  const panes = view.panes ?? [];
  chart.panes().forEach((pane, index) => {
    const scale = chart.priceScale('right', index);
    const { autoScale, mode } = scale.options();
    panes[index] = {
      stretch: pane.getStretchFactor(),
      autoScale,
      mode,
      range: autoScale ? null : scale.getVisibleRange(),
    };
  });
  view.panes = panes;
}

/** New panes get the normal proportions; surviving panes keep their manual scale and size. */
export function restorePriceView(chart: IChartApi, view: PriceView): boolean {
  chart.panes().forEach((pane, index) => {
    const saved = view.panes?.[index];
    pane.setStretchFactor(saved?.stretch ?? (index === 0 ? 3 : 1));
    const scale = chart.priceScale('right', index);
    scale.applyOptions({ autoScale: saved?.autoScale ?? true, mode: saved?.mode ?? 0 });
    if (saved && !saved.autoScale && saved.range) scale.setVisibleRange(saved.range);
  });
  if (!view.range) return false;
  chart.timeScale().setVisibleLogicalRange(view.range);
  return true;
}

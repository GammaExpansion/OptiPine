import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { Heatmap, HeatmapCell } from '@pine/optimizer';
import type { CurveView } from '../../../workflows/optimize-views.ts';

/** R7/R8 share the lower map-column slot. This transient inspection never changes run settings. */
interface Inspection {
  readonly bin: { readonly map: Heatmap; readonly cell: HeatmapCell } | null;
  readonly curve: { readonly view: CurveView; readonly index: number } | null;
}
const inspection = createStore<Inspection>()(() => ({ bin: null, curve: null }));
export const useBinInspection = () => useStore(inspection, (state) => state.bin);
export const useCurveInspection = () => useStore(inspection, (state) => state.curve);
export const inspectBin = (bin: Inspection['bin']) => inspection.setState({ bin });
export const inspectCurve = (curve: Inspection['curve']) => inspection.setState({ curve });
export const resetInspection = () => inspection.setState({ bin: null, curve: null });

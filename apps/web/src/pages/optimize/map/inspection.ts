import { useEffect } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { Heatmap, HeatmapCell } from '@pine/optimizer';
import type { CurveView } from '../../../workflows/optimize-views.ts';
import type { ResultsViews } from '../../../workflows/optimize-session.ts';

/** R7/R8 share the lower map-column slot. This transient inspection never changes run settings. */
interface Inspection {
  readonly bin: {
    readonly map: Heatmap;
    readonly panel?: Heatmap;
    readonly cell: HeatmapCell;
  } | null;
  readonly curve: {
    readonly runId: number;
    readonly input: string;
    readonly value: CurveView['points'][number]['x'];
    readonly selectionId: string | null;
  } | null;
}
const inspection = createStore<Inspection>()(() => ({ bin: null, curve: null }));
export const useBinInspection = () => useStore(inspection, (state) => state.bin);
/** Keep the parameter value through layout/analysis refreshes, until selection or the run changes. */
export function useCurveInspection(views: ResultsViews | null): number {
  const inspected = useStore(inspection, (state) => state.curve);
  const curve = views?.curve;
  const selectionId = views?.selection?.row.trialId ?? null;
  const index =
    curve &&
    inspected?.runId === views?.runId &&
    inspected?.input === curve.input &&
    inspected?.selectionId === selectionId
      ? curve.points.findIndex((point) => point.x === inspected.value)
      : -1;
  useEffect(() => {
    // Discard invalid inspection so returning to an earlier selection cannot resurrect it.
    if (inspected && index < 0 && inspection.getState().curve === inspected) inspectCurve(null);
  }, [inspected, index]);
  return index >= 0
    ? index
    : Math.max(0, curve?.points.findIndex((point) => point.trialId === selectionId) ?? -1);
}
export const inspectBin = (bin: Inspection['bin']) => inspection.setState({ bin });
export const inspectCurve = (curve: Inspection['curve']) => inspection.setState({ curve });
export const resetInspection = () => inspection.setState({ bin: null, curve: null });

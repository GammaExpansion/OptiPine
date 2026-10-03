import type { Text } from '@pine/messages';
import type { Heatmap } from './analysis.ts';
import type { OptimizerAnalysis } from './optimizer-analysis.ts';
import { consecutiveLossesMetric } from './trade-statistics.ts';
import { constraintValue, scoreMetric, type TrialRecord } from './validation.ts';

export interface OptimizerSummaryRequest {
  /**
   * Metrics to return for every set, IS and OOS, named as `constraintValue` reads them: a report
   * name, an exact metric key, or `consecutiveLossesMetric` (IS only).
   */
  metrics?: readonly string[];
  /**
   * Also return each map at full resolution, which cell hover and bin detail read. The binned
   * maps alone stay small however many values an axis has.
   */
  fullMaps?: boolean;
}

/** One metric's IS and OOS value per set; NaN where a set has none. */
export interface SummaryMetric {
  inSample: Float64Array;
  outOfSample: Float64Array;
}

/** Per-set values, one entry per analysed trial in the order the trials were given. */
export interface OptimizerSummaryColumns {
  /** 1 for a set whose runs completed without a diagnostic. */
  valid: Uint8Array;
  /** The objective on each range as the analysis scored it; NaN where there is none. */
  inSampleValue: Float64Array;
  outOfSampleValue: Float64Array;
  /** The IS objective's mean over the set and its ±1 step neighbours; NaN where there is none. */
  neighborhood: Float64Array;
  metrics: Record<string, SummaryMetric>;
}

/**
 * What screens read from an analysis, without the trials themselves. A set is referred to by its
 * position among the analysed trials, the order its caller gave them in, so a caller that kept its
 * trials reads ids and parameters from its own copy. Columns are typed arrays: they cross a
 * Worker boundary as one block each instead of one object per set.
 */
export interface OptimizerSummary {
  /** Sets analysed. */
  total: number;
  /** Positions of the ranked sets, best first: sets that pass the constraints and have a score. */
  ranked: Int32Array;
  /** Position of the set fixed map slices default to (the selected set, else the best), or -1. */
  selection: number;
  columns: OptimizerSummaryColumns;
  axes: OptimizerAnalysis['axes'];
  defaultAxes: string[];
  /** Each surface's binned map, with its full-resolution map when requested. */
  maps: { surface: string; panelMap: Heatmap; map?: Heatmap }[];
  sensitivity: OptimizerAnalysis['sensitivity'];
  /** Positions in `ranked` the constraint draft would remove. */
  removedConstraintRanks: Int32Array;
  error?: Text;
}

const finiteOrNaN = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : NaN;

/** Reduce an analysis to its summary; the analysis Worker's runs answer with it. */
export function summarizeOptimizerAnalysis(
  analysis: OptimizerAnalysis,
  request: OptimizerSummaryRequest = {},
): OptimizerSummary {
  const { trials } = analysis;
  const position = new Map(trials.map((trial, index) => [trial.trialId, index]));
  const column = (read: (trial: TrialRecord) => number | null | undefined) =>
    Float64Array.from(trials, (trial) => finiteOrNaN(read(trial)));
  const metrics: Record<string, SummaryMetric> = {};
  for (const metric of request.metrics ?? []) {
    const outside = (trial: TrialRecord) => {
      const values = trial.outOfSampleMetrics ?? trial.outOfSample?.metrics;
      return values && metric !== consecutiveLossesMetric ? scoreMetric(values, metric) : null;
    };
    metrics[metric] = {
      inSample: column((trial) => constraintValue(trial, metric)),
      outOfSample: column(outside),
    };
  }
  const selected = analysis.heatmapSelection;
  return {
    total: trials.length,
    ranked: Int32Array.from(analysis.ranked, (trial) => position.get(trial.trialId)!),
    selection: selected ? (position.get(selected.trialId) ?? -1) : -1,
    columns: {
      valid: Uint8Array.from(trials, (trial) => (trial.valid ? 1 : 0)),
      inSampleValue: column((trial) => trial.inSampleValue),
      outOfSampleValue: column((trial) => trial.outOfSampleValue),
      neighborhood: column((trial) => analysis.neighbors[trial.trialId]),
      metrics,
    },
    axes: analysis.axes,
    defaultAxes: analysis.defaultAxes,
    maps: analysis.maps.map(({ surface, map, panelMap }) =>
      request.fullMaps ? { surface, panelMap, map } : { surface, panelMap },
    ),
    sensitivity: analysis.sensitivity,
    removedConstraintRanks: Int32Array.from(analysis.removedConstraintRanks),
    ...(analysis.error ? { error: analysis.error } : {}),
  };
}

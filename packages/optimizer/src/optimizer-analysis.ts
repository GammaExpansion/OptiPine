import { errorText, type Text } from '@pine/messages';
import type { RunResult } from '@pine/engine';
import type { SearchSpace } from './search-space.ts';
import { prepareHeatmap } from './heatmap-display.ts';
import {
  leaderboard,
  viewTrials,
  constraintValue,
  type MetricConstraint,
  type TrialRecord,
} from './validation.ts';
import {
  buildSensitivitySummary,
  defaultHeatmapAxes,
  heatmap,
  meanWindowHeatmap,
  neighborhoodValues,
  type Slice,
  type Heatmap,
} from './analysis.ts';

export interface OptimizerAnalysisInput {
  trials: (TrialRecord & { metrics?: RunResult['metrics'] })[];
  space?: SearchSpace;
  resultSpace?: SearchSpace;
  resultMode?: 'none' | 'in-out' | 'walk-forward';
  mode: 'none' | 'in-out' | 'walk-forward';
  objective: string;
  direction: 'maximize' | 'minimize';
  constraints: MetricConstraint[];
  /**
   * What ranks the sets: `in`, the objective's IS value (the default); `secondary`, the OOS value,
   * or for validation None the neighbourhood mean; `neighborhood`, the mean of the IS objective
   * over each set and its ±1 step neighbours, whatever the validation.
   */
  rankBy?: 'in' | 'secondary' | 'neighborhood';
  axes?: { x?: string; y?: string; z?: string };
  /** Keep the user's explicit axis assignment instead of fitting the longer axis horizontally. */
  preserveAxisOrientation?: boolean;
  slices?: Record<string, Slice>;
  sliceMode?: Slice['mode'];
  neighborhood?: boolean;
  selectedTrialId?: string;
  meanTrialGroups?: TrialRecord[][];
  wfSurface?: 'window' | 'mean';
  constraintDraft?: MetricConstraint;
}
export interface OptimizerAnalysis {
  trials: TrialRecord[];
  ranked: TrialRecord[];
  axes: { x?: string; y?: string; z?: string };
  defaultAxes: string[];
  heatmapSelection?: TrialRecord;
  neighbors: Record<string, number | null>;
  maps: { surface: string; map: Heatmap; panelMap: Heatmap }[];
  sensitivity: ReturnType<typeof buildSensitivitySummary>;
  removedConstraintRanks: number[];
  error?: Text;
}

/** Accepts only analysis dependencies: no camera, UI state, bars, trades or selected RunResult. */
export function optimizerAnalysisInput(state: OptimizerAnalysisInput): OptimizerAnalysisInput {
  const {
    trials,
    space,
    resultSpace,
    resultMode,
    mode,
    objective,
    direction,
    constraints,
    rankBy,
    axes,
    preserveAxisOrientation,
    slices,
    sliceMode,
    neighborhood,
    selectedTrialId,
    meanTrialGroups,
    wfSurface,
    constraintDraft,
  } = state;
  return {
    trials,
    space: resultSpace ? undefined : space,
    resultSpace,
    resultMode,
    mode,
    objective,
    direction,
    constraints,
    rankBy,
    axes,
    preserveAxisOrientation,
    slices,
    sliceMode,
    neighborhood,
    selectedTrialId,
    meanTrialGroups,
    wfSurface,
    constraintDraft,
  };
}

export function deriveOptimizerTrials(state: OptimizerAnalysisInput): TrialRecord[] {
  return viewTrials(
    state.trials.map((trial) => ({
      ...trial,
      inSampleMetrics:
        trial.inSampleMetrics ?? trial.metrics ?? trial.inSample?.metrics ?? trial.result?.metrics,
    })),
    state.objective,
    state.constraints,
  );
}
/** `neighbors` reuses neighbourhood means already computed for `trials`. */
export function rankOptimizerTrials(
  state: OptimizerAnalysisInput,
  trials = deriveOptimizerTrials(state),
  neighbors?: ReadonlyMap<TrialRecord, number | null>,
): TrialRecord[] {
  if (state.rankBy !== 'secondary' && state.rankBy !== 'neighborhood')
    return leaderboard(trials, { direction: state.direction });
  const byNeighborhood =
    state.rankBy === 'neighborhood' || (state.resultMode ?? state.mode) === 'none';
  const values = byNeighborhood
    ? (neighbors ?? neighborhoodValues(trials, (state.resultSpace ?? state.space)?.activeAxes))
    : undefined;
  const original = new Map(trials.map((trial) => [trial.trialId, trial]));
  return leaderboard(
    trials.map((trial) => ({
      ...trial,
      objectiveValue: values ? (values.get(trial) ?? null) : trial.outOfSampleValue,
    })),
    { direction: state.direction },
  ).map((trial) => original.get(trial.trialId)!);
}

/** Pure computation, invoked by the analysis Worker in production. */
export function analyzeOptimizer(state: OptimizerAnalysisInput): OptimizerAnalysis {
  const trials = deriveOptimizerTrials(state),
    active = (state.resultSpace ?? state.space)?.activeAxes ?? [];
  const preferred = defaultHeatmapAxes(trials, active);
  const valid = (key?: string): key is string => !!key && active.some((axis) => axis.title === key);
  let x = valid(state.axes?.x) ? state.axes!.x : preferred[0];
  let y =
    valid(state.axes?.y) && state.axes!.y !== x
      ? state.axes!.y
      : (preferred.find((key) => key !== x) ?? active.find((axis) => axis.title !== x)?.title);
  if (
    !state.preserveAxisOrientation &&
    y &&
    (active.find((axis) => axis.title === y)?.values.length ?? 0) >
      (active.find((axis) => axis.title === x)?.values.length ?? 0)
  )
    [x, y] = [y, x];
  const z =
    valid(state.axes?.z) && state.axes!.z !== x && state.axes!.z !== y ? state.axes!.z : undefined;
  const neighbors = neighborhoodValues(trials, active),
    ranked =
      state.rankBy === 'neighborhood'
        ? rankOptimizerTrials(state, trials, neighbors)
        : state.rankBy !== 'secondary'
          ? leaderboard(trials, { direction: state.direction })
          : rankOptimizerTrials(state, trials);
  const selected = ranked.find((trial) => trial.trialId === state.selectedTrialId) ?? ranked[0];
  const sensitivity = buildSensitivitySummary(
    trials,
    active.map((axis) => axis.title),
    { axes: active, neighborhood: state.neighborhood },
  );
  sensitivity.parameters.sort((a, b) => b.etaSquared - a.etaSquared);
  const draft = state.constraintDraft ?? { metric: 'Total trades', operator: '>=', value: 30 };
  const removedConstraintRanks = ranked.flatMap((trial, index) => {
    const value = constraintValue(trial, draft.metric);
    return value === null || (draft.operator === '>=' ? value < draft.value : value > draft.value)
      ? [index]
      : [];
  });
  const result: OptimizerAnalysis = {
    trials,
    ranked,
    axes: { x, y, z },
    defaultAxes: preferred,
    heatmapSelection: selected,
    neighbors: Object.fromEntries(
      trials.map((trial) => [trial.trialId, neighbors.get(trial) ?? null]),
    ),
    maps: [],
    sensitivity,
    removedConstraintRanks,
  };
  if (!x || !trials.length) return result;
  try {
    const mode = state.resultMode ?? state.mode;
    const surfaces =
      mode === 'walk-forward'
        ? [state.wfSurface ?? 'window']
        : mode === 'none'
          ? ['all']
          : ['in', 'out'];
    result.maps = surfaces.map((surface) => {
      const options = {
        axes: active,
        zKey: z,
        slices: state.slices,
        sliceMode: state.sliceMode,
        parameters: selected?.parameters,
        neighborhood: state.neighborhood,
        value: (trial: TrialRecord) =>
          surface === 'out' ? trial.outOfSampleValue : trial.inSampleValue,
        direction: state.direction,
      };
      const map =
        surface === 'mean'
          ? meanWindowHeatmap(
              (state.meanTrialGroups ?? []).map((group) =>
                viewTrials(group, state.objective, state.constraints),
              ),
              x,
              y,
              options,
            )
          : heatmap(trials, x, y, options);
      if (surface !== 'mean') {
        const remaining = active.filter((axis) => ![x, y, z].includes(axis.title));
        const byCell = new Map<string, string>();
        for (const trial of ranked) {
          const fits = remaining.every((axis) => {
            const slice = state.slices?.[axis.title] ?? { mode: state.sliceMode ?? 'fixed' };
            return (
              (slice.mode !== 'fixed' && !slice.pinned) ||
              JSON.stringify(trial.parameters[axis.title]) ===
                JSON.stringify(slice.value ?? selected?.parameters[axis.title] ?? axis.values[0])
            );
          });
          if (!fits) continue;
          const key = JSON.stringify([
            trial.parameters[x!],
            y ? trial.parameters[y] : undefined,
            z ? trial.parameters[z] : undefined,
          ]);
          if (!byCell.has(key)) byCell.set(key, trial.trialId);
        }
        for (const cell of map.cells)
          if (cell.value !== null)
            cell.trialId = byCell.get(JSON.stringify([cell.x, cell.y, cell.z]));
      }
      return { surface, map: prepareHeatmap(map), panelMap: prepareHeatmap(map, true) };
    });
  } catch (error) {
    result.error = errorText(error);
  }
  return result;
}

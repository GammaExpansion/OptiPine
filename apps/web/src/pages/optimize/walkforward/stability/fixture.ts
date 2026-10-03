import { prepareHeatmap, type AnalysisValue } from '@pine/optimizer';
import type {
  StabilityRow,
  WalkForwardView,
  WindowMapView,
  WindowResult,
} from '../../../../workflows/walk-forward.ts';

const lengthValues = Array.from({ length: 19 }, (_, index) => index + 18);
const multipliers = [1.5, 1.75, 2, 2.25, 2.5, 2.75];
const picks = [
  [24, 2, 'close', false],
  [26, 2, 'close', false],
  [26, 2.25, 'close', false],
  [30, 2.25, 'hl2', false],
  [26, 2, 'close', false],
  [28, 2, 'close', false],
] as const;

/** Deterministic W1/W3 display data, never imported by the production app. */
export function stabilityFixture(tolerance = 0.1): WalkForwardView {
  const windows: WindowResult[] = picks.map((pick, index) => ({
    plan: {
      index,
      inSampleStart: Date.UTC(2023, index * 3, 1) / 1000,
      inSampleEnd: Date.UTC(2024, index * 3, 1) / 1000,
      outOfSampleStart: Date.UTC(2024, index * 3, 1) / 1000,
      outOfSampleEnd: Date.UTC(2024, index * 3 + 3, 1) / 1000,
      inSampleStartIndex: index * 90,
      outOfSampleStartIndex: 365 + index * 90,
      inSampleBars: 365,
      outOfSampleBars: 90,
      partial: false,
      gapBefore: false,
    },
    status: 'done',
    completed: 684,
    trialId: `fixture-${index}`,
    parameters: {
      Length: pick[0],
      Multiplier: pick[1],
      Source: pick[2],
      'Use trailing stop': pick[3],
    },
    inSample: { netProfit: 3000 + index * 500, annualizedReturn: 10, trades: 48 },
    outOfSample: { netProfit: 1000 + index * 100, annualizedReturn: 5.4, trades: 12 },
    wfe: 0.54,
    error: null,
    inSampleEquity: [],
    outOfSampleEquity: [],
  }));
  const rows: StabilityRow[] = [
    {
      title: 'Length',
      values: lengthValues,
      bands: [
        [22, 30],
        [24, 30],
        [24, 30],
        [26, 34],
        [23, 28],
        [26, 32],
      ].map(([from, to], index) => ({
        near: lengthValues.filter(
          (value) =>
            value >= from && value <= to && (tolerance >= 0.1 || value === picks[index][0]),
        ),
        chosen: picks[index][0],
      })),
      common: tolerance >= 0.1 ? [{ from: 26, to: 28 }] : [],
      fixed: 27,
      meanLoss: 0.016,
      allNearOptimal: false,
    },
    {
      title: 'Multiplier',
      values: multipliers,
      bands: picks.map((pick, index) => ({
        near: multipliers.filter((value) => value >= (index < 2 ? 1.75 : 2) && value <= 2.25),
        chosen: pick[1],
      })),
      common: [{ from: 2, to: 2.25 }],
      fixed: 2,
      meanLoss: 0.025,
      allNearOptimal: false,
    },
    {
      title: 'Source',
      values: ['close', 'hl2', 'ohlc4'],
      bands: picks.map((pick) => ({ near: ['close', 'hl2', 'ohlc4'], chosen: pick[2] })),
      common: [{ from: 'close', to: 'ohlc4' }],
      fixed: 'close',
      meanLoss: 0.009,
      allNearOptimal: true,
    },
    {
      title: 'Use trailing stop',
      values: [false, true],
      bands: picks.map((pick) => ({ near: [false, true], chosen: pick[3] })),
      common: [{ from: false, to: true }],
      fixed: false,
      meanLoss: 0,
      allNearOptimal: true,
    },
  ];
  const view: WalkForwardView = {
    inProgress: false,
    pending: false,
    windows,
    totals: {
      windows: 6,
      completed: 6,
      traded: 6,
      profitable: 6,
      flat: 0,
      failed: 0,
      inSampleNet: 25500,
      outOfSampleNet: 7500,
      outOfSampleTrades: 72,
      wfe: 0.54,
    },
    times: [],
    equity: { times: [], values: [] },
    fixed: null,
    stability: { tolerance, pending: false, rows },
    map: null,
    mapError: null,
    selection: { window: windows[2], explicit: true, origin: null },
  };
  return { ...view, map: fixtureMap(view) };
}

/** Distinct canned surfaces exercise rendering and action wiring, not optimizer calculations. */
export function fixtureMap(
  view: WalkForwardView,
  change: Partial<Pick<WindowMapView, 'x' | 'y' | 'z' | 'window' | 'surface' | 'slices'>> = {},
): WindowMapView {
  const previous = view.map;
  const x = change.x ?? previous?.x ?? 'Length';
  const y = change.y === undefined ? (previous?.y ?? 'Multiplier') : change.y;
  const z = change.z === undefined ? (previous?.z ?? null) : change.z;
  const surface = change.surface ?? previous?.surface ?? 'window';
  const window = change.window ?? previous?.window ?? 2;
  const rows = view.stability?.rows ?? [];
  const values = (title: string | null): readonly AnalysisValue[] =>
    rows.find((row) => row.title === title)?.values ?? [0];
  const cells = values(z).flatMap((zValue) =>
    values(x).flatMap((xValue, xi) =>
      values(y).map((yValue, yi) => ({
        x: xValue,
        y: yValue,
        ...(z ? { z: zValue } : {}),
        value: Math.round(
          8900 -
            Math.pow(xi - values(x).length / 2 + (surface === 'mean' ? 0 : window - 2), 2) * 120 -
            Math.pow(yi - 3, 2) * 350,
        ),
        count: surface === 'mean' ? 6 : 1,
      })),
    ),
  );
  const panel = prepareHeatmap(
    {
      xKey: x,
      ...(y ? { yKey: y } : {}),
      ...(z ? { zKey: z } : {}),
      cells,
      ...(z
        ? {
            layers: values(z).map((value) => ({
              z: value,
              cells: cells.filter((cell) => cell.z === value),
            })),
          }
        : {}),
    },
    true,
  );
  return {
    x,
    y,
    z,
    surface,
    window,
    map: panel,
    panel,
    binned: false,
    slices:
      change.slices ??
      rows
        .filter((row) => ![x, y, z].includes(row.title))
        .map((row) => ({
          title: row.title,
          values: row.values,
          mode: 'mean',
          value: null,
          pinned: false,
        })),
    chosen: view.windows
      .filter((window) => window.parameters)
      .map((window) => ({ window: window.plan.index, parameters: window.parameters! })),
  };
}

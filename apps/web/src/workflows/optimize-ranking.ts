import type { Message } from '@pine/messages';
import { consecutiveLossesMetric, type MetricConstraint } from '@pine/optimizer';
import { workflowMessage } from './messages.ts';

/** The ranking objectives of O7, in its groups and order (WEB.md 2.4). */
export const objectiveGroups = [
  {
    group: 'returns',
    objectives: ['netProfit', 'annualizedReturn', 'profitFactor', 'averagePnl'],
  },
  { group: 'risk', objectives: ['maxDrawdown', 'sharpeRatio', 'sortinoRatio'] },
  { group: 'robustness', objectives: ['neighbourhoodMean'] },
] as const;
export type ObjectiveId = (typeof objectiveGroups)[number]['objectives'][number];
export type Direction = 'maximize' | 'minimize';

/** The metrics a filter condition can test (R10). */
export const filterMetricIds = [
  'netProfit',
  'annualizedReturn',
  'profitFactor',
  'averagePnl',
  'maxDrawdown',
  'sharpeRatio',
  'sortinoRatio',
  'trades',
  'winRate',
  'consecutiveLosses',
] as const;
export type FilterMetricId = (typeof filterMetricIds)[number];

/**
 * The report metric behind each id, as @pine/optimizer's `scoreMetric` reads it: a report name
 * for an amount in the account currency, the exact key for a percentage, whose key has no
 * currency in it.
 */
export const reportMetrics: Readonly<Record<FilterMetricId, string>> = {
  netProfit: 'Net profit',
  annualizedReturn: 'Performance/Annualized return (CAGR)/All %',
  profitFactor: 'Profit factor',
  averagePnl: 'Average PnL',
  maxDrawdown: 'Performance/Max drawdown (intrabar)/All %',
  sharpeRatio: 'Sharpe ratio',
  sortinoRatio: 'Sortino ratio',
  trades: 'Total trades',
  winRate: 'Trades analysis/Percent profitable/All %',
  consecutiveLosses: consecutiveLossesMetric,
};

/** The metric the analysis scores; the neighbourhood mean ranks by the mean of net profit. */
export function objectiveMetric(objective: ObjectiveId): string {
  return reportMetrics[objective === 'neighbourhoodMean' ? 'netProfit' : objective];
}

/**
 * Where an objective breaks even, which splits the map's loss and profit colours (R4): zero for
 * amounts, returns and risk-adjusted ratios, one for a profit factor. A drawdown has none.
 */
export function objectiveBreakEven(objective: ObjectiveId): number | undefined {
  if (objective === 'maxDrawdown') return undefined;
  return objective === 'profitFactor' ? 1 : 0;
}

/**
 * How an objective's values read, as R1 writes its figures: amounts whole, ratios and percentages
 * to two decimals, signed where zero is the break-even.
 */
export function objectiveFormat(objective: ObjectiveId): {
  readonly digits: number;
  readonly percent: boolean;
  readonly signed: boolean;
} {
  const amount =
    objective === 'netProfit' || objective === 'averagePnl' || objective === 'neighbourhoodMean';
  return {
    digits: amount ? 0 : 2,
    percent: objective === 'annualizedReturn' || objective === 'maxDrawdown',
    signed: objectiveBreakEven(objective) === 0,
  };
}

/** The direction an objective starts with: less drawdown is better, more of the rest. */
export function naturalDirection(objective: ObjectiveId): Direction {
  return objective === 'maxDrawdown' ? 'minimize' : 'maximize';
}

/** A filter chip such as Trades ≥ 30: sets failing it are not ranked. */
export interface FilterCondition {
  readonly metric: FilterMetricId;
  readonly operator: '>=' | '<=';
  readonly value: number;
}

/** The chips a new optimization starts with (O1). */
export const defaultFilters: readonly FilterCondition[] = [
  { metric: 'trades', operator: '>=', value: 30 },
  { metric: 'maxDrawdown', operator: '<=', value: 15 },
];

/** R10's presets, in order. */
export const filterPresets: readonly FilterCondition[] = [
  { metric: 'profitFactor', operator: '>=', value: 1.2 },
  { metric: 'winRate', operator: '>=', value: 45 },
  { metric: 'sharpeRatio', operator: '>=', value: 1 },
  { metric: 'averagePnl', operator: '>=', value: 0 },
  { metric: 'consecutiveLosses', operator: '<=', value: 6 },
];

export function metricConstraint(filter: FilterCondition): MetricConstraint {
  return { metric: reportMetrics[filter.metric], operator: filter.operator, value: filter.value };
}

/** As @pine/optimizer's `viewTrials` decides: a set without the metric does not pass. */
export function passesFilter(filter: FilterCondition, value: number | null): boolean {
  return (
    value !== null && (filter.operator === '>=' ? value >= filter.value : value <= filter.value)
  );
}

/** Why a condition's value cannot be used, or null when it can. */
export function filterValueError(value: number): Message | null {
  return Number.isFinite(value) ? null : workflowMessage('optimize.filterValueInvalid');
}

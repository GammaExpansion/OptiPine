import { message, type Message, type MessageValues } from '@pine/messages';

/**
 * Every app message id the workflows emit, dotted by area. The catalogs must cover this list
 * in both languages, as they cover the packages' id lists.
 */
export const workflowMessageIds = [
  'backtest.noScript',
  'backtest.noData',
  'backtest.compiling',
  'backtest.compileFailed',
  'backtest.running',
  'backtest.inputInvalid',
  'backtest.propertyInvalid',
  'backtest.inputNumberRequired',
  'backtest.inputIntegerRequired',
  'backtest.inputBelowMin',
  'backtest.inputAboveMax',
  'backtest.inputBooleanRequired',
  'backtest.inputTextRequired',
  'backtest.inputNotOption',
  'backtest.inputSessionInvalid',
  'backtest.inputTimeframeInvalid',
  'backtest.inputFixedComputedDefault',
  'backtest.inputFixedComputedTitle',
  'backtest.inputFixedUnsupportedType',
  'backtest.inputFixedComputedOptions',
  'backtest.inputFixedDuplicateTitle',
  'backtest.propertyPositive',
  'backtest.propertyNonNegative',
  'backtest.propertyWholeNumber',
  'backtest.propertyNotOption',
  'backtest.property.initialCapital',
  'backtest.property.orderSize',
  'backtest.property.orderSizeUnit',
  'backtest.property.pyramiding',
  'backtest.property.scriptExecution',
  'backtest.property.commission',
  'backtest.property.commissionUnit',
  'backtest.property.longLeverage',
  'backtest.property.shortLeverage',
  'backtest.property.slippage',
  'backtest.property.limitFillTicks',
  'backtest.property.orderDelay',
  'marketData.dateInvalid',
  'marketData.rangeEmpty',
  'optimize.inputNotSearchable',
  'optimize.gridSwitchedToRandom',
  'optimize.sampleCountPositive',
  'optimize.filterValueInvalid',
  'optimize.fixErrors',
  'optimize.running',
  'optimize.wf.planning',
  'optimize.wf.noWindows',
  'optimize.wf.flat',
  'optimize.wf.inSampleMismatch',
] as const;
export type WorkflowMessageId = (typeof workflowMessageIds)[number];

export function workflowMessage(
  id: WorkflowMessageId,
  values: MessageValues = {},
): Message<WorkflowMessageId> {
  return message(id, values);
}

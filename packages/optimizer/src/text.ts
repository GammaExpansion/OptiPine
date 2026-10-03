import {
  codedError,
  isCodedError,
  message,
  type Coded,
  type Message,
  type MessageValues,
} from '@pine/messages';

/** Every message id this package emits. A UI that translates them should cover this list. */
export const optimizerMessageIds = [
  'searchIntegerRequired',
  'searchNumberRequired',
  'searchMin',
  'searchMax',
  'searchBooleanRequired',
  'searchValueInvalid',
  'searchValueFinite',
  'searchValueNotOption',
  'searchRangeFinite',
  'searchRangeReversed',
  'searchIntegerStep',
  'searchValueCountLimit',
  'searchStepPrecision',
  'searchAxisLimitPositive',
  'searchValueRequired',
  'searchAxisValueLimit',
  'searchUniqueTitles',
  'searchUnsafeCombinationCount',
  'searchGridLimitPositive',
  'searchGridLimit',
  'searchRandomIntegers',
  'splitRatioRange',
  'splitNeedsBars',
  'inSampleMonthCount',
  'outSampleMonthCount',
  'stepMonthCount',
  'monthCountRange',
  'stepOverlappingWindows',
  'windowModeInvalid',
  'stabilityToleranceRange',
  'walkForwardTimesInvalid',
  'windowMissingBars',
  'outSampleWindowsOverlap',
  'noValidWindowTrial',
  'heatmapAxesDistinct',
  'heatmapCellLimit',
  'stabilityToleranceFinite',
] as const;
export type OptimizerMessageId = (typeof optimizerMessageIds)[number];
export type OptimizerMessage = Message<OptimizerMessageId>;
/** An error raised by this package: `code` and `values` identify it; `uiText` carries both as a message. */
export type OptimizerError = Error & Coded<OptimizerMessageId>;

export function optimizerMessage(
  id: OptimizerMessageId,
  values: MessageValues = {},
): OptimizerMessage {
  return message(id, values);
}

export function optimizerError(
  code: OptimizerMessageId,
  values: MessageValues = {},
  ErrorType: new (message: string) => Error = Error,
): OptimizerError {
  return codedError(code, values, ErrorType);
}

export function isOptimizerError(
  error: unknown,
  code?: OptimizerMessageId,
): error is OptimizerError {
  return isCodedError(error, optimizerMessageIds, code);
}

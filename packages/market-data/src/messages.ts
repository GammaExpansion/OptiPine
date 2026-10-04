import {
  codedError,
  isCodedError,
  message,
  type Coded,
  type Message,
  type MessageValues,
} from '@pine/messages';

/** Every message id this package emits. A UI that translates them should cover this list. */
export const marketDataMessageIds = [
  'calendarPeriod',
  'calendarPeriodBounds',
  'calendarPeriodOutside',
  'calendarPeriodOverlap',
  'calendarPeriods',
  'calendarPeriodsStructure',
  'calendarSession',
  'calendarSessionBounds',
  'calendarSessionOutside',
  'calendarSessionOverlap',
  'calendarStructure',
  'calendarTradingDayInvalid',
  'calendarTradingDayMissing',
  'csvAfterQuote',
  'csvAscendingTime',
  'csvColumnCount',
  'csvFiniteColumn',
  'csvLineError',
  'csvMissingData',
  'csvOhlc',
  'csvUnclosedQuote',
  'csvUnixSeconds',
  'csvVolume',
  'feedCalendarMissing',
  'feedHttpError',
  'feedInvalidRequest',
  'feedInvalidResponse',
  'feedNetworkError',
  'feedNoBars',
  'feedProxyMissing',
  'feedRateLimited',
  'feedRegionBlocked',
  'feedSymbolMissing',
  'feedTooManyBars',
  'feedUpstreamDetail',
  'feedYahooInstrument',
  'feedYahooOhlc',
  'feedYahooRange',
  'importCalendar',
  'importNotReady',
  'importProfile',
  'jsonObjectRequired',
  'profileBoolean',
  'profilePositive',
  'profileTimeframe',
  'profileTimezoneInvalid',
  'profileTimezoneName',
] as const;
export type MarketDataMessageId = (typeof marketDataMessageIds)[number];
export type MarketDataMessage = Message<MarketDataMessageId>;
/** A provider, request or file validation failure: `code` and `values` identify it. */
export type MarketDataError = Error & Coded<MarketDataMessageId>;

export function marketDataMessage(
  id: MarketDataMessageId,
  values: MessageValues = {},
): MarketDataMessage {
  return message(id, values);
}

export function marketDataError(
  code: MarketDataMessageId,
  values: MessageValues = {},
): MarketDataError {
  return codedError(code, values);
}

export function isMarketDataError(error: unknown): error is MarketDataError {
  return isCodedError(error, marketDataMessageIds);
}

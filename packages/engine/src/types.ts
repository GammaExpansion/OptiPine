/** Public engine contracts contain only source, market inputs, and computed results. */
export interface Diagnostic {
  /** `runtime` is an error the script's own execution raised; `internal` is a fault inside
   * the engine itself (a JavaScript TypeError or RangeError) and should be reported as a bug. */
  kind:
    | 'syntax'
    | 'undeclared'
    | 'type'
    | 'semantic'
    | 'unsupported'
    | 'limit'
    | 'runtime'
    | 'internal';
  line: number;
  column?: number;
  message: string;
}

/** A deliberately omitted side effect; calculation still completed normally. */
export interface RunWarning {
  code: 'ignored-effect';
  line: number;
  function: string;
  message: string;
}

export interface MarketBar {
  /** Unix seconds; Pine time builtins expose milliseconds at the language boundary. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradingSession {
  /** Unix seconds: inclusive opening and exclusive closing instant. */
  open: number;
  close: number;
  /** Exchange-assigned trading date, YYYY-MM-DD; may differ from the opening date. */
  tradingDay: string;
}

export interface SessionCalendar {
  /** Unix seconds, [from, to). A gap inside coverage is a known nontrading interval. */
  from: number;
  to: number;
  /** Sorted, nonoverlapping sessions from an independent market-calendar source. */
  sessions: readonly TradingSession[];
  /** Independent higher-timeframe intervals, keyed by canonical Pine timeframe (e.g. 1W). */
  periods?: Readonly<Record<string, readonly CalendarPeriod[]>>;
}

export interface CalendarPeriod {
  /** Lookup coverage in Unix seconds, [from, to), including gaps between sessions. */
  from: number;
  to: number;
  /** Provider-assigned opening/closing timestamps in Unix seconds. */
  open: number;
  close: number;
}

/** Symbol metadata after defaults and validation. Extra keys stay readable through `syminfo.*`. */
export interface SymbolInfo {
  /** Smallest price increment; fills and `math.round_to_mintick` use this grid. Default 0.01. */
  mintick: number;
  /** Currency value of a one-point move in one contract. Default 1. */
  pointvalue: number;
  /** Smallest order quantity. Default 1. */
  mincontract: number;
  /** IANA time zone for time builtins and report dates. Default Etc/UTC. */
  timezone: string;
  /** Regular session as HHMM-HHMM; one range. Default 0000-0000, the whole day. */
  session_hours: string;
  /** Quote currency reported by `syminfo.currency`. Default USD. */
  currency: string;
  [key: string]: unknown;
}

/** Strategy settings the broker reads; `strategy()` declaration arguments supply the rest. */
export interface StrategySettings {
  initial_capital?: number;
  default_qty_type?: string;
  default_qty_value?: number;
  pyramiding?: number;
  commission_type?: string;
  commission_value?: number;
  slippage?: number;
  margin_long?: number;
  margin_short?: number;
  process_orders_on_close?: boolean;
  calc_on_order_fills?: boolean;
  close_entries_rule?: string;
  fill_delay?: string;
  currency?: string;
  risk_free_rate?: number;
  backtest_fill_limits_assumption?: number;
  [key: string]: unknown;
}

export interface RunInput {
  bars: readonly MarketBar[];
  /** Missing keys take the defaults documented on SymbolInfo; present keys are validated. */
  syminfo: Partial<SymbolInfo>;
  timeframe: string;
  /** Overrides keyed by input title, matched as own properties only. */
  inputs?: Record<string, unknown>;
  settings?: StrategySettings;
  realtimeTail?: boolean;
  /** Opt-in historical OHLC scheduling. Execute after
   * each of the broker's four synthetic price points. Historical OHLC values
   * remain available, as with historical fill recalculation; this is not a
   * reconstruction of realtime ticks. Default scheduling is unchanged. */
  historicalTicks?: boolean;
  /** The final market bar has not had its regular strategy close calculation.
   * Market prices and pending fills remain available; this does not specify bar states.
   * Omission preserves the realtimeTail-based strategy schedule.
   */
  strategyClosePending?: boolean;
  sessionCalendar?: SessionCalendar;
}

export interface Trade {
  direction: 'long' | 'short';
  entryId: string;
  exitId: string | null;
  entryComment: string;
  exitComment: string | null;
  quantity: number;
  entryBar: number;
  exitBar: number | null;
  entryTime: number;
  exitTime: number | null;
  entryPrice: number;
  exitPrice: number | null;
  entryCommission: number;
  commission: number;
  /** Economic profit after fees already paid; excludes any display-only fee projection. */
  profit: number;
  /** Commission used by native open-trade display at the current mark. */
  displayCommission?: number;
  /** Account realized profit immediately after this close, or at the current open snapshot. */
  realizedProfit?: number;
  maxRunup: number;
  maxDrawdown: number;
}

export interface PlotOutput {
  title: string;
  values: (number | string | boolean | null)[];
  /** Drawn over the price chart: the script declares `overlay = true`, or the plot call sets
   * `force_overlay = true`. Engine results always set it; otherwise the plot has its own pane. */
  overlay?: boolean;
}

export interface RunResult {
  plots: PlotOutput[];
  trades: Trade[];
  metrics: Record<string, number | string | null>;
  diagnostics: Diagnostic[];
  /** Nonfatal omissions, separate from errors that invalidate a run. */
  warnings?: RunWarning[];
}

/** Opt-in account history, sampled after each bar's fills and margin checks. */
export interface EquityRunResult extends RunResult {
  /** One value per input bar, aligned by index. Empty for indicators or failed runs. */
  equity: number[];
}

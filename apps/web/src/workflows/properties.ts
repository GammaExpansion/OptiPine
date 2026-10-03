import type { LiteralValue, ScriptDescription, StrategySettings } from '@pine/engine';
import type { Message } from '@pine/messages';
import { workflowMessage } from './messages.ts';

export type OrderSizeUnit = 'percent_of_equity' | 'cash' | 'fixed';
export type CommissionUnit = 'percent' | 'cash_per_contract' | 'cash_per_order';
/** When the script recalculates: TradingView's single "Script execution" choice. */
export type ScriptExecution = 'barClose' | 'orderFills' | 'everyTick';
/** `none` fills market orders at the close of the bar that placed them. */
export type OrderDelay = 'oneTick' | 'none';

/** The strategy properties the B13 dialog edits, shared by the Backtest and Optimize pages. */
export interface PropertyValues {
  initialCapital: number;
  orderSize: number;
  orderSizeUnit: OrderSizeUnit;
  pyramiding: number;
  scriptExecution: ScriptExecution;
  commission: number;
  commissionUnit: CommissionUnit;
  /** 100 / margin percent; Infinity is a margin of 0, which never calls margin. */
  longLeverage: number;
  shortLeverage: number;
  /** Ticks added against every market and stop fill. */
  slippage: number;
  /** Ticks the price must trade through a limit before it fills; 0 fills on touch. */
  limitFillTicks: number;
  orderDelay: OrderDelay;
}
export type PropertyId = keyof PropertyValues;
export type PropertyOverrides = Partial<PropertyValues>;

/** Dialog order: General, then Detalization and execution, then Broker emulator. */
export const propertyIds = [
  'initialCapital',
  'orderSize',
  'orderSizeUnit',
  'pyramiding',
  'scriptExecution',
  'commission',
  'commissionUnit',
  'longLeverage',
  'shortLeverage',
  'slippage',
  'limitFillTicks',
  'orderDelay',
] as const satisfies readonly PropertyId[];

export const propertyOptions = {
  orderSizeUnit: ['percent_of_equity', 'cash', 'fixed'],
  scriptExecution: ['barClose', 'orderFills', 'everyTick'],
  commissionUnit: ['percent', 'cash_per_contract', 'cash_per_order'],
  orderDelay: ['oneTick', 'none'],
} as const satisfies { [K in PropertyId]?: readonly PropertyValues[K][] };

/**
 * The script's value of a property: a literal from `strategy()` (or the engine's default when the
 * call omits it), or an expression the engine evaluates during the run.
 */
export type ScriptProperty<K extends PropertyId = PropertyId> =
  { kind: 'value'; value: PropertyValues[K] } | { kind: 'expression'; line: number };
export type ScriptProperties = { [K in PropertyId]: ScriptProperty<K> };

export interface PropertyField<K extends PropertyId = PropertyId> {
  id: K;
  /** Undefined when the script computes the value and the user has not overridden it. */
  value: PropertyValues[K] | undefined;
  script: ScriptProperty<K>;
  overridden: boolean;
  error: Message | null;
}

const shortName = (value: LiteralValue): string => String(value).split('.').at(-1) ?? '';
const leverage = (margin: number): number => (margin > 0 ? 100 / margin : Infinity);

/** Read the `strategy()` defaults from a successful compile; omitted settings take the engine's. */
export function scriptProperties(description: ScriptDescription): ScriptProperties {
  const settings = description.settings;
  const computed = description.computedSettings ?? {};
  const margin = description.version === 6 ? 100 : 0;
  function read<K extends PropertyId>(
    names: readonly string[],
    convert: (values: (LiteralValue | undefined)[]) => PropertyValues[K],
  ): ScriptProperty<K> {
    const expression = names.find((name) => computed[name] !== undefined);
    if (expression) return { kind: 'expression', line: computed[expression] };
    return { kind: 'value', value: convert(names.map((name) => settings[name])) };
  }
  const number = (fallback: number) => (values: (LiteralValue | undefined)[]) =>
    typeof values[0] === 'number' ? values[0] : fallback;
  const choice =
    <T extends string>(options: readonly T[], fallback: T) =>
    (values: (LiteralValue | undefined)[]) =>
      options.find((option) => values[0] !== undefined && option === shortName(values[0])) ??
      fallback;
  return {
    initialCapital: read(['initial_capital'], number(1_000_000)),
    orderSize: read(['default_qty_value'], number(1)),
    orderSizeUnit: read(['default_qty_type'], choice(propertyOptions.orderSizeUnit, 'fixed')),
    pyramiding: read(['pyramiding'], number(0)),
    // A script may declare both; order fills wins, as the one that changes historical results.
    scriptExecution: read(['calc_on_order_fills', 'calc_on_every_tick'], ([fills, tick]) =>
      fills === true ? 'orderFills' : tick === true ? 'everyTick' : 'barClose',
    ),
    commission: read(['commission_value'], number(0)),
    commissionUnit: read(['commission_type'], choice(propertyOptions.commissionUnit, 'percent')),
    longLeverage: read(['margin_long'], (values) => leverage(number(margin)(values))),
    shortLeverage: read(['margin_short'], (values) => leverage(number(margin)(values))),
    slippage: read(['slippage'], number(0)),
    limitFillTicks: read(['backtest_fill_limits_assumption'], number(0)),
    orderDelay: read(['process_orders_on_close'], ([onClose]) =>
      onClose === true ? 'none' : 'oneTick',
    ),
  };
}

/** The reason a run cannot use `value` for this property, or null when it can. */
export function validateProperty<K extends PropertyId>(
  id: K,
  value: PropertyValues[K],
): Message | null {
  switch (id) {
    case 'initialCapital':
    case 'orderSize':
      return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? null
        : workflowMessage('backtest.propertyPositive');
    case 'longLeverage':
    case 'shortLeverage':
      // Infinity stands for a margin of 0.
      return typeof value === 'number' && value > 0
        ? null
        : workflowMessage('backtest.propertyPositive');
    case 'commission':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? null
        : workflowMessage('backtest.propertyNonNegative');
    case 'pyramiding':
    case 'slippage':
    case 'limitFillTicks':
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? null
        : workflowMessage('backtest.propertyWholeNumber');
    default: {
      const options: readonly unknown[] = propertyOptions[id as keyof typeof propertyOptions];
      return options.includes(value) ? null : workflowMessage('backtest.propertyNotOption');
    }
  }
}

/**
 * Record an edit. A value equal to the script's literal is not an override, so the dialog's
 * "N overridden" counts only real differences.
 */
export function setPropertyOverride<K extends PropertyId>(
  script: ScriptProperties,
  overrides: PropertyOverrides,
  id: K,
  value: PropertyValues[K],
): PropertyOverrides {
  const next: PropertyOverrides = { ...overrides };
  const scriptValue = script[id];
  if (scriptValue.kind === 'value' && scriptValue.value === value) delete next[id];
  else next[id] = value;
  return next;
}

/** Keep overrides across a recompile, dropping those the new `strategy()` call now matches. */
export function keepPropertyOverrides(
  script: ScriptProperties,
  overrides: PropertyOverrides,
): PropertyOverrides {
  let next: PropertyOverrides = {};
  for (const id of propertyIds)
    if (overrides[id] !== undefined)
      next = setPropertyOverride(script, next, id, overrides[id] as PropertyValues[typeof id]);
  return next;
}

export function propertyFields(
  script: ScriptProperties,
  overrides: PropertyOverrides,
): PropertyField[] {
  return propertyIds.map(<K extends PropertyId>(id: K): PropertyField<K> => {
    const override = overrides[id] as PropertyValues[K] | undefined;
    const scriptValue = script[id] as ScriptProperty<K>;
    const value =
      override !== undefined
        ? override
        : scriptValue.kind === 'value'
          ? scriptValue.value
          : undefined;
    return {
      id,
      value,
      script: scriptValue,
      overridden: override !== undefined,
      error: override !== undefined ? validateProperty(id, override) : null,
    };
  });
}

/**
 * Engine settings for the overridden properties only: the engine applies the script's own
 * `strategy()` arguments, literal or computed, for everything else.
 */
export function propertySettings(overrides: PropertyOverrides): StrategySettings {
  const settings: StrategySettings = {};
  const margin = (value: number) => (value === Infinity ? 0 : 100 / value);
  if (overrides.initialCapital !== undefined) settings.initial_capital = overrides.initialCapital;
  if (overrides.orderSize !== undefined) settings.default_qty_value = overrides.orderSize;
  if (overrides.orderSizeUnit !== undefined) settings.default_qty_type = overrides.orderSizeUnit;
  if (overrides.pyramiding !== undefined) settings.pyramiding = overrides.pyramiding;
  if (overrides.scriptExecution !== undefined) {
    settings.calc_on_order_fills = overrides.scriptExecution === 'orderFills';
    settings.calc_on_every_tick = overrides.scriptExecution === 'everyTick';
  }
  if (overrides.commission !== undefined) settings.commission_value = overrides.commission;
  if (overrides.commissionUnit !== undefined) settings.commission_type = overrides.commissionUnit;
  if (overrides.longLeverage !== undefined) settings.margin_long = margin(overrides.longLeverage);
  if (overrides.shortLeverage !== undefined)
    settings.margin_short = margin(overrides.shortLeverage);
  if (overrides.slippage !== undefined) settings.slippage = overrides.slippage;
  if (overrides.limitFillTicks !== undefined)
    settings.backtest_fill_limits_assumption = overrides.limitFillTicks;
  if (overrides.orderDelay !== undefined)
    settings.process_orders_on_close = overrides.orderDelay === 'none';
  return settings;
}

/** The label of a property, for messages that name one. */
export function propertyLabel(id: PropertyId): Message {
  return workflowMessage(`backtest.property.${id}`);
}

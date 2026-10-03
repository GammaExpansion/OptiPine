import { SYMBOL_DEFAULTS } from '../runtime/symbol-info.ts';
import type { MarketBar, RunInput, Trade } from '../types.ts';
import { compareOrderEvents, nextOrderEvent } from './orders.ts';
import type { Lot, Order, OrderEvent, Side } from './orders.ts';
import { activateTrailing, advanceTrailing, observedPrice } from './trailing.ts';
import { calculateMetrics } from './metrics.ts';
import { reportedTradeProfit } from './trade-profit.ts';
import { AccountExcursions } from './account-excursions.ts';
import { Calendar } from '../calendar.ts';
import { RiskLimits } from './risk.ts';
import type { RiskHalt } from './risk.ts';

type FillCallback = (snapshot: MarketBar) => void;

const finite = (value: unknown): number | undefined =>
  value !== null && value !== undefined && Number.isFinite(Number(value))
    ? Number(value)
    : undefined;
const sideOf = (value: unknown): Side => (value === -1 || String(value).endsWith('short') ? -1 : 1);
const shortName = (value: unknown): string => String(value).split('.').at(-1) ?? '';

/** Historical OHLC broker. All state belongs to one independent execution. */
export class Broker {
  readonly input: RunInput;
  readonly version: number;
  settings: Record<string, unknown>;
  private configured = false;
  private lots: Lot[] = [];
  private orders: Order[] = [];
  private exits: Order[] = [];
  private filledExits = new Set<string>();
  private closed: Trade[] = [];
  private bar: MarketBar = { time: 0, open: 0, high: 0, low: 0, close: 0, volume: 0 };
  private index = -1;
  private tick = 0;
  private readonly tickCalculationOrders = new WeakSet<Order>();
  private mark = 0;
  private sequence = 0;
  private nextLot = 0;
  private realized = 0;
  private accountExcursions?: AccountExcursions;
  private equityHistory: number[] = [];
  private marginHistory: number[] = [];
  private maxMarginUsed = 0;
  private maxContractsHeld = { all: 0, long: 0, short: 0 };
  private liquidations: { direction: Trade['direction']; quantity: number; price: number }[] = [];
  private maxPosition = Infinity;
  private allowed: Side | 0 = 0;
  private maxDailyFills = Infinity;
  private dailyFills = 0;
  private tradingDay: string | null | undefined;
  private dailyHalt = false;
  private forcedCloseAfterTick: number | undefined;
  private forcedCloseReason = 'Close Position (Max number of filled orders in one day)';
  private committedRiskFills: Order[] = [];
  private risk?: RiskLimits;
  private dateFormatter: Intl.DateTimeFormat;
  private readonly calendar: Calendar;

  constructor(input: RunInput, version: number) {
    this.input = input;
    this.version = version;
    this.calendar = new Calendar(input.sessionCalendar);
    this.settings = {
      initial_capital: 1_000_000,
      default_qty_type: 'fixed',
      default_qty_value: 1,
      pyramiding: 0,
      commission_type: 'percent',
      commission_value: 0,
      slippage: 0,
      margin_long: version === 6 ? 100 : 0,
      margin_short: version === 6 ? 100 : 0,
      close_entries_rule: 'FIFO',
      ...input.settings,
    };
    this.dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: String(input.syminfo.timezone ?? SYMBOL_DEFAULTS.timezone),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  configure(declaration: Record<string, unknown>): void {
    if (this.configured) return;
    this.settings = { ...this.settings, ...declaration, ...this.input.settings };
    const verifyTicks = Number(this.settings.backtest_fill_limits_assumption ?? 0);
    if (!Number.isInteger(verifyTicks) || verifyTicks < 0)
      throw Object.assign(
        new Error('backtest_fill_limits_assumption must be a nonnegative integer'),
        { kind: 'runtime' },
      );
    this.configured = true;
    this.accountExcursions = new AccountExcursions(this.initialCapital);
  }

  private get tickSize(): number {
    return finite(this.input.syminfo.mintick) ?? SYMBOL_DEFAULTS.mintick;
  }
  private get pointValue(): number {
    return finite(this.input.syminfo.pointvalue) ?? SYMBOL_DEFAULTS.pointvalue;
  }
  private get minQuantity(): number {
    return finite(this.input.syminfo.mincontract) ?? SYMBOL_DEFAULTS.mincontract;
  }
  private get initialCapital(): number {
    return Number(this.settings.initial_capital);
  }
  private get position(): number {
    return this.lots.reduce((sum, lot) => sum + lot.quantity * lot.side, 0);
  }
  private get average(): number {
    const qty = this.lots.reduce((sum, lot) => sum + lot.quantity, 0);
    return qty ? this.lots.reduce((sum, lot) => sum + lot.quantity * lot.price, 0) / qty : NaN;
  }
  private get openProfit(): number {
    return this.lots.reduce(
      (sum, lot) => sum + (this.mark - lot.price) * lot.quantity * lot.side * this.pointValue,
      0,
    );
  }
  private get equity(): number {
    return this.initialCapital + this.realized + this.openProfit;
  }
  private roundPrice(price: number, direction: Side | 0 = 0, tickOffset = 0): number {
    const scaled = price / this.tickSize;
    const ticks =
      direction > 0
        ? Math.ceil(scaled - 1e-10)
        : direction < 0
          ? Math.floor(scaled + 1e-10)
          : Math.floor(scaled + 0.5);
    return (ticks + tickOffset) * this.tickSize;
  }
  private roundQuantity(quantity: number): number {
    return Math.floor((quantity + this.minQuantity * 1e-9) / this.minQuantity) * this.minQuantity;
  }

  get(name: string): unknown {
    const key = name.replace(/^strategy\./, '');
    switch (key) {
      case 'position_size':
        return this.position;
      case 'position_avg_price':
        return this.average;
      case 'equity':
        return this.equity;
      case 'openprofit':
        return this.openProfit;
      case 'netprofit':
        return this.realized;
      case 'initial_capital':
        return this.initialCapital;
      case 'closedtrades':
        return this.closed.length;
      case 'opentrades':
        return this.lots.length;
      case 'grossprofit':
        return this.closed.filter((t) => t.profit >= 0).reduce((s, t) => s + t.profit, 0);
      case 'grossloss':
        return -this.closed.filter((t) => t.profit < 0).reduce((s, t) => s + t.profit, 0);
      case 'wintrades':
        return this.closed.filter((t) => t.profit > 0).length;
      case 'losstrades':
        return this.closed.filter((t) => t.profit < 0).length;
      case 'eventrades':
        return this.closed.filter((t) => t.profit === 0).length;
      case 'margin_liquidation_price':
        return this.liquidationPrice();
      case 'long':
        return 1;
      case 'short':
        return -1;
      case 'fixed':
      case 'cash':
      case 'percent_of_equity':
        return key;
      default:
        if (/^(commission|direction|oca)\./.test(key)) return key;
        throw Object.assign(new Error(`Unsupported strategy variable: ${name}`), {
          kind: 'unsupported',
        });
    }
  }

  call(name: string, args: unknown[], named: Record<string, unknown> = {}): unknown {
    const key = name.replace(/^strategy\./, '');
    const signatures: Record<string, string[]> = {
      entry: ['id', 'direction', 'qty', 'limit', 'stop', 'oca_name', 'oca_type', 'comment', 'when'],
      order: ['id', 'direction', 'qty', 'limit', 'stop', 'oca_name', 'oca_type', 'comment', 'when'],
      exit: [
        'id',
        'from_entry',
        'qty',
        'qty_percent',
        'profit',
        'limit',
        'loss',
        'stop',
        'trail_price',
        'trail_points',
        'trail_offset',
        'oca_name',
        'comment',
        'when',
      ],
      close: [
        'id',
        'comment',
        'qty',
        'qty_percent',
        'alert_message',
        'immediately',
        'disable_alert',
      ],
      close_all: ['comment', 'alert_message', 'immediately', 'disable_alert'],
    };
    const p: Record<string, unknown> = {};
    for (let i = 0; i < args.length; i++) p[signatures[key]?.[i] ?? String(i)] = args[i];
    Object.assign(p, named);
    if (p.when === false) return null;
    if (key === 'default_entry_qty')
      return this.defaultQuantity(Number(args[0] ?? named.fill_price));
    if (key === 'risk.max_position_size') {
      this.maxPosition = Number(args[0] ?? named.contracts);
      return null;
    }
    if (key === 'risk.allow_entry_in') {
      const value = args[0] ?? named.value;
      this.allowed = shortName(value) === 'all' ? 0 : sideOf(value);
      return null;
    }
    if (key === 'risk.max_intraday_filled_orders') {
      this.maxDailyFills = Number(args[0] ?? named.count);
      return null;
    }
    if (key === 'risk.max_drawdown' || key === 'risk.max_intraday_loss') {
      this.riskLimits().setLoss(
        key === 'risk.max_drawdown' ? 'drawdown' : 'intraday',
        args[0] ?? named.value,
        args[1] ?? named.type,
      );
      return null;
    }
    if (key === 'risk.max_cons_loss_days') {
      this.riskLimits().setLosingDays(args[0] ?? named.count);
      return null;
    }
    if (key === 'cancel_all') {
      this.orders = [];
      this.exits = [];
      return null;
    }
    if (key === 'cancel') {
      const id = String(args[0] ?? named.id);
      this.orders = this.orders.filter((order) => order.id !== id);
      this.exits = this.exits.filter((order) => order.id !== id);
      return null;
    }
    if (/^(closedtrades|opentrades)\./.test(key)) {
      const [kind, field] = key.split('.');
      const index = Number(args[0] ?? named.trade_num);
      const trade = kind === 'closedtrades' ? this.closed[index] : this.openTrades()[index];
      if (!trade)
        return kind === 'opentrades' && index === 0 && ['profit', 'commission'].includes(field)
          ? 0
          : NaN;
      const fields: Record<string, unknown> = {
        commission: trade.commission,
        profit: reportedTradeProfit(trade),
        size: trade.quantity * (trade.direction === 'long' ? 1 : -1),
        entry_price: trade.entryPrice,
        exit_price: trade.exitPrice,
        entry_time: trade.entryTime * 1000,
        exit_time: trade.exitTime === null ? NaN : trade.exitTime * 1000,
        entry_bar_index: trade.entryBar,
        exit_bar_index: trade.exitBar,
        entry_id: trade.entryId,
        exit_id: trade.exitId,
        entry_comment: trade.entryComment,
        exit_comment: trade.exitComment,
        max_runup: trade.maxRunup,
        max_drawdown: trade.maxDrawdown,
        profit_percent:
          (trade.profit / (trade.entryPrice * trade.quantity * this.pointValue)) * 100,
      };
      if (field! in fields) return fields[field!];
    }
    if (!['entry', 'order', 'exit', 'close', 'close_all'].includes(key)) {
      throw Object.assign(new Error(`Unsupported strategy function: ${name}`), {
        kind: 'unsupported',
      });
    }
    if (this.dailyHalt || this.risk?.halted) return null;
    const id = String(p.id ?? 'Close position order');
    const isClose = key === 'close' || key === 'close_all';
    const matchingLots = key === 'close' ? this.lots.filter((lot) => lot.id === id) : this.lots;
    if (isClose && matchingLots.length === 0) return null;
    let side = isClose ? ((this.position > 0 ? -1 : 1) as Side) : sideOf(p.direction);
    let qty = finite(p.qty);
    if (isClose) {
      const available = matchingLots.reduce((sum, lot) => sum + lot.quantity, 0);
      qty = Math.min(qty ?? (available * (finite(p.qty_percent) ?? 100)) / 100, available);
    }
    if (key === 'entry' && this.allowed && side !== this.allowed) {
      if (!this.position || Math.sign(this.position) === side) return null;
      return this.call('close_all', [], { comment: p.comment ?? id });
    }
    if (
      key === 'entry' &&
      Math.sign(this.position) === side &&
      this.lots.length >= Math.max(1, Number(this.settings.pyramiding))
    )
      return null;
    if (!isClose && key !== 'exit' && qty === undefined) qty = this.defaultQuantity(this.mark);
    const order: Order = {
      id,
      kind: isClose ? 'close' : (key as Order['kind']),
      side,
      quantity: qty,
      percent: finite(p.qty_percent),
      from: isClose
        ? key === 'close'
          ? id
          : undefined
        : p.from_entry === undefined
          ? undefined
          : String(p.from_entry),
      limit: finite(p.limit),
      stop: finite(p.stop),
      profit: finite(p.profit),
      loss: finite(p.loss),
      trailPrice: finite(p.trail_price),
      trailPoints: finite(p.trail_points),
      // With a trailing activation level, native runtime na behaves as zero
      // distance rather than disabling the trailing exit.
      trailOffset:
        finite(p.trail_offset) ??
        (finite(p.trail_price) !== undefined || finite(p.trail_points) !== undefined
          ? 0
          : undefined),
      comment: String(
        p.comment ??
          (isClose
            ? key === 'close'
              ? `Close entry(s) order ${id}`
              : 'Close position order'
            : id),
      ),
      submitted: this.tick,
      immediate: p.immediately === true,
      oca: p.oca_name === undefined ? undefined : String(p.oca_name),
      ocaType: shortName(p.oca_type),
      sequence: this.sequence++,
    };
    if (order.kind === 'exit') {
      const previous = this.orders.filter(
        (existing) => existing.id === id && existing.kind === 'exit',
      );
      for (const lot of this.lots) this.filledExits.delete(`${id}/${lot.uid}`);
      this.exits = this.exits.filter((existing) => existing.id !== id);
      this.orders = this.orders.filter(
        (existing) => !(existing.id === id && existing.kind === 'exit'),
      );
      this.exits.push(order);
      this.activateExits(previous);
    } else {
      this.normalizeOrderPrices(order);
      const old = this.orders.find(
        (existing) => existing.id === id && existing.kind === order.kind,
      );
      if (old) Object.assign(old, order, { sequence: old.sequence });
      else this.orders.push(order);
    }
    return null;
  }

  private defaultQuantity(price: number): number {
    price = this.roundPrice(price);
    const amount = Number(this.settings.default_qty_value);
    switch (shortName(this.settings.default_qty_type)) {
      case 'cash':
        return this.roundQuantity(amount / (price * this.pointValue));
      case 'percent_of_equity':
        return this.roundQuantity((this.equity * amount) / 100 / (price * this.pointValue));
      default:
        return this.roundQuantity(amount);
    }
  }

  beginBar(index: number, bar: MarketBar, onFill?: FillCallback, onTick?: () => void): void {
    this.index = index;
    this.bar = bar;
    const session = this.calendar.at(bar.time);
    const day =
      session === null
        ? null
        : (session?.tradingDay ?? this.dateFormatter.format(new Date(bar.time * 1000)));
    // Missing daily time releases the limit; returning from missing time carries
    // the counter forward. Unknown calendar coverage retains the civil-date fallback.
    const reset = day === null || (this.tradingDay !== null && day !== this.tradingDay);
    this.tradingDay = day;
    if (reset) {
      this.dailyFills = 0;
      this.dailyHalt = false;
      this.haltForRisk(this.risk?.beginDay(this.equity));
    }
    const extremes =
      bar.high - bar.open < bar.open - bar.low ? [bar.high, bar.low] : [bar.low, bar.high];
    const rawPath = [bar.open, ...extremes, bar.close];
    const path = rawPath.map((price) => this.roundPrice(price));
    let previous = path[0];
    for (let point = 0; point < path.length; point++) {
      this.tick++;
      const price = path[point]!;
      this.walkSegment(
        previous,
        price,
        point === 0,
        onFill,
        rawPath[Math.max(0, point - 1)],
        rawPath[point],
      );
      previous = price;
      // Orders created by a tick calculation become eligible on the next tick.
      // The account mark must be the current point, not the previous close.
      if (onTick) {
        this.mark = price;
        onTick();
        for (const order of this.orders)
          if (order.submitted === this.tick) this.tickCalculationOrders.add(order);
      }
    }
    this.mark = this.roundPrice(bar.close);
  }

  endBar(onFill?: FillCallback): void {
    const onClose =
      this.settings.process_orders_on_close === true || this.settings.fill_delay === 'None';
    this.mark = this.roundPrice(this.bar.close);
    // Global risk declarations also apply to orders emitted by their first
    // script calculation, before any optional same-close execution.
    this.checkRisk();
    const eligible = this.orders.filter(
      (order) =>
        order.immediate || (onClose && order.stop === undefined && order.limit === undefined),
    );
    for (const order of eligible) {
      if (!this.orders.includes(order)) continue;
      this.fill(order, this.mark, false, onFill);
    }
    this.checkMargin(onFill);
    this.checkRisk();
    this.observeAccount(this.mark);
    this.equityHistory.push(this.equity);
    this.marginHistory.push(
      (Math.abs(this.position) *
        this.mark *
        this.pointValue *
        Number(this.settings[this.position > 0 ? 'margin_long' : 'margin_short'])) /
        100,
    );
  }

  private activateExits(previous: readonly Order[] = []): void {
    for (const template of this.exits) {
      for (const lot of this.lots) {
        if (template.from !== undefined && template.from !== lot.id) continue;
        if (this.filledExits.has(`${template.id}/${lot.uid}`)) continue;
        if (this.orders.some((order) => order.id === template.id && order.lot === lot.uid))
          continue;
        const reserved = this.orders
          .filter((order) => order.kind === 'exit' && order.lot === lot.uid)
          .reduce((sum, order) => sum + (order.quantity ?? 0), 0);
        const quantity = Math.min(
          template.quantity ?? (lot.quantity * (template.percent ?? 100)) / 100,
          Math.max(0, lot.quantity - reserved),
        );
        if (quantity < this.minQuantity) continue;
        const relativeLimit =
          template.profit === undefined
            ? undefined
            : lot.price + lot.side * template.profit * this.tickSize;
        const relativeStop =
          template.loss === undefined
            ? undefined
            : lot.price - lot.side * template.loss * this.tickSize;
        let limit = template.limit ?? relativeLimit;
        let stop = template.stop ?? relativeStop;
        if (this.version >= 6) {
          if (limit !== undefined && relativeLimit !== undefined)
            limit =
              lot.side === 1 ? Math.min(limit, relativeLimit) : Math.max(limit, relativeLimit);
          if (stop !== undefined && relativeStop !== undefined)
            stop = lot.side === 1 ? Math.max(stop, relativeStop) : Math.min(stop, relativeStop);
        }
        const trailPrice =
          template.trailPrice ??
          (template.trailPoints === undefined
            ? undefined
            : lot.price + lot.side * template.trailPoints * this.tickSize);
        const activated: Order = {
          ...template,
          side: -lot.side as Side,
          quantity: this.roundQuantity(quantity),
          lot: lot.uid,
          limit,
          stop,
          trailPrice,
          submitted: Math.max(template.submitted, this.tick),
          sequence: this.sequence++,
        };
        this.normalizeOrderPrices(activated);
        const prior = previous.find((order) => order.id === activated.id && order.lot === lot.uid);
        if (
          prior?.trailExtreme !== undefined &&
          prior.trailPrice === activated.trailPrice &&
          activated.trailOffset !== undefined
        ) {
          activated.trailExtreme = prior.trailExtreme;
          advanceTrailing(activated, prior.trailExtreme, this.tickSize);
        }
        this.orders.push(activated);
      }
    }
  }

  private normalizeOrderPrices(order: Order): void {
    if (order.limit !== undefined) order.limit = this.roundPrice(order.limit, -order.side as Side);
    if (order.stop !== undefined) order.stop = this.roundPrice(order.stop, order.side);
    if (order.trailPrice !== undefined)
      order.trailPrice = this.roundPrice(order.trailPrice, -order.side as Side);
  }

  private advanceTrailingStops(price: number): void {
    for (const order of this.orders) advanceTrailing(order, price, this.tickSize);
  }

  private walkSegment(
    from: number,
    to: number,
    opening: boolean,
    onFill?: FillCallback,
    rawFrom = from,
    rawTo = to,
  ): void {
    const segment = { from, to, rawFrom, rawTo, opening };
    const limitVerification =
      Number(this.settings.backtest_fill_limits_assumption ?? 0) * this.tickSize;
    // Preserve each limit's first eligible market price while another order moves
    // the shared cursor. Already-resting orders do not gain price improvement by
    // happening to execute second at a shared verification threshold.
    const limitOrigins = limitVerification > 0 ? new Map<Order, number>() : undefined;
    let cursor = from;
    let actions = 0;
    while (true) {
      if (++actions > 100_000)
        throw Object.assign(new Error('Order processing did not converge'), { kind: 'limit' });
      this.mark = this.roundPrice(cursor);
      if (opening && this.committedRiskFills.length) {
        // The period boundary has committed these quantities before any opening
        // fill changes the position. Script cancellation cannot retract them.
        const committed = this.committedRiskFills;
        this.committedRiskFills = [];
        for (const order of committed) this.fill(order, this.mark, false, onFill);
      }
      if (this.forcedCloseAfterTick !== undefined && this.tick > this.forcedCloseAfterTick) {
        this.forcedCloseAfterTick = undefined;
        if (this.lots.length)
          this.forceClose(Math.abs(this.position), this.forcedCloseReason, onFill);
      }
      this.checkRisk();
      const candidates = this.orders
        .filter((order) => order.submitted < this.tick)
        .map((order) => {
          if (limitOrigins && !limitOrigins.has(order)) limitOrigins.set(order, cursor);
          return {
            order,
            trigger: nextOrderEvent(
              order,
              this.tickCalculationOrders.has(order) &&
                order.limit === undefined &&
                order.stop === undefined &&
                order.trailPrice === undefined
                ? to
                : cursor,
              to,
              opening,
              limitVerification,
              this.tickSize,
              limitOrigins?.get(order),
            ),
          };
        })
        .filter(
          (
            candidate,
          ): candidate is {
            order: Order;
            trigger: OrderEvent;
          } => candidate.trigger !== undefined,
        )
        .sort((a, b) => compareOrderEvents(a, b, cursor));
      const candidate = candidates[0];
      if (!candidate) break;
      cursor = candidate.trigger.price;
      this.mark = this.roundPrice(cursor);
      this.checkRisk();
      if (!this.orders.includes(candidate.order)) continue;
      this.advanceTrailingStops(observedPrice(segment, cursor));
      if (candidate.trigger.activation) this.updateExcursions(this.mark);
      if (candidate.trigger.activation === 'stop-limit') {
        candidate.order.triggered = true;
        limitOrigins?.set(candidate.order, cursor);
      } else if (candidate.trigger.activation === 'trailing') {
        activateTrailing(candidate.order, cursor, segment);
        this.advanceTrailingStops(observedPrice(segment, cursor));
        // A zero-distance trail fills at activation. Do not let floating-point
        // tick reconstruction delay it until a later favorable extreme.
        if (candidate.order.trailOffset === 0)
          this.fill(candidate.order, cursor, true, onFill, cursor);
      } else
        this.fill(
          candidate.order,
          candidate.trigger.fillPrice ?? cursor,
          candidate.trigger.stop,
          onFill,
          cursor,
        );
    }
    this.mark = this.roundPrice(to);
    this.updateExcursions(this.mark);
    this.advanceTrailingStops(rawTo);
    this.checkMargin(onFill);
    this.checkRisk();
  }

  private commission(quantity: number, price: number): number {
    const value = Number(this.settings.commission_value ?? 0);
    switch (shortName(this.settings.commission_type)) {
      case 'cash_per_contract':
        return value * quantity;
      case 'cash_per_order':
        return value;
      default:
        return (value / 100) * quantity * price * this.pointValue;
    }
  }

  private fill(
    order: Order,
    rawPrice: number,
    stopFill: boolean,
    onFill?: FillCallback,
    marketPrice = rawPrice,
  ): void {
    this.orders = this.orders.filter((existing) => existing !== order);
    if (order.kind === 'exit' && order.lot !== undefined)
      this.filledExits.add(`${order.id}/${order.lot}`);
    const isMarket = order.limit === undefined && order.stop === undefined;
    const slippage = isMarket || stopFill ? order.side * Number(this.settings.slippage ?? 0) : 0;
    // Add whole ticks before converting back to a price, so equal fills have equal values.
    const price = this.roundPrice(rawPrice, 0, slippage);
    let quantity = order.quantity ?? this.defaultQuantity(price);
    const reversing =
      order.kind === 'entry' && this.position && Math.sign(this.position) !== order.side;
    if (order.kind === 'entry') {
      if (
        Math.sign(this.position) === order.side &&
        this.lots.length >= Math.max(1, Number(this.settings.pyramiding))
      )
        return;
      quantity = Math.min(
        quantity,
        Math.max(0, this.maxPosition - (reversing ? 0 : Math.abs(this.position))),
      );
      if (reversing) quantity += Math.abs(this.position);
    }
    quantity = this.roundQuantity(quantity);
    const eligible = this.lots.filter(
      (lot) =>
        lot.side !== order.side &&
        (this.settings.close_entries_rule !== 'ANY' ||
          order.from === undefined ||
          lot.id === order.from),
    );
    if (order.kind === 'close' || order.kind === 'exit')
      quantity = Math.min(
        quantity,
        eligible.reduce((sum, lot) => sum + lot.quantity, 0),
      );
    if (quantity < this.minQuantity) return;
    this.updateExcursions(price);
    const cashCommission = this.commission(quantity, price);
    let remaining = quantity;
    for (const lot of eligible) {
      if (remaining <= 0) break;
      const used = Math.min(lot.quantity, remaining);
      const portion = used / lot.quantity;
      const entryCommission = lot.commission * portion;
      const exitCommission = (cashCommission * used) / quantity;
      const profit =
        (price - lot.price) * used * lot.side * this.pointValue - entryCommission - exitCommission;
      this.closed.push({
        direction: lot.side === 1 ? 'long' : 'short',
        entryId: lot.id,
        exitId: order.id,
        entryComment: lot.comment,
        exitComment: order.comment,
        quantity: used,
        entryBar: lot.bar,
        exitBar: this.index,
        entryTime: lot.time,
        exitTime: this.bar.time,
        entryPrice: lot.price,
        exitPrice: price,
        entryCommission,
        commission: entryCommission + exitCommission,
        profit,
        realizedProfit: this.realized + profit + entryCommission,
        maxRunup: lot.maxRunup * portion,
        maxDrawdown: lot.maxDrawdown * portion,
      });
      this.realized += profit + entryCommission;
      lot.commission -= entryCommission;
      lot.quantity -= used;
      lot.maxRunup *= 1 - portion;
      lot.maxDrawdown *= 1 - portion;
      remaining -= used;
    }
    this.lots = this.lots.filter((lot) => lot.quantity > this.minQuantity * 1e-8);
    if (remaining >= this.minQuantity && (order.kind === 'entry' || order.kind === 'order')) {
      const entryCommission = (cashCommission * remaining) / quantity;
      this.realized -= entryCommission;
      this.lots.push({
        uid: this.nextLot++,
        id: order.id,
        comment: order.comment,
        side: order.side,
        quantity: remaining,
        price,
        bar: this.index,
        time: this.bar.time,
        commission: entryCommission,
        maxRunup: 0,
        maxDrawdown: 0,
      });
    }
    this.orders = this.orders.filter(
      (other) => other.lot === undefined || this.lots.some((lot) => lot.uid === other.lot),
    );
    if (!this.lots.length)
      this.exits = this.exits.filter((exit) =>
        this.orders.some(
          (other) => other.kind === 'entry' && (exit.from === undefined || other.id === exit.from),
        ),
      );
    if (order.oca) {
      if (order.ocaType === 'cancel')
        this.orders = this.orders.filter((other) => other.oca !== order.oca);
      if (order.ocaType === 'reduce')
        for (const other of this.orders)
          if (other.oca === order.oca)
            other.quantity = Math.max(0, (other.quantity ?? 0) - quantity);
    }
    this.dailyFills++;
    this.maxContractsHeld.all = Math.max(this.maxContractsHeld.all, Math.abs(this.position));
    this.maxContractsHeld.long = Math.max(this.maxContractsHeld.long, this.position);
    this.maxContractsHeld.short = Math.max(this.maxContractsHeld.short, -this.position);
    if (this.dailyFills >= this.maxDailyFills && !this.dailyHalt) {
      this.dailyHalt = true;
      this.orders = [];
      this.exits = [];
      this.forcedCloseAfterTick = this.lots.length ? this.tick : undefined;
      this.forcedCloseReason = 'Close Position (Max number of filled orders in one day)';
    }
    this.activateExits();
    this.observeAccount(this.mark);
    this.checkRisk();
    if (onFill && this.settings.calc_on_order_fills === true)
      onFill({ ...this.bar, close: marketPrice });
  }

  private updateExcursions(price: number): void {
    this.observeAccount(price);
    for (const lot of this.lots) {
      if (price === lot.price && lot.maxRunup === 0 && lot.maxDrawdown === 0) continue;
      lot.maxDrawdown = Math.max(lot.maxDrawdown, lot.commission);
      const profit =
        (price - lot.price) * lot.side * lot.quantity * this.pointValue - lot.commission;
      lot.maxRunup = Math.max(lot.maxRunup, profit);
      lot.maxDrawdown = Math.max(lot.maxDrawdown, -profit);
    }
  }

  private checkRisk(): void {
    this.haltForRisk(this.risk?.observe(this.equity, this.initialCapital + this.realized));
  }

  private riskLimits(): RiskLimits {
    if (!this.risk) {
      this.risk = new RiskLimits(this.initialCapital);
      this.risk.beginDay(this.equity);
    }
    return this.risk;
  }

  private haltForRisk(halt: RiskHalt | undefined): void {
    if (!halt) return;
    if (halt.execution === 'period-boundary') {
      // A completed losing period commits a fixed market liquidation alongside
      // already submitted market closes. It is not a reduce-only script close:
      // the native broker can reverse after both sell quantities execute.
      this.committedRiskFills = this.orders
        .filter(
          (order) =>
            order.kind === 'close' && order.limit === undefined && order.stop === undefined,
        )
        .map((order) => ({ ...order }));
      if (this.position) {
        this.committedRiskFills.push({
          id: halt.reason,
          kind: 'order',
          side: this.position > 0 ? -1 : 1,
          quantity: Math.abs(this.position),
          comment: halt.reason,
          submitted: this.tick,
          immediate: false,
          sequence: this.sequence++,
        });
      }
      this.orders = [];
      this.exits = [];
      return;
    }
    this.orders = [];
    this.exits = [];
    if (this.lots.length && this.forcedCloseAfterTick === undefined) {
      this.forcedCloseAfterTick = this.tick;
      this.forcedCloseReason = halt.reason;
    }
  }

  private observeAccount(price: number): void {
    const balance = this.initialCapital + this.realized;
    const floatingProfit = this.lots.reduce(
      (sum, lot) => sum + (price - lot.price) * lot.quantity * lot.side * this.pointValue,
      0,
    );
    this.accountExcursions?.observe(balance, balance + floatingProfit);
    const margin = Number(this.settings[this.position > 0 ? 'margin_long' : 'margin_short']) / 100;
    this.maxMarginUsed = Math.max(
      this.maxMarginUsed,
      Math.abs(this.position) * price * this.pointValue * margin,
    );
  }

  private liquidationPrice(): number {
    const qty = Math.abs(this.position);
    if (!qty) return NaN;
    const side = Math.sign(this.position);
    const margin = Number(this.settings[side > 0 ? 'margin_long' : 'margin_short']) / 100;
    if (!margin || margin === side) return NaN;
    const price =
      (this.initialCapital + this.realized - side * qty * this.average * this.pointValue) /
      (qty * this.pointValue * (margin - side));
    const nearest = this.roundPrice(price);
    // Summing closed profits introduces a bounded accumulation error around exact ticks.
    const arithmeticError =
      (Number.EPSILON *
        (Math.abs(this.initialCapital) + Math.abs(this.realized)) *
        Math.max(1, this.closed.length)) /
      (qty * this.pointValue * Math.abs(margin - side));
    return this.roundPrice(
      Math.abs(price - nearest) <= arithmeticError ? nearest : price,
      side > 0 ? -1 : 1,
    );
  }

  private checkMargin(onFill?: FillCallback): void {
    if (!this.lots.length) return;
    const margin = Number(this.settings[this.position > 0 ? 'margin_long' : 'margin_short']) / 100;
    if (!margin) return;
    const required = Math.abs(this.position) * this.mark * this.pointValue * margin;
    const shortage = required - this.equity;
    if (shortage <= 0) return;
    const quantity = Math.min(
      Math.abs(this.position),
      Math.max(
        this.minQuantity,
        this.roundQuantity(shortage / margin / (this.mark * this.pointValue)) * 4,
      ),
    );
    this.liquidations.push({
      direction: this.position > 0 ? 'long' : 'short',
      quantity,
      price: this.mark,
    });
    this.forceClose(quantity, 'Margin call', onFill);
  }

  private forceClose(quantity: number, comment: string, onFill?: FillCallback): void {
    this.fill(
      {
        id: comment,
        kind: 'close',
        side: this.position > 0 ? -1 : 1,
        quantity,
        comment,
        submitted: this.tick - 1,
        immediate: true,
        sequence: this.sequence++,
      },
      this.mark,
      false,
      onFill,
    );
  }

  private openTrades(): Trade[] {
    return this.lots.map((lot) => ({
      direction: lot.side === 1 ? ('long' as const) : ('short' as const),
      entryId: lot.id,
      exitId: null,
      entryComment: lot.comment,
      exitComment: null,
      quantity: lot.quantity,
      entryBar: lot.bar,
      exitBar: null,
      entryTime: lot.time,
      exitTime: null,
      entryPrice: lot.price,
      exitPrice: null,
      entryCommission: lot.commission,
      commission: lot.commission,
      profit: (this.mark - lot.price) * lot.quantity * lot.side * this.pointValue - lot.commission,
      displayCommission: this.commission(lot.quantity, this.mark),
      realizedProfit: this.realized,
      maxRunup: lot.maxRunup,
      maxDrawdown: lot.maxDrawdown,
    }));
  }

  /** Copy the same close equity observations used to calculate the report. */
  equitySeries(): number[] {
    return this.equityHistory.slice();
  }

  result(): { trades: Trade[]; metrics: Record<string, number | string | null> } {
    const trades = [...this.closed, ...this.openTrades()];
    const declaredCurrency = shortName(this.settings.currency ?? '');
    return {
      trades,
      metrics: calculateMetrics({
        trades,
        initialCapital: this.initialCapital,
        currency:
          !declaredCurrency || declaredCurrency === 'NONE'
            ? String(this.input.syminfo.currency ?? SYMBOL_DEFAULTS.currency)
            : declaredCurrency,
        pointvalue: this.pointValue,
        mintick: this.tickSize,
        mincontract: this.minQuantity,
        riskFreeRate: finite(this.settings.risk_free_rate),
        bars: this.input.bars,
        equity: this.equityHistory,
        marginUsed: this.marginHistory,
        maxMarginUsed: this.maxMarginUsed,
        maxContractsHeld: this.maxContractsHeld,
        liquidations: this.liquidations,
        intrabarDrawdown: this.accountExcursions?.drawdown,
        intrabarRunup: this.accountExcursions?.runup,
      }),
    };
  }
}

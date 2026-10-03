export type Side = 1 | -1;

export interface Lot {
  uid: number;
  id: string;
  comment: string;
  side: Side;
  quantity: number;
  price: number;
  bar: number;
  time: number;
  commission: number;
  maxRunup: number;
  maxDrawdown: number;
}

export interface Order {
  id: string;
  kind: 'entry' | 'order' | 'close' | 'exit';
  side: Side;
  quantity?: number;
  percent?: number;
  from?: string;
  lot?: number;
  limit?: number;
  stop?: number;
  triggered?: boolean;
  profit?: number;
  loss?: number;
  trailPrice?: number;
  trailPoints?: number;
  trailOffset?: number;
  trailExtreme?: number;
  comment: string;
  submitted: number;
  immediate: boolean;
  oca?: string;
  ocaType?: string;
  sequence: number;
}

export interface OrderEvent {
  price: number;
  /** Limit verification observes a better market price but executes at the limit. */
  fillPrice?: number;
  stop: boolean;
  activation?: 'stop-limit' | 'trailing';
}

export interface OrderCandidate {
  order: Order;
  trigger: OrderEvent;
}

/** Market orders precede price orders at a shared tick; crossed levels run nearest first. */
export function compareOrderEvents(a: OrderCandidate, b: OrderCandidate, cursor: number): number {
  const priceOrder = (order: Order): number =>
    Number(order.limit !== undefined || order.stop !== undefined || order.trailPrice !== undefined);
  const levelDistance = ({ order, trigger }: OrderCandidate): number =>
    Math.abs(((trigger.stop ? order.stop : (order.limit ?? order.trailPrice)) ?? cursor) - cursor);
  return (
    Math.abs(a.trigger.price - cursor) - Math.abs(b.trigger.price - cursor) ||
    priceOrder(a.order) - priceOrder(b.order) ||
    levelDistance(a) - levelDistance(b) ||
    a.order.sequence - b.order.sequence
  );
}

/** Find the next price event without mutating orders or using future extrema as state. */
export function nextOrderEvent(
  order: Readonly<Order>,
  from: number,
  to: number,
  opening: boolean,
  limitVerification = 0,
  tickSize = 0,
  limitOrigin = from,
): OrderEvent | undefined {
  const crosses = (level: number): boolean =>
    level >= Math.min(from, to) && level <= Math.max(from, to);
  const hit = (level: number, direction: Side): number | undefined =>
    direction * (from - level) >= 0 ? from : !opening && crosses(level) ? level : undefined;
  const events: OrderEvent[] = [];
  if (
    order.trailPrice !== undefined &&
    order.trailOffset !== undefined &&
    order.trailExtreme === undefined
  ) {
    const price = hit(order.trailPrice, -order.side as Side);
    if (price !== undefined) events.push({ price, stop: false, activation: 'trailing' });
  }
  if (
    order.kind !== 'exit' &&
    order.stop !== undefined &&
    order.limit !== undefined &&
    !order.triggered
  ) {
    const price = hit(order.stop, order.side);
    return price === undefined ? undefined : { price, stop: true, activation: 'stop-limit' };
  }
  if (order.stop !== undefined && !order.triggered) {
    const price = hit(order.stop, order.side);
    if (price !== undefined) events.push({ price, stop: true });
  }
  if (order.limit !== undefined) {
    // Derive the threshold on the same integer tick grid as the OHLC path. Direct
    // subtraction can otherwise miss an exact touch (for example 0.07 - 0.06).
    const threshold =
      limitVerification > 0 && tickSize > 0
        ? (Math.round(order.limit / tickSize) -
            order.side * Math.round(limitVerification / tickSize)) *
          tickSize
        : order.limit - order.side * limitVerification;
    const price = hit(threshold, -order.side as Side);
    if (price !== undefined)
      events.push({
        price,
        stop: false,
        // A newly eligible limit already executable at the current price gets
        // that improvement, including exits activated by an opening market fill.
        // Traversing to a verification threshold fills at the original limit.
        ...(limitVerification > 0 && !opening && price !== limitOrigin
          ? { fillPrice: order.limit }
          : {}),
      });
  }
  if (order.limit === undefined && order.stop === undefined && order.trailPrice === undefined) {
    events.push({ price: from, stop: false });
  }
  return events.sort((a, b) => Math.abs(a.price - from) - Math.abs(b.price - from))[0];
}

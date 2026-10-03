import type { Order, Side } from './orders.ts';

export interface PriceSegment {
  from: number;
  to: number;
  rawFrom: number;
  rawTo: number;
  opening: boolean;
}

/** Match orders on executable ticks, while preserving observed extrema between ticks. */
export function observedPrice(segment: PriceSegment, price: number): number {
  if (price === segment.from) return segment.rawFrom;
  if (price === segment.to) return segment.rawTo;
  return price;
}

export function activateTrailing(order: Order, price: number, segment: PriceSegment): void {
  if (order.trailPrice === undefined) throw new Error('Trailing activation requires a price');
  // A repeated historical tick advances eligibility without observing a new price.
  // Opening gaps, unlike these repeated ticks, introduce a new raw market observation.
  const observed =
    !segment.opening && segment.from === segment.to ? price : observedPrice(segment, price);
  order.trailExtreme =
    order.side < 0 ? Math.max(observed, order.trailPrice) : Math.min(observed, order.trailPrice);
}

/** An active trail advances only in the position's favorable direction. */
export function advanceTrailing(order: Order, price: number, tickSize: number): void {
  if (order.trailExtreme === undefined || order.trailOffset === undefined) return;
  const positionSide = -order.side as Side;
  order.trailExtreme =
    positionSide > 0 ? Math.max(order.trailExtreme, price) : Math.min(order.trailExtreme, price);
  const stopTicks = (order.trailExtreme - positionSide * order.trailOffset * tickSize) / tickSize;
  // Correct arithmetic noise at an existing tick without shifting a fractional quote.
  order.stop =
    (order.side > 0 ? Math.ceil(stopTicks - 1e-10) : Math.floor(stopTicks + 1e-10)) * tickSize;
}

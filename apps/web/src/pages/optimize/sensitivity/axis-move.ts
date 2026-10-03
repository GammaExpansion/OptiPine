import { message, type Message } from '@pine/messages';

export type AxisRole = 'x' | 'y';
export interface AxisMove {
  readonly role: AxisRole;
  readonly from: number;
  readonly target: number;
}
export interface MoveResult {
  readonly move: AxisMove | null;
  readonly announcement: Message;
  readonly commit?: { readonly role: AxisRole; readonly title: string };
}

/** Pointer and keyboard moves share the same transaction; only confirmation changes the axis. */
export function moveAxis(
  move: AxisMove | null,
  event:
    | { type: 'pick'; role: AxisRole; index: number }
    | { type: 'target'; index: number }
    | { type: 'step'; delta: number }
    | { type: 'confirm' }
    | { type: 'cancel' },
  titles: readonly string[],
): MoveResult | null {
  if (!titles.length) return null;
  if (event.type === 'pick') {
    if (!titles[event.index]) return null;
    const next = { role: event.role, from: event.index, target: event.index };
    return {
      move: next,
      announcement: message('optimize.sensitivity.picked', {
        axis: event.role.toUpperCase(),
        title: titles[event.index],
      }),
    };
  }
  if (!move) return null;
  if (event.type === 'cancel')
    return {
      move: null,
      announcement: message('optimize.sensitivity.cancelled', { axis: move.role.toUpperCase() }),
    };
  if (event.type === 'confirm') {
    const title = titles[move.target];
    if (!title) return null;
    return {
      move: null,
      commit: { role: move.role, title },
      announcement: message('optimize.sensitivity.moved', { axis: move.role.toUpperCase(), title }),
    };
  }
  const target = Math.max(
    0,
    Math.min(titles.length - 1, event.type === 'step' ? move.target + event.delta : event.index),
  );
  return {
    move: { ...move, target },
    announcement: message('optimize.sensitivity.target', {
      axis: move.role.toUpperCase(),
      title: titles[target],
    }),
  };
}

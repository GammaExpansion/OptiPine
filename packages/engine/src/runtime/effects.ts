/** Opaque IDs allow drawing lifecycle calls without inventing readable geometry. */
export class DrawingHandle {
  readonly kind: string;
  constructor(kind: string) {
    this.kind = kind;
    Object.freeze(this);
  }

  [Symbol.toPrimitive](): never {
    return unreadableDrawing();
  }
}

export function unreadableDrawing(): never {
  throw Object.assign(new Error('Reading a drawing value is not supported'), {
    kind: 'unsupported',
  });
}

export function assertReadable(value: unknown): void {
  if (value instanceof DrawingHandle) unreadableDrawing();
}

export function ignoredEffect(name: string): boolean {
  return (
    ['hline', 'fill', 'bgcolor', 'barcolor', 'alertcondition', 'alert', 'max_bars_back'].includes(
      name,
    ) ||
    /^log\.(info|warning|error)$/.test(name) ||
    /^(line|label|box|table|linefill|polyline)\.(new|copy|delete|set_\w+|cell|cell_set_\w+|clear|merge_cells)$/.test(
      name,
    )
  );
}

export function effectResult(name: string): DrawingHandle | null {
  return name === 'hline' || /\.(new|copy)$/.test(name)
    ? new DrawingHandle(name.split('.')[0])
    : null;
}

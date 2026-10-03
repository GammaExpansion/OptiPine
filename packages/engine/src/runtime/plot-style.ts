import type { Call } from '../compiler/ast.ts';
import type { PlotOutput, PlotStyle } from '../types.ts';

const lines = [
  'line',
  'linebr',
  'stepline',
  'steplinebr',
  'area',
  'areabr',
  'histogram',
  'columns',
  'circles',
  'cross',
] as const;
const shapes = [
  'triangleup',
  'triangledown',
  'arrowup',
  'arrowdown',
  'circle',
  'square',
  'diamond',
  'cross',
  'xcross',
  'flag',
  'labelup',
  'labeldown',
] as const;
const locations = ['abovebar', 'belowbar', 'top', 'bottom', 'absolute'] as const;
const sizes = ['auto', 'tiny', 'small', 'normal', 'large', 'huge'] as const;

/** Keep unknown distinct from na: consumers may fall back only for unknown colours. */
export function plotColor(value: unknown): string | null | undefined {
  if (value === null || (typeof value === 'number' && Number.isNaN(value))) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    !('__color' in value) ||
    !('rgb' in value) ||
    !('transparency' in value)
  )
    return undefined;
  const { rgb, transparency } = value;
  if (typeof rgb !== 'number' || typeof transparency !== 'number') return undefined;
  if (Number.isNaN(rgb) || Number.isNaN(transparency)) return null;
  if (!Number.isFinite(rgb) || !Number.isFinite(transparency)) return undefined;
  const hex = Math.round(rgb).toString(16).padStart(6, '0');
  if (!/^[0-9a-f]{6}$/.test(hex)) return undefined;
  const alpha = Math.round(255 * (1 - Math.max(0, Math.min(100, transparency)) / 100));
  return `#${hex}${alpha === 255 ? '' : alpha.toString(16).padStart(2, '0')}`;
}

function member<T extends string>(
  value: unknown,
  prefix: string,
  choices: readonly T[],
): T | undefined {
  if (typeof value !== 'string' || !value.startsWith(prefix)) return undefined;
  return choices.find((choice) => choice === value.slice(prefix.length));
}

/** Build once per plot. Qualifiers come from compilation, never from observing a short history. */
export function plotStyle(
  node: Call,
  name: 'plot' | 'plotshape' | 'plotchar',
  positional: unknown[],
  named: Record<string, unknown>,
): { style: PlotStyle; seriesColor: boolean } {
  const read = (label: string, position: number) => {
    const index = node.args.findIndex((arg) => arg.name === label);
    const positionalIndex = node.args.flatMap((arg, i) => (arg.name ? [] : [i]))[position];
    const argumentIndex = index >= 0 ? index : positionalIndex;
    return {
      value: index >= 0 ? named[label] : positional[position],
      qualifier: argumentIndex === undefined ? undefined : node.plotQualifiers?.[argumentIndex],
    };
  };
  const constant = (label: string, position: number) => {
    const arg = read(label, position);
    return arg.qualifier && arg.qualifier !== 'series' ? arg.value : undefined;
  };
  const style: PlotStyle = {
    kind: name === 'plot' ? 'plot' : name === 'plotshape' ? 'shape' : 'char',
  };
  const colorArgument = read('color', name === 'plot' ? 2 : 4);
  const seriesColor = colorArgument.qualifier === 'series';
  const normalized = plotColor(colorArgument.value);
  if (!seriesColor && colorArgument.qualifier && normalized !== undefined) style.color = normalized;
  if (name === 'plot') {
    const line = member(constant('style', 4), 'plot.style_', lines);
    if (line) style.style = line;
    const width = constant('linewidth', 3);
    if (typeof width === 'number' && Number.isFinite(width) && width > 0) style.linewidth = width;
  } else {
    const location = member(constant('location', 3), 'location.', locations);
    if (location) style.location = location;
    const size = member(constant('size', 9), '', sizes);
    if (size) style.size = size;
    if (name === 'plotshape') {
      const shape = member(constant('style', 2), 'shape.', shapes);
      if (shape) style.style = shape;
      const text = constant('text', 6);
      if (typeof text === 'string') style.text = text;
    } else {
      const char = constant('char', 2);
      if (typeof char === 'string') style.char = char;
    }
  }
  return { style, seriesColor };
}

/** Series arrays are allocated only when a declaration's colour really is series-qualified. */
export class PlotStyles {
  private series = new Set<PlotOutput>();

  record(
    plot: PlotOutput,
    node: Call,
    name: 'plot' | 'plotshape' | 'plotchar',
    positional: unknown[],
    named: Record<string, unknown>,
    index: number,
  ): void {
    if (!plot.style) {
      const resolved = plotStyle(node, name, positional, named);
      plot.style = resolved.style;
      if (resolved.seriesColor) this.series.add(plot);
    }
    if (this.series.has(plot)) {
      const color = plotColor(
        Object.hasOwn(named, 'color') ? named.color : positional[name === 'plot' ? 2 : 4],
      );
      if (color !== undefined) {
        plot.colors ??= Array(plot.values.length).fill(null);
        plot.colors[index] = color;
      } else {
        // An unresolved colour must not become na or an invented palette value in the engine.
        delete plot.colors;
        this.series.delete(plot);
      }
    }
  }
}

/** SVG children belong to the renderer, never to React's reconciler. */
export function svgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

export interface CalendarViewport {
  width: number;
  /** Coordinate on the equity chart for a calendar-day ordinal (UTC date, not an instant). */
  project(day: number): number;
}
export interface CalendarHandle {
  render(viewport: CalendarViewport): void;
}

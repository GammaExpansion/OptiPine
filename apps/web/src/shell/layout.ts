/**
 * The page layouts of WEB.md 2.7: the desktop workbench from 1280 px wide (G1), the right panel as
 * a drawer from 768 to 1279 px (G2), and one column with tabs below 768 px (G3, G4).
 */
export type Layout = 'desktop' | 'tablet' | 'phone';

/** The header's toggle of the tablet's right drawer, which gets the focus back when it closes. */
export const drawerToggleId = 'right-drawer-toggle';

/** The media queries each narrower layout starts at; desktop is what neither matches. */
export const layoutQueries = {
  phone: '(max-width: 767px)',
  tablet: '(max-width: 1279px)',
} as const;

export function layoutOf(matches: { readonly phone: boolean; readonly tablet: boolean }): Layout {
  return matches.phone ? 'phone' : matches.tablet ? 'tablet' : 'desktop';
}

/** Where `matchMedia` is missing, as in Node and jsdom, the page lays out as on a desktop. */
export function currentLayout(
  matchMedia: ((query: string) => { matches: boolean }) | undefined = globalThis.matchMedia,
): Layout {
  if (typeof matchMedia !== 'function') return 'desktop';
  return layoutOf({
    phone: matchMedia(layoutQueries.phone).matches,
    tablet: matchMedia(layoutQueries.tablet).matches,
  });
}

/** Calls `listener` when the layout may have changed; returns the unsubscribe. */
export function watchLayout(
  listener: () => void,
  matchMedia: ((query: string) => MediaQueryList) | undefined = globalThis.matchMedia,
): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const lists = Object.values(layoutQueries).map((query) => matchMedia(query));
  for (const list of lists) list.addEventListener('change', listener);
  return () => {
    for (const list of lists) list.removeEventListener('change', listener);
  };
}

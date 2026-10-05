/** Whether this bundle is the static GitHub Pages demo. */
export const demoBuild = import.meta.env.VITE_DEMO === '1';

/** Resolve an app asset below Vite's configured base path. */
export function appUrl(path: string): string {
  const relative = path.replace(/^\/+/, '');
  return `${import.meta.env.BASE_URL}${relative}`;
}

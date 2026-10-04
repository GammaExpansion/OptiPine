import type { Catalog, CatalogArea, Language } from './types.ts';

/** Shared by the browser and Node tests; importing an area never imports its UI. */
export function createCatalogLoader(
  fetch: (language: Language, area: CatalogArea) => Promise<Catalog>,
) {
  const catalogs: Partial<Record<Language, Catalog>> = {};
  const loaded = new Set<string>();
  const loading = new Map<string, Promise<void>>();
  const requested = new Set<CatalogArea>(['core']);
  const listeners = new Set<() => void>();
  let revision = 0;
  function notify() {
    revision++;
    for (const listener of listeners) listener();
  }
  function has(language: Language, area: CatalogArea = 'core') {
    return loaded.has(`${language}:${area}`);
  }
  function register(language: Language, area: CatalogArea, catalog: Catalog) {
    catalogs[language] = { ...catalogs[language], ...catalog };
    loaded.add(`${language}:${area}`);
    notify();
  }
  function load(language: Language, area: CatalogArea = 'core'): Promise<void> {
    if (!requested.has(area)) {
      requested.add(area);
      // A lazy boundary can request an area during render. Notify React after that render.
      queueMicrotask(notify);
    }
    if (has(language, area)) return Promise.resolve();
    const key = `${language}:${area}`;
    let pending = loading.get(key);
    if (!pending) {
      pending = fetch(language, area).then(
        (catalog) => register(language, area, catalog),
        (error: unknown) => {
          loading.delete(key);
          throw error;
        },
      );
      loading.set(key, pending);
    }
    return pending;
  }
  return {
    get: (language: Language) => catalogs[language],
    has,
    register,
    load,
    /** Keep the shown language until every visited area's replacement is available. */
    ready: (language: Language) => [...requested].every((area) => has(language, area)),
    loadRequested: (language: Language) =>
      Promise.all([...requested].map((area) => load(language, area))),
    revision: () => revision,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

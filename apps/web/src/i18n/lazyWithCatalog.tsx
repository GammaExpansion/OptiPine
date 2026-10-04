import { lazy, type ComponentProps, type ComponentType } from 'react';
import { useI18n } from './I18nProvider.tsx';
import { hasCatalog, loadCatalog, type CatalogArea, type Language } from './translate.ts';

/** Fetch UI and copy together; Suspense also guards a language change during the first load. */
export function lazyWithCatalog<Component extends ComponentType<any>>(
  area: CatalogArea,
  factory: () => Promise<{ default: Component }>,
) {
  let chunk: ReturnType<typeof factory> | undefined;
  const load = () => (chunk ??= factory());
  const Component = lazy(load);
  const preload = (language: Language) => Promise.all([loadCatalog(language, area), load()]);
  function CatalogComponent(props: ComponentProps<Component>) {
    const { language } = useI18n();
    if (!hasCatalog(language, area)) throw preload(language);
    return <Component {...props} />;
  }
  return Object.assign(CatalogComponent, { preload });
}

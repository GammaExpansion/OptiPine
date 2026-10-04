import { Suspense } from 'react';
import { lazyWithCatalog } from '../../i18n/lazyWithCatalog.tsx';

const PropertiesDialog = lazyWithCatalog('properties', () =>
  import('./PropertiesDialog.tsx').then((module) => ({ default: module.PropertiesDialog })),
);

/** The dialogs root's slot for B13: the dialog and Radix Dialog load when it first opens. */
export function LazyPropertiesDialog() {
  return (
    <Suspense fallback={null}>
      <PropertiesDialog />
    </Suspense>
  );
}

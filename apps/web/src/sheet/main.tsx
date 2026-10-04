import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, loadActiveCatalog } from '../i18n/I18nProvider.tsx';
import { loadCatalog } from '../i18n/translate.ts';
import { uiStore } from '../state/ui.ts';
import '../styles/base.css';
import { Sheet } from './Sheet.tsx';

// The sheet is available in development and the isolated e2e build, never the production app.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
  await loadActiveCatalog();
  await Promise.all(
    (['sheet', 'optimize'] as const).map((area) => loadCatalog(uiStore.getState().language, area)),
  );
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider>
        <Sheet />
      </I18nProvider>
    </StrictMode>,
  );
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../i18n/catalogs.ts';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import '../styles/base.css';
import { Sheet } from './Sheet.tsx';

// The sheet is available in development and the isolated e2e build, never the production app.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider>
        <Sheet />
      </I18nProvider>
    </StrictMode>,
  );
}

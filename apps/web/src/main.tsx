import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, loadActiveCatalog } from './i18n/I18nProvider.tsx';
import { Shell } from './shell/Shell.tsx';
import { disposeServices, installServiceLifecycle } from './state/services.ts';
import './styles/base.css';

const removeLifecycle = installServiceLifecycle();
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    removeLifecycle();
    disposeServices();
  });

void loadActiveCatalog().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider>
        <Shell />
      </I18nProvider>
    </StrictMode>,
  ),
);

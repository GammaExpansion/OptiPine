import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './i18n/I18nProvider.tsx';
import { Shell } from './shell/Shell.tsx';
import './styles/base.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <Shell />
    </I18nProvider>
  </StrictMode>,
);

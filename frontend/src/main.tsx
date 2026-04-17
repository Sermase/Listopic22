import React from 'react'
import { createRoot } from 'react-dom/client'
import { initSentry } from './lib/sentry'
import './index.css'
import App from './App.tsx'

initSentry();
import { AppConfigProvider } from './context/AppConfigContext';
import { SeoManager } from './components/SeoManager';
import { AuthProvider } from './context/AuthContext';
import { FilterProvider } from './context/FilterContext';
import { GamificationProvider } from './context/GamificationContext';
import { StorageImageRecovery } from './components/StorageImageRecovery';
import ErrorBoundary from './components/ErrorBoundary';

const canRegisterServiceWorker = 'serviceWorker' in navigator
  && (
    window.isSecureContext
    || window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
  );

if (canRegisterServiceWorker) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  });
}

// Remove the static boot overlay once React takes over
const bootOverlay = document.getElementById('lp-boot');
if (bootOverlay) bootOverlay.remove();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <GamificationProvider>
          <AppConfigProvider>
            <FilterProvider>
              <SeoManager />
              <StorageImageRecovery />
              <App />
            </FilterProvider>
          </AppConfigProvider>
        </GamificationProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

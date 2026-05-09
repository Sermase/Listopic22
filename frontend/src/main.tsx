import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { initSentry } from './lib/sentry'
import './index.css'
import App from './App.tsx'

initSentry();
import { AppConfigProvider } from './context/AppConfigContext';
import { SeoManager } from './components/SeoManager';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { FilterProvider } from './context/FilterContext';
import { GamificationProvider } from './context/GamificationContext';
import { StorageImageRecovery } from './components/StorageImageRecovery';
import ErrorBoundary from './components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const canRegisterServiceWorker = 'serviceWorker' in navigator
  && (
    window.isSecureContext
    || window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
  );
const isLocalDevelopmentHost = window.location.hostname === 'localhost'
  || window.location.hostname === '127.0.0.1';

if (canRegisterServiceWorker) {
  window.addEventListener('load', () => {
    if (isLocalDevelopmentHost) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch((error) => {
          console.error('Service worker unregister failed:', error);
        });
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => registration.update())
      .catch((error) => {
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
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <GamificationProvider>
              <AppConfigProvider>
                <FilterProvider>
                  <SeoManager />
                  <StorageImageRecovery />
                  <App />
                </FilterProvider>
              </AppConfigProvider>
            </GamificationProvider>
          </ThemeProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

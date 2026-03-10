import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppConfigProvider } from './context/AppConfigContext';
import { SeoManager } from './components/SeoManager';
import { AuthProvider } from './context/AuthContext';
import { FilterProvider } from './context/FilterContext';
import { StorageImageRecovery } from './components/StorageImageRecovery';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AppConfigProvider>
        <FilterProvider>
          <SeoManager />
          <StorageImageRecovery />
          <App />
        </FilterProvider>
      </AppConfigProvider>
    </AuthProvider>
  </React.StrictMode>,
)

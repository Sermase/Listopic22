import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppConfigProvider } from './context/AppConfigContext';
import { SeoManager } from './components/SeoManager';
import { AuthProvider } from './context/AuthContext'; // Assuming AuthProvider comes from AuthContext

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AppConfigProvider>
        <SeoManager />
        <App />
      </AppConfigProvider>
    </AuthProvider>
  </React.StrictMode>,
)

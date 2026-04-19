import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['jspdf'],
  },
  esbuild: {
    // Strip console.* and debugger statements in production builds. Keep
    // console.error and console.warn so real issues still surface (and are
    // captured by Sentry/Crashlytics when enabled).
    drop: mode === 'production' ? ['debugger'] : [],
    pure: mode === 'production'
      ? ['console.log', 'console.debug', 'console.info', 'console.trace']
      : [],
  },
  build: {
    sourcemap: mode !== 'production',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/analytics'],
          'ui-vendor': ['lucide-react']
        }
      }
    }
  }
}))

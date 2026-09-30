import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['jspdf', 'html2canvas', 'leaflet', 'react-leaflet', 'fast-average-color', 'lucide-react'],
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
        // Solo se agrupan librerías que se cargan siempre (o juntas). La forma
        // de objeto anterior forzaba chunks como pdf-vendor, que acababa
        // precargado en todas las visitas porque Vite metía ahí su helper de
        // importación dinámica. El resto de librerías (jspdf, html2canvas,
        // algolia...) viajan con la ruta o el componente diferido que las usa.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
          if (/[\\/]node_modules[\\/](firebase|@firebase)[\\/]/.test(id)) return 'firebase-vendor';
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return 'ui-vendor';
          if (/[\\/]node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/.test(id)) return 'map-vendor';
          return undefined;
        }
      }
    }
  }
}))

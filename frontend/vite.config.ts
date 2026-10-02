import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Falla el build si dos chunks se importan entre sí (directa o
 * indirectamente). Un ciclo así hace que uno se evalúe antes que el otro y
 * deja React como `undefined` al arrancar («Cannot read properties of
 * undefined (reading 'createContext')», visto en Android). Mejor un build
 * roto que una app en blanco.
 */
function noChunkCycles(): Plugin {
  return {
    name: 'listopic:no-chunk-cycles',
    apply: 'build',
    generateBundle(_options, bundle) {
      const graph = new Map<string, string[]>()
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === 'chunk') graph.set(fileName, output.imports)
      }
      const state = new Map<string, 'visiting' | 'done'>()
      const stack: string[] = []
      const visit = (file: string) => {
        state.set(file, 'visiting')
        stack.push(file)
        for (const dep of graph.get(file) ?? []) {
          if (state.get(dep) === 'visiting') {
            const cycle = [...stack.slice(stack.indexOf(dep)), dep].join(' → ')
            this.error(`Ciclo de importación entre chunks: ${cycle}. Revisa manualChunks en vite.config.ts.`)
          }
          if (!state.has(dep)) visit(dep)
        }
        stack.pop()
        state.set(file, 'done')
      }
      for (const file of graph.keys()) if (!state.has(file)) visit(file)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), noChunkCycles()],
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
        // Solo se agrupan librerías que se cargan siempre y que no dependen de
        // otro chunk manual: React (sin dependencias), Firebase (sin React) e
        // iconos (solo dependen de React). El resto (Leaflet, jspdf,
        // algolia...) lo reparte Vite con la ruta o el componente diferido
        // que lo usa.
        //
        // Leaflet / react-leaflet NO van en un chunk propio: Rollup metía a
        // veces en él su módulo auxiliar de CommonJS (lo usan React y Leaflet),
        // react-vendor pasaba a importar de map-vendor y map-vendor de
        // react-vendor. Con ese ciclo, react-leaflet se evaluaba antes que
        // React y la app no arrancaba en Android. Depende del orden en que se
        // procesan los módulos, así que podía pasar en una máquina y no en otra.
        manualChunks(id: string) {
          // El auxiliar de CommonJS va siempre con React, que no importa nada:
          // así ningún chunk que dependa de React tiene que ser importado por él.
          if (id.includes('commonjsHelpers')) return 'react-vendor';
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
          if (/[\\/]node_modules[\\/](firebase|@firebase)[\\/]/.test(id)) return 'firebase-vendor';
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return 'ui-vendor';
          return undefined;
        }
      }
    }
  }
}))

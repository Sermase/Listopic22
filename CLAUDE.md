# Listopic — reglas del proyecto

Las reglas generales de Ser (flujo de trabajo, seguridad, criterio de diseño) están en `~/.claude/CLAUDE.md`. Aquí solo va lo propio de Listopic.

## Qué es
App social de comida y sitios, parte de IstariCore. Web (Firebase Hosting) y Android (Capacitor).

## Estructura
- `frontend/` — React 19 + Vite 7 + TypeScript 5.9 + Tailwind 4 (`@tailwindcss/postcss`). Tests con Vitest.
- `functions/` — Cloud Functions.
- `e2e/` — Playwright contra los emuladores de Firebase y un Algolia simulado (`run.mjs` lo arranca todo y siembra datos).
- `firestore-tests/` — tests de las reglas de Firestore en el emulador.
- `firestore.rules`, `storage.rules`, `firestore.indexes.json` — producción. No tocar sin aprobación.

## Comandos
- Frontend: `cd frontend && npx tsc -b && npm test && npm run build`
- E2E: `cd e2e && npm test` (emuladores; viewport móvil 390×844)
- Reglas: `cd firestore-tests && npm test`

## Despliegue (cuidado)
- Un push o merge a `main` despliega en Firebase Hosting (`.github/workflows/firebase-hosting-merge.yml`).
- Trabaja siempre en una rama y abre PR. Nunca hagas push a `main`, merge, ni `firebase deploy`, sin permiso explícito en esa conversación.

## Sistema visual (ya existe: extiéndelo, no lo dupliques)
- Tokens en `frontend/src/index.css`: `@theme` (fuentes `--font-sans` Manrope, `--font-display` Space Grotesk, colores `--color-brand-*`) y variables `--lt-*` (texto, acento, peligro…), con temas en `lib/themeAmbience.ts`.
- Kit propio en `frontend/src/components/ui/` (Button, Card, IconButton, Modal, Tabs) y `cn()` en `lib/utils.ts`. Úsalo antes de crear componentes nuevos.
- Las animaciones actuales son keyframes CSS con su bloque `prefers-reduced-motion`. Cualquier animación nueva también lo respeta.
- No instales shadcn/ui, Magic UI ni Aceternity de golpe: crearían un segundo sistema de componentes. Si hace falta un componente que el kit no tiene (Sheet, Dropdown, Popover…), proponlo primero. Si se aprueba, adáptalo a los tokens `--lt-*` y añádelo a `components/ui/`.
- No añadas más familias tipográficas: ya hay demasiadas cargadas.

## Piezas sensibles
- Mapas: Leaflet + react-leaflet con teselas CartoDB. No cambiar de proveedor sin consultar. No crear un chunk manual para Leaflet: ver el comentario de `manualChunks` en `vite.config.ts` (provocó una app en blanco en Android).
- Geocodificación inversa vía Firestore: no sustituirla por llamadas de pago.
- Google Places Photos es el mayor coste de facturación: nada de llamadas nuevas a Places sin caché, y avisa siempre del impacto en coste.
- Algolia: la clave de la web solo puede buscar (`npm run check:algolia-key`).
- Cuenta IstariCore compartida entre apps: no romper el login común.

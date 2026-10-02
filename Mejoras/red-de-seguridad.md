# Red de seguridad y coherencia de ranking (02/10/2026)

Tres bloques: **A** Sentry, **B** E2E en CI, **C** ranking coherente entre pantallas.

---

## A. Sentry (web y Android)

### Qué hace

| Pieza | Dónde | Qué |
|---|---|---|
| SDK | `frontend/src/lib/sentry.ts` | `@sentry/react` 11. Errores de ejecución, rechazos sin capturar, `ErrorBoundary`. Trazas al 10 % solo en producción. Sin Replay. |
| Capturador de arranque | `frontend/index.html` (primer `<script>`) | Antes que cualquier módulo. Si un chunk falla al evaluarse (el fallo de Android de `map-vendor`), si falta un chunk propio (404) o hay un rechazo antes de que arranque el SDK, lo envía directamente a Sentry (`fase: arranque`). Cuando el SDK arranca, deja de enviar. Máximo 5 por carga. |
| Limpieza | `frontend/src/lib/sentryScrub.ts` (+ tests) | Sin usuario ni IP, sin cookies ni cuerpos, de las cabeceras solo `User-Agent`. Correos → `[correo]`. Parámetros `token`, `code`, `oobCode`, `apiKey`, `email`… → `[filtrado]`. |
| Entornos | workflows | PR → `preview`; `main` → `production`; `npm run dev` → no envía nada. Etiqueta `app_platform`: `web` / `android` / `ios`. |
| Versión | `vite.config.ts` | `listopic@<commit>` (GITHUB_SHA en CI, `git` en local). |
| Source maps | `vite.config.ts` + workflows | Solo si hay `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`: se generan ocultos, se suben (con *debug IDs*, valen igual para `https://listopic.es` que para `https://localhost` de Android) y se borran. El paso «No se publican source maps» borra cualquier `.map` antes de desplegar. Si Sentry no responde, el build sigue (sin mapas). |

Sin `SENTRY_DSN`, todo queda apagado: el comportamiento es el de antes.

### Verificado (receptor local que hace de Sentry; no salió nada a internet)

| Caso | Llega | Detalle |
|---|---|---|
| Error provocado en ejecución | ✅ 1 evento (SDK) | `Prueba Sentry para [correo]`, URL `?email=[filtrado]&oobCode=[filtrado]`, sin `user`, solo `User-Agent`. |
| Fallo de arranque tipo `map-vendor` en web | ✅ 1 evento (arranque) | `TypeError: Cannot read properties of undefined (reading 'createContext')` en `react-vendor-….js`, con su debug ID. |
| El mismo fallo con origen Android `https://localhost` | ✅ 1 evento | `app_platform: android`. |
| Falta un chunk propio (404) | ✅ | `ChunkLoadError: No se pudo cargar /assets/…`. |
| Arranque normal | ✅ 0 eventos | Una fuente externa bloqueada (Google Fonts) no cuenta. |
| Subida de source maps con Sentry caído | ✅ build OK | 0 `.map` en `dist`, debug IDs en los 101 chunks. |

El error de prueba solo existió en el script de verificación. No queda nada en el código.

### Pasos manuales (tuyos)

1. **Crear el proyecto** en sentry.io: plataforma *React*. Copia el **DSN**. Es público por diseño (va dentro del JS), pero no se escribe en el código.
2. **Ajustes del proyecto → Security & Privacy:**
   - activa *Prevent Storing of IP Addresses* y *Data Scrubber*;
   - en *Allowed Domains* pon `listopic.es`, `*.web.app` (vistas previas) y `localhost` (Android).
3. **Token para source maps:** *Settings → Developer Settings → Organization Tokens*. Crea uno (por defecto trae `org:ci`). Se ve una sola vez.
4. **GitHub → Settings → Secrets and variables → Actions:**
   - Secrets: `SENTRY_DSN` (el DSN) y `SENTRY_AUTH_TOKEN` (el token).
   - Variables: `SENTRY_ORG` (el *slug* de la organización) y `SENTRY_PROJECT` (el *slug* del proyecto).
5. **Comprobar en preview:** abre la URL de vista previa de la PR. En la consola de DevTools escribe:
   ```
   setTimeout(() => { throw new Error('Prueba Sentry') })
   ```
   Debe aparecer en Sentry con `environment: preview` y la pila con nombres de archivo originales (`src/...`). Después marca el issue como *Resolved*.
6. **Android:** el build lo haces tú en local.
   - Pon el DSN en `frontend/.env.local` (`VITE_SENTRY_DSN=…`; ese archivo nunca se sube).
   - Para que suban los mapas, exporta el token **solo en la terminal**:
     ```
     cd frontend
     SENTRY_AUTH_TOKEN=… SENTRY_ORG=… SENTRY_PROJECT=… npm run build
     npx cap sync android
     ```
   - Comprueba con el móvil conectado: `chrome://inspect` → consola → el mismo `setTimeout`. Debe salir con `app_platform: android`.
   - Para un build de pruebas que no ensucie producción: `VITE_SENTRY_ENVIRONMENT=android-dev npm run build`.

---

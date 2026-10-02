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
## B. E2E en cada PR

Job `e2e` del workflow de PR. No usa secretos ni toca producción.

| Pieza | Qué |
|---|---|
| `e2e/run.mjs` | Lanza todo en orden: build de la web en modo emuladores (`e2e/.dist`), Algolia simulado, emuladores de Auth, Firestore y Functions (`demo-listopic`), sembrado y Playwright. |
| `e2e/mock-algolia.mjs` | Algolia en memoria. Las Functions **reales** escriben en él (`ALGOLIA_EMULATOR_HOST`, que solo se lee dentro del emulador) y la web lee de él (Playwright intercepta `*.algolia.net`). Ordena con el `customRanking` de cada índice o réplica. |
| `e2e/seed.mjs` | Siembra el caso compartido del ranking con los triggers apagados. Después recalcula las Listas (`adminRecalculateAllLists`) y **reindexa Algolia** (`adminBackfillAlgolia`) con las Functions reales. |
| `e2e/tests/` | 15 pruebas. Cualquier error de JS o de consola hace fallar la prueba. Se corta todo lo externo; Google Places se simula. |

**Qué cubre:**
- Arranque en web.
- Arranque con el origen de Capacitor (`https://localhost`, UA de Android) en `/`, Buscar y Lista.
- Home con mapa.
- Lista: ranking completo, cambio de zona y mapa.
- Buscar: mismo puesto que la Lista en tres zonas, cambio de zona con el selector y filtro «Bots».
- Inicio de sesión.
- Una valoración nueva de punta a punta.

**Comprobado que la PR falla:**

| Regresión provocada | Resultado |
|---|---|
| `throw` al evaluar el chunk de React | ❌ 4/4 pruebas de arranque (`#root` vacío) |
| `map-vendor` reintroducido con el auxiliar de CommonJS dentro | ❌ el **build** falla: «Ciclo de importación entre chunks: map-vendor → react-vendor → map-vendor» |
| Lo mismo, quitando la guarda del build | ❌ E2E de arranque: `Cannot read properties of undefined (reading 'createContext')`, el error de Android |
| Normal, dos pasadas seguidas | ✅ 30/30 (≈1 min) |

**En local:** `cd e2e && npm ci && npm test`. Hace falta Java 21 y que `functions/` tenga `npm ci`. Para una sola prueba: `node run.mjs --no-build -- -g "Buscar"`.

---

## C. Ranking coherente

### C.1 De dónde salía cada número (antes)

| Pantalla / valor | Fuente | Bots | Minilista privada | Agrupación | Desempate |
|---|---|---|---|---|---|
| Lista: nota, nº y «#n» | cliente (`useListDetails`, `ListPage`) | fuera | fuera | `placeId_nombre` (minúsculas) | orden de llegada |
| Ficha del elemento / del sitio: «#n en zona» | cliente (`rankListElements`) | fuera | fuera | igual que la Lista | orden de llegada |
| Buscar: nota, nº, «#n en zona» | Algolia `grouped_items` (Functions) | **dentro** | fuera | **`nombre del sitio\|nombre`** (una cadena = 1) | **media redondeada a 1 decimal**, orden interno de Algolia |
| Tarjeta y cabecera de la Lista: `reviewCount`, `averageRating`, `criteriaAverages`, `itemCount` | `list-metrics` (Functions) | dentro | **dentro** | `nombre del sitio\|nombre` | — |
| Valoración sin nota | — | — | — | Lista y Buscar: **cuenta como 0** | — |
| Ciudad del sitio | — | — | — | Lista: cae a la «locality» de Google; Buscar: **no** | — |

### C.2 Inconsistencia demostrada (antes de corregir)

El mismo caso, `frontend/src/lib/listElements.vectors.json`, se pasó por el código de entonces:
- 25 valoraciones;
- bots;
- una Minilista privada y una pública;
- una cadena con dos locales;
- «Bravás» frente a «Bravas»;
- una valoración sin nota;
- empates.

| # | Esperado (regla única) | Lista antes | Buscar (Algolia) antes |
|---|---|---|---|
| 1 | `p_vll3_bravas` 8.04 · 5 | `p_vll1_bravas` 8.75 · 2 | `Bar Uno\|bravas` 8.8 · 2 |
| 2 | `p_mad_bravas` 8.0 · 5 | `p_vll3_bravas` 8.04 · 5 | `Bar Tres\|bravas` 8 · 5 |
| 3 | `p_chain1_bravas` 9.5 · 1 | `p_mad_bravas` 8 · 5 | `Bar Madrid\|bravas` 8 · 5 |
| 4 | `p_vll1_bravas` 7.8333 · 3 | `p_chain1_bravas` 9.5 · 1 | `Bar León\|patatas` 9 · 1 |
| 5 | `p_vll2_bravas` 7.5 · 1 | `p_mad2_bravas` 7 · 1 | `Lizarrán\|bravas` 7.3 · 2 |
| 6 | `p_leon_bravas` 7.0 · 1 | `p_med_bravas` 7 · 1 | `Bar León\|bravas` 7 · 1 |
| 7 | `p_mad2_bravas` 7.0 · 1 | `p_vll1_croquetas` 7 · 1 | `Bar Medina\|bravas` 7 · 1 |
| 8 | `p_med_bravas` 7.0 · 1 | `p_leon_bravas` 7 · 1 | `Bar Sol\|bravas` 7 · 1 |
| 9 | `p_vll1_croquetas` 7.0 · 1 | `p_vll1_bravás` 6 · 1 | `Bar Uno\|croquetas` 7 · 1 |
| 10 | `p_chain2_bravas` 5.0 · 1 | `p_chain2_bravas` 5 · 1 | `Bar Dos\|bravas` 6.9 · 4 |
| 11 | — | `p_vll2_bravas` 3.75 · 2 | `Bar Uno\|bravás` 6 · 1 |

Además:
- Buscar guardaba «Bravás» y «Bravas» del mismo bar con el mismo `objectID`, así que uno pisaba al otro.
- «Bar Tres» quedaba sin ciudad en Buscar.
- Los contadores de la Lista madre contaban la valoración privada: 25 valoraciones con nota media 8,03 y el criterio `picante`, que es de la Minilista. Lo que se ve en la página son 21 valoraciones de personas.

### C.3 Reglas ahora (iguales en la Lista, la ficha y Buscar)

- **Privacidad:**
  - En una Lista pública solo cuentan las valoraciones públicas.
  - Las de una Minilista privada no suman en nota, contador ni ranking de la madre. En la propia Minilista privada siguen contando.
  - `criteriaAverages` solo incluye los criterios de la Lista.
- **Bots:**
  - Fuera de la nota, del nº y del puesto.
  - Un elemento solo de bots se oculta por defecto, tanto en la Lista como en Buscar.
  - En la Lista aparece con «Mostrar bots»; en Buscar, con el filtro «Bots».
- **Pesos y fórmula:**
  - `reviewScoreForList`, sin cambios: en la madre, la valoración de una Minilista se recalcula con los criterios y pesos de la madre.
  - Bayes con C=7 y m=3, sin cambios.
  - Una valoración sin nota no cuenta.
- **Orden (`compareElementsByRank`):**
  1. posición con 4 decimales;
  2. más valoraciones;
  3. clave del elemento.

  Algolia hace lo mismo con `desc(rankingScore), desc(reviewCount), asc(listRank)`.
- **Elemento = sitio + nombre normalizado:** sin tildes, mayúsculas ni signos.
- **Zona:** la ciudad cae a la «locality» de Google; la CCAA y el país se normalizan.
- **Buscar solo muestra «#n en zona» cuando lo que se ve es exactamente ese ranking:**
  - con la Lista elegida;
  - orden por nota;
  - sin texto;
  - sin otros filtros;
  - sin radio;
  - sin cerrados.

  Con radio y orden por nota, el radio solo filtra; antes ordenaba por cercanía.
- **La Lista solo muestra «#n» ordenando por nota.**
- **Reconstruir una Lista en Algolia ya no la vacía antes.** Antes quedaba sin resultados un instante en cada valoración; lo destapó el E2E.

**Verificado:**
- Vectores compartidos: 4 tests en la web y 8 en Functions.
- Reindexado con las Functions reales en el emulador: las 6 zonas del caso, en Buscar, coinciden con la Lista.
- E2E en la interfaz.
- Contadores tras el recálculo:
  - madre: 24 valoraciones, criterios `sabor,salsa`;
  - Minilista privada: conserva su valoración (1, nota 10).

### C.4 Lo que sigue distinto (a propósito o pendiente de decidir)

| Qué | Por qué / propuesta |
|---|---|
| Nota de la cabecera del elemento y del sitio | Es una media **entre todas las Listas** (nota global provisional), no el puesto en una Lista: incluye bots, no recalcula con los criterios de la madre y lee como mucho 100 valoraciones. Si queréis que siga las mismas reglas, es una decisión de producto. |
| `places.averageRating` / `reviewsCount` | **Resuelto** (ver `nota-publica-sitio.md`): solo públicas, sin bots, y la nota de críticos aparte. El doble trigger que desviaba ±1 también está quitado. |
| `reviewCount` / `averageRating` de la Lista | Cuentan las valoraciones de bots: son contenido de la Lista. Solo se ha quitado lo privado. |
| Cambio de nombre, ciudad o cierre de un sitio | No reconstruye `grouped_items` hasta la siguiente valoración de esa Lista. |
| Carta del sitio (Business Pro) | Una valoración sin nota da `NaN` en la media del plato. Es un bug pequeño fuera de este bloque. |
| Formulario de valoración | Llama a Google Place Details en **cada** valoración, aunque el sitio ya exista. Es coste de SKUs; lo destapó el E2E. |

### C.5 Impacto en los datos y pasos

- **Valoraciones:** no se tocan. Los backfills de pesos y visibilidad siguen cerrados.
- **Algolia `grouped_items`: hay que reindexar.**
  - Cambian los `objectID` (ahora por sitio) y entran `listRank` y `botOnly`.
  - Dos locales de una cadena pasan a ser dos registros, y las variantes de nombre se juntan en uno.
  - **Los elementos valorados solo por bots (p. ej. ListopIA) dejan de verse en Buscar por defecto.** Siguen con el filtro «Bots», igual que en la Lista.
  - Los ajustes del índice (customRanking, réplicas) se aplican solos en la primera escritura tras desplegar.
- **Firestore, documentos de Lista:**
  - `reviewCount`, `averageRating`, `criteriaAverages` e `itemCount` cambian en las madres públicas con valoraciones de Minilistas privadas, y en las que heredaban criterios de Minilistas.
  - Se recalculan solos con la siguiente valoración de cada Lista, o todas a la vez con el script, simulando primero.
- **Orden de despliegue:** no importa para la seguridad. `NOT botOnly:true` deja pasar los registros sin el campo, y Algolia filtra booleanos sin declararlos como faceta. Aun así, conviene desplegar las Functions y reindexar en cuanto se publique la web.

**Pasos:**
1. Fusionar.
2. `cd functions && npm ci && npm test` y `firebase deploy --only functions --project listopic`.
3. Reindexar Buscar: Developer → Algolia Sync → «Configurar índices/réplicas» y después «Sincronizar TODO». También vale `adminBackfillAlgolia` con `{ "collectionName": "grouped_items" }`.
4. Contadores de las Listas:
   ```
   cd functions
   node scripts/recalc-list-metrics.js                 # simulación: revisa la tabla
   node scripts/recalc-list-metrics.js --apply --expect=N
   ```
   Para deshacer: `node scripts/restore-backup.js backups/recalc-list-metrics-….json --apply`.
5. Comprobar en producción una Lista con Minilista privada: la tarjeta, la página y Buscar en una ciudad deben dar el mismo «#n».

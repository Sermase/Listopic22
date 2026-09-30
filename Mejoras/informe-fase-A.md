# Informe FASE A + B0 — Listopic

Rama: `Mejoras-Opus-5.5-29-09-2026` (desde `3674b8b`). Fecha: 30/09/2026.

**Nada se ha desplegado.** Hosting solo se publica cuando se fusione en `main`
(GitHub Actions); lo decide el dueño. Reglas, índices, Cloud Functions, migraciones y
scripts están **preparados, sin desplegar ni ejecutar**. Las consultas a datos reales
de este informe fueron **solo de lectura** y con la clave pública de la web.

Documentos hermanos: `modelo-listopic.md` (notas, ranking, ámbito, nota del sitio) y
`siguiente-fase.md` (B1 y futuro).

---

## 1. Qué se ha hecho

### FASE A (A1–A27, C1–C6, C8–C13)

| Bloque | IDs | Resumen | Commit |
|---|---|---|---|
| Tests de reglas | — | Suite nueva con el emulador: 46 casos (ataques + flujos reales de la app) | `76799fa` |
| Seguridad (reglas) | A1, C1–C5 | Listas privadas solo para dueño/editores/invitados/jefe; editor no puede apropiarse de la lista; métricas, XP, insignias y notas solo del servidor; chats sin expulsiones; contadores ±1 | `2a631fa` |
| Seguridad (Functions) | A2, A3, A4, A12 | 9 endpoints heredados que el frontend no usa pasan a exigir `jefe`; `syncPlaceStatusFromGoogle` solo `jefe`; vistas previas no filtran listas privadas; métricas vuelven a 0 al borrar la última valoración | `252f4e1` |
| Fallos del frontend | A5–A11, A13, A14 | `/debug` fuera; buscador de sitios no envía el formulario; Guardar fiable (transacción, sin doble conteo, errores visibles); «Quiero ir → Ya fui» por `placeId`; paso de criterio en Minilistas; consultas con límite y visibilidad; búsqueda con estados de carga/error; rutas `/s/*` y página 404 | `33c6b4d` |
| Mapas | — | CARTO empezó a exigir clave y los mapas de producción no se veían: teselas de Esri | `2b383f5` |
| Rendimiento | A15–A20, C8, C11 | Trozos del build, carga diferida (formulario, compartir, mapas), Google Maps bajo demanda, caché larga de estáticos y fotos, PNG optimizados, fuentes con `<link>`, Home sin spinner de sesión | `4d0ab68` |
| Scroll y errores | A21–A25, C9, C10, C12 | Restaurar scroll al volver; recarga automática si falta un trozo tras desplegar; pantalla de error útil; Algolia sin credenciales no tumba la página; 28 `alert/confirm` → avisos y diálogo propio; service worker corregido; presencia de chat retirada | `7cf8eff` |
| Limpieza y CI | A26, A27, C6, B1 (código) | El cliente deja de escribir contadores (requisito de C2–C4); portadas de lista a Storage (no base64); restos de prototipo; `npm test` y tests de reglas en CI | `92bf92e` |
| Valoración | C13 | Ver B0.1 | `4fc16a0` |

### B0

| ID | Resumen | Commit |
|---|---|---|
| B0.1 | Criterios **sin puntuar** al empezar, todos los que cuentan **obligatorios**, progreso «3 de 5», nota provisional en vivo, extremos con etiqueta, «pop» sutil (respeta movimiento reducido), vibración solo donde ya existía | `4fc16a0` |
| B0.2 | Un solo módulo de notas (web + servidor, mismos vectores); pesos ×0–×3 preparados y apagados; 5.000 casos aleatorios = mismo `overallRating` que antes | `62c174f` |
| B0.3 | En la Lista madre, las valoraciones de Minilista cuentan solo con los criterios de la madre (lectura, sin migración). Servidor preparado: métricas de Minilista mantenidas por el trigger | `62c174f` |
| B0.4 | Vocabulario visible: Minilista, Valoración, Sitio, Elemento, Colecciones (sin renombrar Firestore ni rutas) | `69a9e2a` |
| B0.5 | Vistas Ranking / Mosaico / Mapa y selector de distancia conservados; barra con etiquetas; vista y agrupación recordadas; filtro de bots también en el mapa | `62c174f`, `69a9e2a` |
| B0.6 | Ámbito geográfico documentado | `modelo-listopic.md` §5 |
| B0.7 | Fórmula de ranking centralizada, sin cambiar resultados, con simulación 1/2/5/10/25/100 | `62c174f`, `modelo-listopic.md` §4 |
| B0.8 | Opciones A–E de nota del sitio estudiadas con datos reales | `modelo-listopic.md` §6 |
| B0.9–B0.11 | Sin notas paralelas; Novedades se mantiene; textos nuevos genéricos | — |
| B0.12 | Escala única de color de notas (antes 8), tema claro con tokens (sin `!important` nuevos), controles del mapa visibles, estadísticas del perfil sin desbordarse, criterios en orden estable | `4fc16a0`, `69a9e2a` |

No autorizados y **no hechos**: C7 (reutilizar datos de Google), B2 (valoraciones
privadas fuera de datos públicos), nueva Home o navegación, pesos activos, cambios de
fórmula histórica, nuevo ranking, mapas alternativos, migraciones masivas.

---

## 2. Archivos principales

- **Nuevos**:
  - Web: `frontend/src/lib/{scoring,scoreScale,criteria,listCover,storageCache,chunkErrors}.ts`, `components/{CriterionRating,lazy}.tsx`, `context/ConfirmContext.tsx`, `hooks/{useScrollRestoration,useStoredChoice}.ts`, `pages/NotFoundPage.tsx`, `utils/geo.ts`.
  - Functions: `functions/modules/lib/scoring.js`, `functions/test/scoring.test.js`, `functions/scripts/*.js` (3 scripts, simulación por defecto).
  - Tests de reglas: `firestore-tests/`.
- **Modificados (web)**: `AddReviewForm`, `ListPage`, `PlacePage`, `GroupPage`, `ProfilePage`, `HomePage`, `SearchPage`, `ArchivePage`, `ChatsPage`, formularios de lista/Minilista, tarjetas, `MapView`, `mapUtils`, `EntityHero`, `index.css`, `index.html`, `App.tsx`, `main.tsx`, `sw.js`, `vite.config.ts`.
- **Modificados (servidor)**: `firestore.rules`, `firestore.indexes.json` (+2 índices), `firebase.json` (cabeceras y reescrituras), `functions/modules/{core,reports,ssr-meta,algolia,grouped-aggregator}.js`, `lib/list-metrics.js`, `admin/admin-lists.js`.
- **CI**: `.github/workflows/firebase-hosting-{merge,pull-request}.yml`.

`git diff 3674b8b --stat`: ~92 archivos. Los finales de línea CRLF originales se han
conservado; `git diff --ignore-cr-at-eol` da el mismo resultado.

---

## 3. Tests

| Suite | Antes | Ahora | Cómo se ejecuta |
|---|---|---|---|
| Unitarios web (Vitest) | 53 | **143** ✅ | `cd frontend && npm test` |
| Notas en servidor (`node --test`) | — | **51** ✅ (mismos vectores que la web) | `cd functions && npm test` |
| Reglas de Firestore (emulador) | 14/14 ataques **funcionaban** | **46/46** ✅ | `cd firestore-tests && npm test` (Java 21) |
| TypeScript | ✅ | ✅ | `npx tsc -b` |
| ESLint | 425 problemas | **420**, ninguno nuevo | `npm run lint` |
| Build | ✅ | ✅ | `npm run build` |

Qué fijan los tests nuevos: sin 5 por defecto; tocar sin mover puntúa; opcional ≠
obligatorio; compatibilidad exacta del `overallRating` (5.000 casos); madre vs
Minilista; ranking idéntico a `algolia.js`; «10 con una valoración no supera a 8,5
con diez»; contraste AA de la escala de notas en los cuatro temas; orden estable de
criterios; recordar vista con almacenamiento no disponible.

Comprobación visual: capturas antes y después en móvil (390 px) y escritorio
(1440 px), temas oscuro y claro, de Home, Lista, Sitio, Elemento, Búsqueda, Perfil,
formulario de valoración (vacío, parcial, completo; Lista y Minilista) y 404.
Consola sin errores nuevos (ver §8).

---

## 4. Rendimiento

Tamaño (gzip, medido sobre `dist/`):

| | Antes | Ahora |
|---|---|---|
| JS inicial | 385,5 KB | **264,4 KB** (−31 %) |
| CSS inicial | 30,8 KB | 31,0 KB |
| Extra al abrir Home / Lista / Sitio / Perfil | +131 / +158 / +167 / +172 KB | **+59 / +50 / +85 / +60 KB** |
| Extra Búsqueda | +134 KB | +137 KB (sin cambio relevante) |

Carga medida localmente, build de antes (`3674b8b`) contra build de ahora, mismo
equipo y misma limitación (móvil, 4G lenta 1,6 Mbps/150 ms, CPU ×4, mediana de 3):

| Ruta | FCP antes → ahora | LCP antes → ahora | CLS antes → ahora |
|---|---|---|---|
| Home | 3,98 s → **2,16 s** | 9,25 s → **6,59 s** | 0,047 → 0,079 |
| Lista | 3,96 s → **2,16 s** | 9,10 s → **7,22 s** | 0,048 → 0,048 |
| Sitio | 3,96 s → **2,14 s** | 7,38 s → **5,69 s** | 0,031 → 0,031 |

Límites de la medida: las imágenes y los datos vienen de producción a través del
proxy del entorno, así que el LCP depende de la red real. Lo comparable es la
diferencia entre builds, no el valor absoluto. El CLS de la Home sube algo (sigue por
debajo de 0,1, «bueno»): probablemente porque la Home ya no espera a la sesión (C11).
Vigilar en producción.

---

## 5. Fallos corregidos y comprobados

- **Mapas en blanco en producción**: CARTO respondía «API KEY REQUIRED». Ahora Esri. Verificado desde este entorno; **confirmar en un móvil real**.
- **Seguridad**: 14 ataques reproducidos con el emulador (leer listas privadas por seguir, editor que se apropia de una lista, métricas o XP falsos, Business Pro gratis, expulsar de chats…). Todos bloqueados con las reglas nuevas.
- **Métricas de Minilista**: nadie las mantenía en el servidor; y el botón «Recalcular TODAS las Listas» de Developer ponía sus contadores a 0. Corregido en Functions (sin desplegar).
- **Nota inventada**: el formulario empezaba con un 5 en cada criterio, y una lista sin criterios que contaran guardaba un 5. Corregido.
- **Orden de criterios aleatorio** entre cargas: corregido (`order` + orden por nombre).
- **Media por criterio** mal calculada cuando alguien no había puntuado ese criterio: corregido.
- **Filtro de bots** que no se aplicaba al mapa de la Lista: corregido.
- **Guardar en Colecciones**: doble conteo y errores silenciosos. Corregido.
- **Tema claro**: título y etiquetas del hero invisibles, texto sobre fotos oscurecido, botón de ubicación del mapa invisible, «Añadir fotos» ilegible, estadísticas del perfil desbordadas. Corregido con tokens.
- Resto: ver tabla §1.

---

## 6. Preparado y sin desplegar — orden y comandos exactos

Requisitos: `firebase-tools` con sesión del proyecto `listopic`; para los scripts,
una cuenta de servicio (`GOOGLE_APPLICATION_CREDENTIALS`).

```bash
# 1) Cloud Functions (seguridad A2–A4, métricas A12, notas y Minilistas B0.3)
cd functions && npm ci && npm test
firebase deploy --only functions --project listopic

# 2) Hosting: fusionar la rama en main → GitHub Actions publica.
#    Esperar a que esté publicado (el cliente nuevo ya no escribe contadores).

# 3) Reglas de Firestore (solo DESPUÉS del paso 2)
cd firestore-tests && npm ci && npm test        # 46/46
firebase deploy --only firestore:rules --project listopic

# 4) Índices: exportar primero lo que hay en producción y comparar
firebase firestore:indexes --project listopic > /tmp/prod-indexes.json
#    Revisar diferencias con firestore.indexes.json y luego:
firebase deploy --only firestore:indexes --project listopic
#    Si pregunta por borrar índices que no están en el archivo: responder NO.

# 5) Scripts de datos: SIEMPRE primero en simulación (sin --apply)
cd functions
GOOGLE_APPLICATION_CREDENTIALS=/ruta/sa.json node scripts/migrate-base64-list-covers.js
GOOGLE_APPLICATION_CREDENTIALS=/ruta/sa.json node scripts/recount-collection-items.js
GOOGLE_APPLICATION_CREDENTIALS=/ruta/sa.json node scripts/backfill-storage-cache-control.js
#    Revisar la salida; si es correcta, repetir cada uno con --apply.

# 6) Recalcular métricas de Listas y Minilistas existentes:
#    Developer → «Recalcular TODAS las Listas» (ahora usa el cálculo único).
```

Por qué este orden: las reglas nuevas rechazan escrituras de contadores que la web
antigua todavía hace. Si las reglas van antes que Hosting, esas escrituras fallan.
Fallarían en silencio, pero fallarían. Las versiones antiguas de la app Android
seguirán intentándolo (ya están en `catch`, sin romper nada).

---

## 7. Riesgos y decisiones pendientes

| Tema | Riesgo / decisión |
|---|---|
| **C1** (cambio visible) | Quien sigue a alguien deja de ver sus listas privadas. Para compartir una privada hay que invitar (Lector / Colaborador). Ya alineado con el diseño documentado |
| Proveedor de mapas | Esri funciona hoy sin clave, pero no hay contrato: puede cambiar como CARTO. Ver `siguiente-fase.md` §2.2 |
| Valoración obligatoria | Publicar requiere puntuar todos los criterios que cuentan: más fricción en listas con muchos criterios. Medir abandono del formulario |
| Minilistas antiguas | Si comparten pocos criterios con la madre, cuentan en la madre solo por esos (`modelo-listopic.md` §8.1) |
| Pesos | Preparados y apagados. Falta decidir si se recalculan las notas guardadas (§8.2) |
| Ranking | La Lista sigue dejando que una valoración de 10 encabece; la búsqueda premia demasiado el volumen (§4.2). Pendiente de aprobar para B1 |
| Vocabulario | «Reseña» → «Valoración» en la web; las notificaciones del servidor aún dicen «reseña» |
| Índices | El archivo puede no coincidir con producción: exportar antes de desplegar (paso 4) |
| CLS de la Home | Ligeramente peor (0,079); vigilar |

---

## 8. Hallazgos nuevos

- Solo 17 de 99 sitios con valoraciones públicas tienen más de una. Con tan pocos datos, las opciones de nota del sitio A, B, C y E dan casi lo mismo (`modelo-listopic.md` §6).
- La única Minilista pública con criterios extra («Croquetas pucelanas») se creó con criterios de la madre que ya no existen. Solo comparte «Sabor».
- Consultas de listas públicas por `isPublic` + `createdAt` sin índice en producción (aviso en consola de la Home). Índices añadidos al archivo.
- Perfil ajeno: «Listas 0» y error de permisos al leer `followingLists` sin sesión. **Ya pasaba antes**; no es regresión.
- `avgScore` y `averageRating` conviven como dos campos de nota de lista. La tarjeta de lista lee el antiguo; el recálculo ahora rellena los dos.
- Finales de línea mezclados CRLF/LF en el repo (fácil de romper sin querer). Propuesta de `.gitattributes` en `siguiente-fase.md`.

---

## 9. Siguientes pasos

1. Revisar la rama y fusionar en `main` cuando se quiera publicar la web.
2. Desplegar según §6 (Functions → Hosting → reglas → índices → scripts en simulación).
3. Probar en un móvil real: mapas, valorar una Lista y una Minilista, guardar en Colecciones, tema claro.
4. Decidir las preguntas de `modelo-listopic.md` §8 (ranking, pesos, criterios editables, ámbito).
5. Arrancar B1 en el orden de `siguiente-fase.md` §4.

# Consolidación de reseñas — root `reviews/` → `lists/{listId}/reviews`

Fecha: 2026-07-03 · Rama: `claude/app-review-architecture-pws4e4`

## Contexto y decisión

Históricamente las reseñas viven en **dos** sitios:

- `lists/{listId}/reviews/{reviewId}` — la ruta que escribe la app actual (canónica).
- `reviews/{reviewId}` (raíz) — residuo de la app React antigua; **nadie escribe ahí ya**
  (AddReviewForm incluso borra la copia root al editar).

Esa dualidad obligaba a todos los lectores a hacer doble query + dedupe, y a
`usePlaceDetails` a un fan-out de hasta ~80 queries por lugar.

**Decisión**: la canónica es la subcolección anidada (es donde apuntan todos los
triggers de agregados, gamificación y Algolia). La colección raíz se migra hacia
dentro y queda vacía. NO se mueven las reseñas a `places/…`: la lectura rápida
por lugar la resuelven los agregados (`places/{placeId}/items` + una única query
de collection group), sin duplicar documentos.

Nota clave de Firestore: `collectionGroup('reviews')` incluye **también** la
colección raíz `reviews/` (agrupa todas las colecciones con ese nombre). Por eso
los lectores basados en collection group funcionan igual antes, durante y
después de la migración.

## Qué se ha cambiado en el código

| Pieza | Cambio |
|---|---|
| `functions/modules/reviews-consolidation.js` | Nuevo. Callables `adminCountRootReviews`, `adminConsolidateRootReviews` (dry-run/migración paginada y reanudable) y `adminRecountReviewCounters`. |
| `functions/index.js` | Exporta el módulo nuevo. |
| `functions/modules/canonical-items.js` | Eliminada la query root redundante: una sola collectionGroup con dedupe (prefiere la copia anidada). |
| `frontend/src/hooks/usePlaceDetails.ts` | El fan-out (3 queries de listas + hasta 80 subqueries + query root) se sustituye por **una** query `collectionGroup('reviews').where('placeId','==',X).limit(100)`, con dedupe root/anidada y filtro de `visibility: 'private'`. |
| `frontend/src/components/developer/ReviewsConsolidationCard.tsx` | Nueva tarjeta en Developer → Mantenimiento con el flujo Auditar → Migrar → Recontar. |
| `firestore.indexes.json` | Añadido `fieldOverride` de `reviews.placeId` con scope `COLLECTION_GROUP` (las functions ya usaban esa query; el índice existía solo en producción, creado a mano). |

## Qué hace la migración (`adminConsolidateRootReviews`)

Por cada documento de `reviews/` (páginas de 50, cursor `startAfterId`):

1. **Resuelve la lista destino**: `listId` si la lista existe; si no, vía
   `sublistId` → `parentListId` de la sublista (o la propia sublista). Sin
   destino → se marca `rootMigration.status = 'orphan'` y NO se borra.
2. **Si ya existe** `lists/{listId}/reviews/{mismoId}` (copia duplicada): se
   mueven las subcolecciones que hubiera bajo la root y se borra el doc root.
   La anidada gana.
3. **Si no existe**: se crea la anidada con el mismo ID, normalizando campos
   (`userId ← userId|authorId`, `userTags ← userTags|tags`, `listId` resuelto)
   y marcando `migratedFromRoot: true`. Se mueven `reactions`/`comments` y se
   borra el doc root.

La operación es **idempotente y reanudable**: relanzarla no duplica nada.

### Efecto en triggers y contadores

- La creación anidada dispara `updateAggregatesOnReviewChange` (+1 en
  `lists.reviewCount`, `users.reviewsCount`, `places.reviewsCount`) y el borrado
  root **no** los decrementa → tras migrar, los contadores quedan inflados.
- Por eso el paso 3 es obligatorio: `adminRecountReviewCounters` recalcula desde
  las reseñas reales `lists.reviewCount`, `users.reviewsCount` + `photosCount`
  y `places.reviewsCount` + `averageRating` (mismo criterio que
  `updatePlaceAggregates`). Solo actualiza entidades con ≥1 reseña; las de cero
  reseñas no las toca (no les afecta la migración).
- `updatePlaceAggregates` (trigger root) y los rebuilds de canonical-items /
  grouped-items de Algolia son recálculos completos idempotentes: se disparan de
  más durante la migración pero convergen solos.
- Gamificación: `checkBadges` se re-ejecuta (idempotente); `photosCount` lo sana
  el recuento.

## Orden de despliegue y ejecución

1. `firebase deploy --only firestore:indexes`
   ⚠️ Si el CLI avisa de que va a **borrar** índices que existen en producción y
   no están en el archivo, cancela y añádelos antes al JSON (el archivo estaba
   incompleto respecto a producción).
2. `firebase deploy --only functions` (nuevo módulo + canonical-items).
3. Desplegar frontend (Hosting/App Hosting).
4. En Developer → Mantenimiento → "Consolidación de reseñas":
   1. **Contar root** (referencia del tamaño).
   2. **Auditar (dry run)** → revisar huérfanas en el log.
   3. **Migrar** → borra la root según copia.
   4. **Recontar contadores**.
5. Verificar: PlacePage de un lugar con reseñas legacy, ListPage, perfil del
   autor (contador), y `canonicalItemsCount` del lugar.

## Resultado en producción (2026-07-04)

`adminCountRootReviews` devolvió **0** y la auditoría dry-run procesó 0
documentos: la colección raíz ya estaba vacía en el proyecto `listopic`. No hizo
falta ejecutar la migración ni el recuento. Todo el código de doble lectura era
defensa contra datos inexistentes.

## Limpieza post-migración (HECHA)

- `ReviewService.deleteReview`: borra solo la ruta canónica (antes hasta 3 refs).
- `useListDetails`: eliminadas las 2-3 queries root por carga de lista.
- `EditListForm`: eliminadas las queries root en renombrado de tags y sync de
  visibilidad.
- `GroupPage`: eliminado el fan-out de ~80 queries + query root; ahora una sola
  collectionGroup (mismo patrón que `usePlaceDetails`).
- `DeveloperPage` (marcar lugar cerrado): el batch de `placeClosedStatus`
  apuntaba a la root vacía Y la regla `reviewAllowedUpdateKeys` no permitía ese
  campo (doblemente muerto). Ahora usa collectionGroup con `limit(100)` (tope de
  las reglas) y `placeClosedStatus` se añadió a las claves permitidas.
- Se conservan a propósito: el fallback root de `UserDataExportTab` y la
  distinción root/subcolección de `ReviewsManagerTab` (diagnóstico admin, útil
  para verificar que la root sigue vacía), y la rama `reviewPath 'reviews/'` de
  `AddReviewForm` (coste cero, solo se activaría con datos legacy).

## Pendiente

- Actualizar `estructura de base de datos.txt` (capítulos 05/06/19) marcando la
  root como extinta, y añadir `places/{placeId}/items` y `businessSubscriptions`.
- Desplegar de nuevo `firestore.rules` (clave `placeClosedStatus`) y el frontend
  con esta limpieza.
- Las funciones de migración (`adminConsolidateRootReviews`, etc.) pueden
  retirarse en el futuro si la root sigue a 0; de momento sirven de red de
  seguridad y el recuento (`adminRecountReviewCounters`) es útil por sí solo
  para sanear contadores.

## Rollback

- La migración mueve (no transforma destructivamente): cada doc migrado conserva
  todos sus campos originales más `migratedFromRoot`/`migratedFromRootAt`. Si
  hiciera falta reconstruir la root, un script puede copiar de vuelta los docs
  `where('migratedFromRoot','==',true)`.
- `usePlaceDetails` nuevo funciona con datos pre y post migración (collection
  group cubre ambas ubicaciones), así que el frontend no depende de que la
  migración se haya ejecutado.

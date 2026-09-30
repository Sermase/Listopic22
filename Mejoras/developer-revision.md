# Revisión del panel Developer (30/09/2026)

Solo análisis: no se ha creado ni desplegado ningún índice ni se ha borrado nada.
Hay una excepción ya corregida en código porque era un fallo que ocultaba datos:
el interruptor público/privado de **Listas** no sincronizaba la visibilidad de las
valoraciones (ver «Corregido»).

## 1. El índice que falta (`reviews.userId`, grupo de colecciones)

`adminRecalculateAllUsers` falla para los 22 usuarios con
`FAILED_PRECONDITION … COLLECTION_GROUP_ASC reviews.userId`. La consulta es
`collectionGroup('reviews').where('userId', '==', uid)`. Firestore **no** crea
índices de campo único para grupos de colecciones: hay que pedirlos. En
`firestore.indexes.json` ya existen para `authorId` y `placeId`, pero no para `userId`.

**La misma consulta la usan también:**

| Función | Qué hace | Efecto si falta el índice |
|---|---|---|
| `deleteOwnAccount` | La persona borra su cuenta (Ajustes) | **Falla**: no se puede borrar la cuenta. Es obligatorio por RGPD y por las tiendas de apps |
| `propagateAuthorFieldsToReviews` | Al cambiar rol, nombre o foto, lo copia a sus valoraciones (Developer → Usuarios) | Falla: las valoraciones conservan el nombre o rol antiguo, y el filtro de bots puede fallar |
| `adminRecalculateAllUsers` | Recalcula los contadores de cada persona | Falla (lo que has visto) |
| `countReviewedPlaces` (gamificación, se llama desde el trigger `onReviewWritten`) | Cuenta los sitios distintos valorados, para las insignias «place_count» | Probable fallo en cada valoración nueva si existe alguna insignia de ese tipo. Sin acceso a los logs de producción no lo he podido confirmar |
| `adminAuditStatistics` (`.count()`) | Auditoría de contadores | Falla. No la usa ninguna pantalla |

**Veredicto: sí merece la pena crear el índice.** No es solo para un botón: sin él
falla el borrado de cuentas. El coste es mínimo (un índice de un campo, sin
consultas nuevas).

Índice exacto (para añadir **tú** a `firestore.indexes.json`, en `fieldOverrides`):

```json
{
  "collectionGroup": "reviews",
  "fieldPath": "userId",
  "indexes": [
    { "order": "ASCENDING",  "queryScope": "COLLECTION" },
    { "order": "DESCENDING", "queryScope": "COLLECTION" },
    { "order": "ASCENDING",  "queryScope": "COLLECTION_GROUP" }
  ]
}
```

Hay que conservar los dos índices `COLLECTION`: un override sustituye los índices
automáticos de ese campo.

Después: `firebase deploy --only firestore:indexes --project listopic`. Si la CLI
propone **borrar** índices que están en la consola pero no en el archivo, responde
**No**. La creación tarda unos minutos, y mientras tanto las consultas siguen fallando igual que hoy.

Otros índices que faltan, todos para funciones que **no** usa ninguna pantalla (no
los crearía):

- `reviews.userTags` con `array-contains` en grupo de colecciones → `adminReplaceTag`.
- `comments.userId` y `messages.userId` en grupo de colecciones → `adminAuditStatistics`.

## 2. Propuesta de limpieza

### Mantener

| Pestaña | Acción | Por qué |
|---|---|---|
| Mantenimiento | «Recalcular Listas» (`adminRecalculateAllLists`) | Ya usa el cálculo único (Lista madre / Minilista, pesos) |
| Mantenimiento | Recalcular un sitio (`adminRecalculatePlaceStats`) | Útil y barato |
| Mantenimiento | «Regenerar publicProfiles» | Reparación puntual; reescribe desde `users` |
| Mantenimiento | «Recontar contadores» (`adminRecountReviewCounters`) | Recorre todas las valoraciones **sin índices** y corrige los contadores de listas, usuarios y sitios |
| Algolia | Reindexar todo o por tipo, «Configurar índices» | Necesario tras desplegar (nuevo `rankingScore`) |
| Sitios | «Solo ubicación», «Actualizar» (tope de 25), fusionar, borrar, «Sel. sin ubicación» | Ya con aviso de coste |
| Listas | Editar, crear, pública/privada, colaborativa | Pública/privada ya corregida |
| Valoraciones, Usuarios, Etiquetas, Informes | Moderación del día a día | — |
| Negocios, Planes, Propuestas Pro, Copias, Uso de API, Analítica, Mapa de conexiones, Auditoría, RGPD, Marca, Otros | Operativa de negocio y cumplimiento | Sin fallos detectados en la revisión de código |

### Corregir

| Acción | Problema | Propuesta |
|---|---|---|
| «Recalcular Usuarios» (`adminRecalculateAllUsers`) | Índice que falta (sección 1) | Crear el índice. Alternativa sin índice: usar el compuesto que ya existe (`userId` + `createdAt`), aunque así no cuenta las valoraciones sin `createdAt` |
| «Recalcular TODO» | Encadena listas → sitios → usuarios; el tercer paso falla, así que el resultado queda a medias | Tras crear el índice funciona. Mejor aún: que sea «Recontar contadores» + «Recalcular Listas», que no dependen de índices |
| Recalcular **una** lista | Llama a dos funciones (`adminRecalculateListAverages` y `adminUpdateSingleListAggregates`) que repiten el mismo cálculo | Dejar solo `adminUpdateSingleListAggregates` |
| «Recalcular gamificación» (`adminRecalculateAllGamification`) | Usa `countReviewedPlaces`: depende del mismo índice | Se arregla con el índice |
| «Backfill authorUserType» | Lo hace **el navegador**: recorre todas las valoraciones y escribe una a una. Es lento, se corta si cierras la pestaña, y ya existe `propagateAuthorFieldsToReviews` en el servidor | Sustituirlo por una llamada al servidor, o quitarlo si el filtro de bots ya lee los perfiles (hoy lo hace) |
| Consola: «Guardar JSON» | Escribe **cualquier** documento con `merge`, sin validar el formato. Un error tecleando puede romper una lista o un sitio | Abrir en solo lectura por defecto; editar tras un segundo paso y con aviso de la colección |
| «Recontar contadores»: nota del sitio | Cuenta una valoración sin nota como 0 en `places.averageRating` | Ignorar las valoraciones sin nota, como hace el módulo único de notas |
| `adminFixPlaceDocument` en bloque («Corregir todos los IDs») | Fusiona sitios y mueve valoraciones en bucle, sin simulación previa en la pantalla | Hacer primero una pasada `dryRun: true` y enseñarla antes de confirmar |

### Eliminar o archivar

| Acción o función | Motivo |
|---|---|
| Consolidación de reseñas raíz (`adminCountRootReviews`, `adminConsolidateRootReviews`) | Migración ya hecha: la colección raíz `reviews/` está vacía (docs/REVIEWS-MIGRATION.md). Dejar solo «Contar» como comprobación, o archivar las dos |
| `adminUpdateAllPlaces` (sin botón, pero desplegada) | Actualiza **todos** los sitios desde Google de una vez: es la acción de coste masivo que queremos evitar. **Eliminar** |
| `reverseGeocode` (sin uso en la web) | Llama a Google Geocoding. Eliminar, o reservarla si se usa para la ubicación del usuario (hoy no) |
| `adminAuditStatistics`, `adminGetCollection`, `adminAuditPlaceIdConsistency`, `adminRebuildCanonicalItemsForPlace`, `adminReplaceTag`, `adminRecalculateUserGamification`, `adminResetUserGamification`, `adminResetAllGamification` | Ninguna pantalla las llama. Las de *reset* son destructivas: **eliminar**. El resto, archivar (quitar del `index.js`) salvo que las uses a mano |
| `adminRecalculateListAverages` | Duplica a `adminUpdateSingleListAggregates` |
| Pestaña «Proyectos internos» | Es un laboratorio, no mantenimiento. Moverla a «Otros» |

### Corregido en esta rama (sin desplegar)

- **Listas → pública/privada** cambiaba la lista pero no la `visibility` de sus
  valoraciones. Como el perfil, la Lista y la Home solo leen
  `visibility == 'public'`, las valoraciones seguían en Firestore y dejaban de verse.
  Ahora sincroniza, igual que «Editar lista», y respeta la visibilidad de cada
  Minilista. Script de revisión: `functions/scripts/audit-review-visibility.js`
  (solo lectura; `--apply` corrige solo el campo `visibility`).

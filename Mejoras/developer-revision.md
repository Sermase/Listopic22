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

| Acción | Problema | Estado (01/10) |
|---|---|---|
| «Recalcular Usuarios» (`adminRecalculateAllUsers`) | Índice que falta (sección 1) | **Hecho**: una sola pasada por todas las valoraciones, sin índices. Borrar cuenta, propagar autor y gamificación tienen un plan B si falta el índice |
| «Recalcular TODO» | Encadena listas → sitios → usuarios; el tercer paso fallaba | **Hecho** con el arreglo anterior (ya no depende del índice) |
| Recalcular **una** lista | Llamaba a dos funciones que repiten el mismo cálculo | **Hecho**: solo `adminUpdateSingleListAggregates` |
| «Recalcular gamificación» | Usa `countReviewedPlaces`, que dependía del índice | **Hecho**: plan B sin índice |
| «Backfill authorUserType» | Lo hacía **el navegador**, valoración a valoración | **Hecho**: una llamada al servidor por persona (`propagateAuthorFieldsToReviews`), con resumen de personas, valoraciones y errores |
| Consola: «Guardar JSON» | Escribía **cualquier** documento entero con `merge` | **Hecho**: solo lectura al abrir; «Editar JSON» → «Guardar JSON»; confirma nombrando los campos que cambian y escribe **solo esos** (antes reescribía fechas y coordenadas intactas como mapas planos y añadía un campo `id`) |
| «Recontar contadores»: nota del sitio | Contaba una valoración sin nota como 0 | **Hecho** (también en `recalculateAggregatesForPlace`) |
| «Fix IDs» en bloque (`adminFixPlaceDocument`) | Fusionaba sitios sin simulación previa | **Hecho**: primero `dryRun: true` de todos; confirma con sitios, reseñas y seguidores; cancelar no escribe nada |

### Eliminar o archivar

| Acción o función | Estado (01/10) |
|---|---|
| Consolidación de reseñas raíz (Auditar / Migrar) | **Ocultas** salvo que «Contar» encuentre reseñas en la raíz. Las funciones siguen desplegadas |
| `adminUpdateAllPlaces` | **Archivada**: fuera de `index.js` (actualizaba todos los sitios desde Google de golpe) |
| `reverseGeocode` | **Archivada** (sin uso; llamaba a Google Geocoding) |
| `adminResetUserGamification`, `adminResetAllGamification` | **Archivadas** (destructivas, sin pantalla) |
| `adminRecalculateListAverages` | **Archivada (02/10)**: duplicaba a `adminUpdateSingleListAggregates` |
| `adminAuditStatistics` | **Archivada (02/10)**: fallaba por tres índices que no existen; la sustituye «Recontar contadores» |
| `adminGetCollection`, `adminAuditPlaceIdConsistency`, `adminRebuildCanonicalItemsForPlace`, `adminReplaceTag`, `adminRecalculateUserGamification` | Siguen desplegadas: son de lectura o útiles a mano, y no hacen daño. `adminReplaceTag` necesita el índice `reviews.userTags` para funcionar |
| Pestaña «Proyectos internos» | Sin cambios |

**Al desplegar Functions**, la CLI preguntará si borrar las 6 archivadas
(`adminUpdateAllPlaces`, `reverseGeocode`, `adminResetUserGamification`,
`adminResetAllGamification`, `adminRecalculateListAverages`,
`adminAuditStatistics`). Responde **sí**. Si dices que no, siguen
desplegadas con el código antiguo.

Comprobado en el emulador (01/10): recalcular una lista, backfill de tipos de
autor (4 personas · 11 valoraciones · 0 errores), recontar, consola JSON (solo
lectura, aviso sin cambios, solo escribe el campo cambiado y el `GeoPoint`
sigue siendo `GeoPoint`) y «Fix IDs» (1 llamada `dryRun`; al cancelar, nada cambia).

### Corregido en esta rama (sin desplegar)

- **Listas → pública/privada** cambiaba la lista pero no la `visibility` de sus
  valoraciones. Como el perfil, la Lista y la Home solo leen
  `visibility == 'public'`, las valoraciones seguían en Firestore y dejaban de verse.
  Ahora sincroniza, igual que «Editar lista», y respeta la visibilidad de cada
  Minilista. Script de revisión: `functions/scripts/audit-review-visibility.js`
  (solo lectura; `--apply` corrige solo el campo `visibility`).

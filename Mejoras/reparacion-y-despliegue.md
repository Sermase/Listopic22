# Reparación y despliegue (01/10/2026)

Las cifras de producción salen de lecturas públicas (Firestore sin sesión, y
Algolia con la clave de búsqueda). Desde esta rama no se ha desplegado nada.

## 0. Estado actual (01/10, noche)

**Hecho por ti:**

| Paso | Resultado |
|---|---|
| Borrar `lists_tmp_*` | ✅ Quedan 15 índices |
| 6 · Pesos (`backfill-scoring-weights.js --apply`) | ✅ Re-auditado: la simulación sobre las 14 Listas públicas da **0 cambios** |
| 9–10 · Visibilidad (41 = 32 + 9) | ✅ Re-auditado: las 14 Listas públicas tienen **0** valoraciones ocultas. Patatas bravas 37/37 y Playas 12/12 públicas. El perfil de ListopIA devuelve **79** |
| Credenciales | ✅ ADC (`gcloud auth application-default login`). Sirve igual que la cuenta de servicio para los scripts |

Las Listas privadas no se pueden comprobar sin credenciales. La re-auditoría
desde aquí solo usa lectura pública.

**Pendiente (en este orden):** 2–4 (clave solo de búsqueda + vista previa),
borrar el índice `reviews`, 5 (Functions; borra 4 archivadas), 7 (reglas), 8
(merge), 11–13 (Algolia) y 14–17.

**Clave de Algolia en producción:** la web publicada (compilada el 30/09 a las
22:32 GMT) **sigue llevando la clave antigua**, la que empieza por `2eb8`, con
`search`, `listIndexes` y `settings`. O el secreto no se cambió, o se cambió
después de esa compilación. Una Search API Key «de serie» de Algolia suele tener
**`search` y `listIndexes`**. Sirve, pero lo ideal es una clave con **solo
`search`** (paso 2). La vista previa de la PR (paso 4) dirá qué clave usa el
secreto: en el navegador, *Network* → cualquier petición a `algolia.net` →
cabecera `x-algolia-api-key`.

## 1. Auditoría de visibilidad (producción, solo lectura)

| Lista | Total | Públicas | Privadas o sin `visibility` | Personas afectadas | Qué cambiaría el script |
|---|---:|---:|---:|---|---|
| Patatas bravas | 37 | 5 | **32** | ListopIA (31), Sermase (1, muy probable) | 32 valoraciones → `public` |
| Playas | 12 | 3 | **9** | ListopIA (8), Sermase (1, muy probable) | 9 valoraciones → `public` |
| Hamburguesas | 32 | 32 | 0 | — | nada |
| Pizzas | 27 | 27 | 0 | — | nada |
| Brunch | 17 | 17 | 0 | — | nada |
| Tartas de queso | 17 | 17 | 0 | — | nada |
| Nachos | 6 | 6 | 0 | — | nada |
| Pinchos | 5 | 5 | 0 | — | nada |
| Tortilla de patata | 3 | 3 | 0 | — | nada |
| Croquetas | 2 | 2 | 0 | — | nada |
| Cocidos | 2 | 2 | 0 | — | nada |
| Ensaladillas | 1 | 1 | 0 | — | nada |
| Concurso provincial de pinchos y tapas (Minilista) | 0 | 0 | 0 | — | nada |
| Gyozas | 0 | 0 | 0 | — | nada |
| **Total** | **161** | **120** | **41** | | **41 → `public`** |

**Cómo se ha calculado:**
- **Total**: el `reviewCount` de la lista, que coincide con lo que tiene indexado Algolia.
- **Públicas**: lo que se puede leer sin sesión.
- **Ocultas por elemento**: las que tiene Algolia menos las que se pueden leer de cada sitio y plato.

**Cuadra con los perfiles:**
- ListopIA: 79 en el perfil − 40 visibles = **39**.
- Sermase: 55 − 53 = **2**. Son las dos de autor «básico» que aparecen en
  «Lalina» (Bravas) y «Orilla de la Tortuga» (Playas). Algolia guarda el tipo
  de autor pero no su identificador, así que la atribución es por cuadre de
  cifras, no por lectura directa.
- El resto de perfiles: lo visible coincide con su contador.

**Límites:**
- Sin credenciales de administrador no puedo leer esas 41 valoraciones. No sé
  si tienen `private` o no tienen el campo, ni sus identificadores.
- Tampoco veo las **listas privadas**. En ellas puede haber el desajuste
  contrario: valoraciones `public` dentro de una lista privada. Las reglas ya
  las ocultan igualmente, pero el script también las corregiría a `private`.

**El script en simulación.** Lo he ejecutado en el emulador, que reproduce el caso:

```
Lista | Visibilidad lista | Total | Públicas | Privadas | Sin campo | A cambiar | Usuarios afectados
Patatas bravas | public | 9 | 7 | 2 | 0 | 2 | ListopIA (2)
lists/bravas/reviews/r10  private → public  ListopIA  Patatas bravas · Bar Madrid
```

En producción necesita una cuenta de servicio, así que lo ejecutas tú. Sin
`--apply` solo lee:

```
cd functions
GOOGLE_APPLICATION_CREDENTIALS=/ruta/clave.json node scripts/audit-review-visibility.js --details --user=TtU5VnnJGyNOzYMjcoAOPvhAap82
```

Lo esperado es la tabla de arriba: **41 a cambiar, en Bravas y Playas**. Si
sale otra cosa, para y me lo pasas.

## 2. Sincronización de visibilidad (emulador, comprobado de extremo a extremo)

| Caso | Valoraciones de la madre | Valoraciones hechas desde la Minilista |
|---|---|---|
| Editar lista: madre → privada | 9 → `private` | se quedan `public`: siguen a su Minilista |
| Editar lista: madre → pública | 9 → `public` (arregla las 2 del bot) | sin cambio |
| Editar lista: Minilista → privada | sin cambio | 1 → `private` |
| Editar lista: Minilista → pública | sin cambio | 1 → `public` |
| Developer: madre → privada / → pública | ✅ igual que «Editar lista» | sin cambio |
| Developer: Minilista → privada / → pública | sin cambio | ✅ |

**Regla nueva (aprobada el 01/10): una Minilista nunca es más pública que su madre.**

| Dónde | Qué hace | Comprobado |
|---|---|---|
| Reglas | No se crea ni se hace pública una Minilista con la madre privada, tampoco un jefe. Cambiar otras cosas de esa Minilista sigue permitido | 6 tests nuevos (61/61) |
| Servidor (`syncListVisibility`) | Si una lista cambia de visibilidad, sincroniza sus valoraciones. Si una madre pasa a privada, cierra sus Minilistas públicas, y en cadena sus valoraciones | Emulador: madre → privada ⇒ Minilista y su valoración → privadas |
| Crear Minilista | «Pública» desactivado si la madre es privada | Emulador ✅ |
| Editar Minilista | Casilla bloqueada y explicada, también si quien edita no puede leer la madre | Emulador ✅ (lo encontré bloqueado solo por la regla y lo corregí) |
| Editar madre | Al desmarcar «Pública»: «Al guardar, sus Minilistas también pasarán a privadas» | Emulador ✅ |
| Developer → Listas | No deja abrir una Minilista de madre privada | Emulador ✅ |
| Madre → pública otra vez | Las Minilistas **no** se abren solas: quedan privadas hasta que su dueño las abra | Emulador ✅ |

En producción no hay hoy ninguna Minilista pública con la madre privada. La
única Minilista pública, «Concurso provincial…», cuelga de «Pinchos», que es
pública. Que existan otras privadas no lo puedo ver sin credenciales; si las hay,
no cambia nada.

## 3. Algolia (21 índices; límite 20 del plan)

| Índice | Tipo | ¿Lo usa el código? | ¿Se puede borrar? |
|---|---|---|---|
| `lists` | principal | sí | no |
| `lists_by_followers` | réplica de `lists` | sí (orden «Seguidores») | no |
| `lists_by_reviews` | réplica de `lists` | sí (orden «Valoraciones») | no |
| `places` | principal | sí (también «Más cerca») | no |
| `places_by_rating` | réplica de `places` | sí | no |
| `places_by_reviews` | réplica de `places` | sí | no |
| `places_by_distance` | réplica de `places` | **no**: «Más cerca» usa `places` | **sí, después** de desplegar Functions y pulsar «Configurar índices» (eso la desvincula) |
| `users` | principal | sí | no |
| `users_by_followers` · `users_by_reviews` · `users_by_level` | réplicas de `users` | sí | no |
| `grouped_items` | principal | sí | no |
| `grouped_items_by_score` · `grouped_items_by_reviews` | réplicas | sí | no |
| `lists_tmp_amgkik`, `lists_tmp_ewun3t`, `lists_tmp_f16fva`, `lists_tmp_i3mzo`, `lists_tmp_s3lxue`, `lists_tmp_x9rexh` | principales sueltos, **0 registros** | **no**: son restos de reindexados de `lists` fallidos (`replaceAllObjects` crea un índice temporal) | ✅ **borrados** (01/10) |
| `reviews` | principal suelto, 1 registro de 2025 | **no** (índice antiguo de valoraciones) | **sí, ya** |

Borrar los 7 «sí, ya» deja **14** índices; desvincular y borrar
`places_by_distance`, **13**. Con 21, Algolia rechaza el reindexado («please
remove unused indices before pushing more data»). Es probable, pero no lo he
confirmado, que tampoco acepte las escrituras en tiempo real, y entonces el
buscador no vería las novedades.

Cambiado en código (sin desplegar): el reindexado ya **no usa índices
temporales**; guarda los registros y después borra los que sobran.

**Riesgo de seguridad:** la clave pública de búsqueda (`VITE_ALGOLIA_SEARCH_KEY`,
que va en la web) tiene los permisos `search`, **`listIndexes` y `settings`**.
Cualquiera puede leerla en el navegador y **cambiar la configuración de los
índices** (orden, campos, réplicas). Hay que crear una clave solo con `search` y
retirar la antigua (pasos 2 y 15).

## 4. `adminRecalculateAllUsers` y el índice `reviews.userId`

- **Corregido sin índice:** «Recalcular TODOS los Usuarios» ahora hace una sola
  pasada por todas las valoraciones, sin filtros. Probado en el emulador:
  contadores correctos.
- `deleteOwnAccount`, `propagateAuthorFieldsToReviews` y la gamificación usan
  primero la consulta con índice. Si falta, recorren todo (plan B). Con unas
  160 valoraciones va sobrado; con decenas de miles sería lento.
- **El índice sigue recomendado** para cuando crezca. El JSON exacto está en
  `developer-revision.md`, y no lo he creado.

## 5. Qué entra en esta PR (sobre `main`, que ya tiene la #260)

**Functions nuevas:** `syncListVisibility` (trigger en `lists/{listId}`).

**Functions que se eliminan (archivadas, fuera de `index.js`):**
`adminUpdateAllPlaces`, `reverseGeocode`, `adminResetUserGamification` y
`adminResetAllGamification`. Ninguna pantalla las usa. La primera actualizaba
todos los sitios desde Google de golpe; las de *reset* son destructivas. El
código sigue en el repositorio.

**Functions cambiadas:**

| Archivo | Functions afectadas | Cambio |
|---|---|---|
| `modules/algolia.js` + `lib/algolia-sync.js` | `adminBackfillAlgolia` y todos los triggers de Algolia (aplican los ajustes al arrancar) | Reindexado sin índices temporales; `places` sin la réplica `places_by_distance` |
| `modules/admin/admin-users.js` + `lib/review-tally.js` + `lib/user-reviews.js` | `adminRecalculateAllUsers`, `deleteOwnAccount`, `propagateAuthorFieldsToReviews` | Sin depender del índice `reviews.userId` (pasada única o plan B) |
| `modules/gamification.js` | `onReviewWritten`, `onListWritten`, `onUserFollowingWritten`, `adminRecalculateUserGamification`, `adminRecalculateAllGamification` | `countReviewedPlaces` con plan B si falta el índice |
| `modules/stripe-business.js` + `lib/billing-flags.js` | `createBusinessProCheckoutSession` | Rechaza (`failed-precondition`) salvo que `STRIPE_CHECKOUT_ENABLED=true` en `functions/.env`, antes de tocar los secretos de Stripe |
| `modules/core.js` | `updatePlaceAggregatesOnReviewChange` (trigger), `adminRecalculatePlaceStats`, `adminRecalculateAllPlaces`, `adminFixPlaceDocument` | La nota del sitio ignora las valoraciones sin nota, en vez de contarlas como 0 |
| `modules/reviews-consolidation.js` | `adminRecountReviewCounters` | Igual: sin nota no cuenta como 0 |

**Si Functions no se ha desplegado desde antes de la #259**, se despliegan
además las de las PR #259/#260:
- nuevas: `simulateCriteriaChange`, `applyCriteriaChange`, `adminRefreshPlaceLocation` y `propagateParentCriteriaToMinilists`;
- cambiadas: `core.js`, `admin-lists.js`, `grouped-aggregator.js`, `reports.js` y `ssr-meta.js`.

Con `firebase deploy --only functions` todo sale de una vez. La CLI preguntará
si borrar las 4 archivadas: responde **sí** (si dices que no, siguen
desplegadas con el código antiguo).

**Business Pro:** la contratación online queda **apagada por partida doble**
hasta que Stripe esté listo:
- web: el botón «Hazte Business Pro» solo aparece si se compila con
  `VITE_BUSINESS_PRO_CHECKOUT=true` (no está en los workflows). Sin él se
  muestra una nota: «La contratación online de Business Pro todavía no está
  abierta…»;
- servidor: `STRIPE_CHECKOUT_ENABLED=true` en `functions/.env` (no existe).

La concesión manual (Developer → Planes → «Activar Pro») no cambia. Probado en
el emulador: dueña sin plan → nota, 0 llamadas a Stripe; admin concede →
`businessProActive: true`, origen `manual`; la dueña ya ve las pestañas Pro.
**No actives ninguno de los dos hasta configurar Stripe** (precio, webhook y
secretos).

**Developer (solo web):** recalcular una lista con una sola función, backfill de
tipos de autor en el servidor, consola JSON en solo lectura que solo escribe
los campos cambiados, «Fix IDs» con simulación previa, y consolidación de
reseñas raíz oculta mientras la raíz esté vacía. Detalle en
`developer-revision.md`.

**Reglas:**
- `firestore.rules`: nueva `minilistNotMorePublicThanParent`, que se aplica al crear y al editar listas.
- Si las reglas no se han desplegado desde antes de la #259, entran también el endurecimiento y las reglas de criterios y pesos (V1–V9).
- Tests: 61/61.

**Índices de Firestore:** esta PR no cambia `firestore.indexes.json`. Ya en `main`
hay dos compuestos de `lists`, (isPublic, createdAt) y (userId, isPublic,
createdAt), de la #259. Solo se crean si ejecutas `firebase deploy --only firestore:indexes`.

**Scripts de datos:** `--apply` guarda antes una copia en `functions/backups/`
(no se sube a git); `scripts/restore-backup.js` la deshace.

**Secreto de GitHub:** `VITE_ALGOLIA_SEARCH_KEY`, mismo nombre, solo cambia el
valor. `VITE_ALGOLIA_APP_ID` no cambia.

## 6. Orden exacto de reparación y despliegue

Todo con `--project listopic`. Para los scripts hace falta una cuenta de
servicio: Firebase Console → Configuración del proyecto → Cuentas de servicio →
«Generar nueva clave privada». Guárdala fuera del repositorio, por ejemplo en
`~/listopic-sa.json`. En cada sesión de terminal:

```
cd functions
export GOOGLE_APPLICATION_CREDENTIALS=~/listopic-sa.json
```

### A. Algolia: limpieza (aprobada) y clave nueva

1. Dashboard de Algolia → *Search* → *Indices*: borra `lists_tmp_amgkik`,
   `lists_tmp_ewun3t`, `lists_tmp_f16fva`, `lists_tmp_i3mzo`, `lists_tmp_s3lxue`,
   `lists_tmp_x9rexh` y `reviews`. **Comprobación:** quedan 14 índices.
2. *Settings* → *API Keys* → *All API keys* → **New API key**:
   - ACL: **solo `search`**;
   - índices: `lists*`, `places*`, `users*` y `grouped_items*`;
   - *HTTP referers*: vacío de momento (la app nativa llama desde `https://localhost` o `capacitor://localhost`);
   - descripción: «web · solo búsqueda».

   **No borres la clave antigua.**
3. GitHub → *Settings* → *Secrets and variables* → *Actions* → edita
   **`VITE_ALGOLIA_SEARCH_KEY`** con la clave nueva. Para trabajar en local,
   cámbiala también en `frontend/.env.local`, que no se sube.

### B. Vista previa de la web (aquí se prueba la clave nueva)

4. Abre la PR. El workflow de PR compila con el secreto nuevo y publica una
   vista previa `listopic--pr…web.app`. Comprueba allí:
   - Buscar devuelve Elementos, Sitios, Listas y Usuarios;
   - Buscar → Zona → Ciudad tiene valores;
   - la consola del navegador no tiene errores 403 de Algolia.

   Si falla: vuelve a poner la clave antigua en el secreto. No hay corte.

### C. Servidor, pesos y reglas

5. Functions:
   ```
   npm ci && npm test                                   # 92/92
   firebase deploy --only functions --project listopic
   ```
   Cuando pregunte si borrar `adminUpdateAllPlaces`, `reverseGeocode`,
   `adminResetUserGamification` y `adminResetAllGamification`: **sí**.

   **Comprobación:** en la consola de Functions aparece `syncListVisibility`, ya
   no aparecen las 4 anteriores, y los logs no muestran errores de arranque.
6. ✅ **Hecho (01/10).** Pesos de criterios (antes de las reglas, como pide el propio script):
   ```
   node scripts/backfill-scoring-weights.js            # simulación: revisa la lista de cambios
   node scripts/backfill-scoring-weights.js --apply    # escribe; antes guarda una copia en backups/
   ```
7. Reglas:
   ```
   cd ../firestore-tests && npm test                    # 61/61
   cd .. && firebase deploy --only firestore:rules --project listopic
   cd functions
   ```

### D. Web en producción

8. Fusiona la PR en `main`; el workflow despliega Hosting. Repite las
   comprobaciones del paso 4 en `listopic.es`.

### E. Visibilidad

9. ✅ **Hecho (01/10): 41 cambios aplicados; ahora da 0.** Solo simulación:
   ```
   node scripts/audit-review-visibility.js --details --user=TtU5VnnJGyNOzYMjcoAOPvhAap82
   ```
   **Condición para seguir:** la columna «A cambiar» debe dar exactamente
   **Patatas bravas 32, Playas 9 y 0 en el resto (41)**. Si no, para y pásame la salida.
10. Si coincide:
    ```
    node scripts/audit-review-visibility.js --apply --expect=TubrhJBOv3qUNDMXmSd3:32,jSwygYuHeF5MCkrMLzF5:9
    ```
    El script vuelve a contar y, si el reparto no es exactamente ese, sale sin
    escribir (código 3). Sin `--expect` tampoco escribe (código 2). Antes de
    escribir guarda una copia en `backups/audit-review-visibility-<fecha>.json`.

    **Comprobación:** repite la simulación del paso 9; debe dar 0 a cambiar.

### F. Algolia: reindexado y réplica sobrante

11. Developer → Algolia → «Configurar índices». Aplica las facetas de zona a los
    principales y a sus réplicas, y desvincula `places_by_distance`.
12. Developer → Algolia → «Reindexar todo».
    **Comprobación:** no sale «Too many indices» y siguen siendo 14 índices.
13. Dashboard de Algolia: `places_by_distance` aparece sin *primary*. Bórrala.
    **Comprobación:** quedan 13 índices.

### G. Recuentos y comprobación final

14. Developer → Mantenimiento: «Recalcular TODAS las Listas» y «Recalcular TODOS
    los Usuarios». **Comprobación:** los dos terminan sin errores.
15. En `listopic.es`:
    - el perfil de ListopIA muestra **79** valoraciones;
    - **Patatas bravas** (37) y **Playas** (12) muestran todas las suyas, activando «Bots»;
    - Buscar → Zona → Comunidad y País tienen valores;
    - en una lista tuya de prueba, al pasar la madre a privada, su Minilista pasa a privada (unos segundos).
16. **Solo con todo en verde:** Algolia → *API Keys* → borra la clave antigua (la
    que tiene `listIndexes` y `settings`). **Comprobación:** Buscar sigue funcionando.
17. Opcional, cuando crezca: índice `reviews.userId` (JSON en
    `developer-revision.md`) → `firebase deploy --only firestore:indexes --project listopic`.
    Si propone borrar índices, responde **No**.

## 7. Marcha atrás (rollback)

| Qué | Cómo deshacerlo |
|---|---|
| **Clave de Algolia** | Mientras no borres la antigua (paso 16): vuelve a poner la antigua en el secreto `VITE_ALGOLIA_SEARCH_KEY` y relanza el workflow de `main` (GitHub → *Actions* → *Re-run*). |
| **Web (Hosting)** | Firebase Console → *Hosting* → historial de versiones → la anterior → «Revertir». Instantáneo. O revierte el merge en GitHub y deja que el workflow despliegue. |
| **Functions** | Una archivada: descomenta su línea en `index.js` (o en el `module.exports` de su módulo) y despliega solo esa: `firebase deploy --only functions:<nombre> --project listopic`. Todo: desde el `main` anterior al merge: `git checkout <commit-anterior> -- functions && cd functions && npm ci && firebase deploy --only functions --project listopic`; después `git checkout HEAD -- functions`. Para quitar solo el trigger nuevo: `firebase functions:delete syncListVisibility --region europe-west1 --project listopic`. |
| **Reglas** | Firebase Console → *Firestore* → *Reglas* → historial → la versión anterior → «Publicar». O `git checkout <commit-anterior> -- firestore.rules && firebase deploy --only firestore:rules --project listopic`. |
| **Pesos** (paso 6) | `node scripts/restore-backup.js backups/backfill-scoring-weights-<fecha>.json` (simulación) y, después, con `--apply`. Devuelve `scoringWeights` y los criterios de las Minilistas a lo de antes, y borra el campo donde no existía. |
| **Visibilidad** (paso 10) | `node scripts/restore-backup.js backups/audit-review-visibility-<fecha>.json` (simulación) y, después, con `--apply`. Devuelve cada valoración a `private` o a «sin campo». |
| **Índices de Algolia borrados** | Los `lists_tmp_*` y `reviews` no se usan y no hace falta recuperarlos. `places_by_distance` tampoco: si alguna vez hiciera falta, se recrea al añadirla a `replicas` y pulsar «Configurar índices». |
| **Recuentos** (paso 14) | No hace falta: se recalculan a partir de los datos. |

Guarda la carpeta `functions/backups/` hasta dar todo por bueno: es la única
copia de los valores anteriores.

# Nota pública del sitio (02/10/2026)

## Campos de `places/{id}` (`functions/modules/lib/place-rating.js`)

| Campo | Qué cuenta | Para qué |
|---|---|---|
| `publicHumanReviewsCount` · `averageRating` | Valoraciones **públicas de personas** (sin bots). Los críticos cuentan: son personas. | **Nota pública y ranking.** Sin ellas, «Sin nota pública todavía». |
| `totalVisibleReviewsCount` | Todas las **públicas**, también las de bots | **Actividad.** Decide que el sitio salga en Buscar. |
| `reviewsCount` | = `totalVisibleReviewsCount` (alias) | Compatibilidad: Buscar filtra `reviewsCount > 0`, también en las apps ya instaladas. Si contara solo personas, en ellas desaparecerían los sitios con solo bots. |
| `publicBotReviewsCount` · `botAverageRating` | Públicas de bots | Solo se enseñan con el filtro «Bots». |
| `criticReviewsCount` · `criticRating` | Críticos verificados (`userType` incluye `critico`, que solo asigna un jefe) | Chip aparte; nunca se mezcla con la general. Provisional con menos de 3. |
| `publicReviewerTypes` | Tipos de usuario de quien valoró en público | Faceta `authorUserType` en Buscar → Sitios: filtros «Bots», «Críticos», «Expertos». |

Las valoraciones privadas (Lista o Minilista privada) no cuentan para ninguno.

## Comportamiento

- **Un sitio solo con bots sigue en Buscar.** Su visibilidad depende de `totalVisibleReviewsCount`, nunca de `publicHumanReviewsCount`.
  - En la tarjeta, en el mapa de Buscar y en la ficha pone «Sin nota pública todavía», nunca un 0.
- **No participa como si tuviera nota humana.**
  - `rankingScore` usa solo la nota y el nº de personas. Sin ellas vale 0, y cualquier sitio con nota da ≥ 5,25.
  - Al ordenar por nota (`places_by_rating`) o por relevancia, los que no tienen nota pública **van detrás**. Por nº de valoraciones (`places_by_reviews`) ordena el nº de personas.
- **Con el filtro «Bots»**, Buscar → Sitios enseña solo los sitios con valoraciones de bots.
  - Un sitio sin nota pública muestra su **nota de bots, marcada con 🤖**.
  - Los que tienen nota pública siguen enseñando la pública.
- **Fuera de Buscar:**
  - El mapa de Home ya no usa la nota de Google como sustituta.
  - Las vistas previas al compartir enseñan solo la nota y el nº de personas.

## Arreglado de paso

- **`places.reviewsCount` se tocaba en dos sitios a la vez** (un incremento más el recálculo) y se desviaba ±1. Ahora solo se recalcula.
- **El trigger raíz antiguo (`reviews/`)** tenía su propia media. Ahora usa el mismo recálculo.
- **`adminRecountReviewCounters` contaba lo privado**: las valoraciones privadas de Minilistas en `lists.reviewCount` y, en los sitios, las privadas y las de bots. Ahora usa `list-metrics` y `place-rating`.
- **`itemTags` y `hasReviewedPhoto` del sitio** salen solo de valoraciones públicas.

## Antes de `--apply`: pasos en este orden

1. **Fusionar y desplegar las Functions** de esta rama.
   - Cada sitio que escribe el script se reindexa solo en Algolia con la versión desplegada.
   - Con la anterior, un sitio solo con bots entraría en el ranking como si tuviera nota 0.
   - Los ajustes nuevos del índice (`customRanking`, faceta `authorUserType`) se aplican solos en la primera escritura.
2. **Publicar la web.**
3. **Simular:**
   ```
   cd functions
   node scripts/recalc-place-ratings.js
   ```
   La tabla y el resumen dicen cuántos sitios:
   - siguen en Buscar sin nota pública (solo bots);
   - **dejan de salir** (solo tenían valoraciones privadas);
   - empiezan a salir;
   - pierden la nota.
4. **Aplicar:** `node scripts/recalc-place-ratings.js --apply --expect=N`
   - Para deshacer: `node scripts/restore-backup.js backups/recalc-place-ratings-….json --apply`.
5. **App Android:** lleva la web empaquetada. Hasta instalar la build nueva, la app vieja enseña «0.0» en los sitios sin nota pública. Conviene publicar la build a la vez que se aplica el script.

## Decisión pendiente: sitios con solo valoraciones privadas

Con esta regla **dejan de salir en Buscar**: no tienen ninguna valoración visible, igual que un sitio sin valoraciones. Hoy salen porque el `reviewsCount` antiguo contaba también las privadas.

La simulación da la lista exacta. Si los quieres visibles, se puede cambiar, pero sería enseñar un sitio solo porque alguien lo valoró en privado.

## Verificado (emulador)

- **Unidades:** Functions con 7 casos de `place-rating`; web con 6 de `placeRating`/`placeCardScore`.
- **Script:** caso mixto, solo bots, solo privadas y sin cambios. La segunda simulación da 0 cambios; hay copia y restauración.
  - Mixto: 7 (persona) · 9 (crítico) · bot 2 · privada 1 → nota **8** con 2 personas; 3 visibles; bots 2,0 (1); críticos 9 (1, provisional).
- **E2E de Buscar → Sitios** (siembra real + `adminRecountReviewCounters` + indexado real):
  - «Bar Robot» (solo bots) sale con «Sin nota pública todavía» y el último al ordenar por nota.
  - Con «Bots» enseña 7.5 🤖, y la lista queda en Bar Dos, Bar León y Bar Robot.
  - Con el cálculo anterior, «Bar Robot» no aparecía: la prueba falla.

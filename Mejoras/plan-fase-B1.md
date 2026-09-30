# Plan FASE B1 — criterios, pesos, ranking único y ámbito

Rama: `Mejoras-Opus-5.5-29-09-2026` (seguimos en ella tras el PR de FASE A + B0).
Estado: **plan cerrado, sin implementar**. Clasificación de riesgo como en FASE A:
**A** seguro · **B** requiere migración de datos · **C** puede romper o cambia lo que se ve.

## Decisiones del dueño (30/09/2026)

1. **Las Minilistas comparten SIEMPRE todos los criterios de su madre**: son comparables por obligación.
2. **Pesos ×0–×3**: al activarlos, las valoraciones históricas **se recalculan**, siempre con simulación previa y comparación antes/después.
3. En Listas con valoraciones, **«cuenta / no cuenta» (y el peso) quedan bloqueados** salvo una acción explícita de migración y recálculo.
4. **Ranking único en toda la app** con una sola fórmula bayesiana.
5. **Ámbito geográfico**, por prioridad: ciudad → provincia / CCAA → España, manteniendo también los radios de distancia.
6. **Nota global del sitio**: media simple, documentada como **provisional** mientras haya pocos datos.

## Puntos débiles de estas decisiones (antes de implementar)

- **(1) choca hoy con los datos reales**. «Croquetas pucelanas» solo comparte «Sabor» con su madre, porque la madre cambió de criterios después. Hacerla comparable exige añadirle los criterios que le faltan, y entonces sus valoraciones antiguas quedan incompletas (no tienen esas puntuaciones). Hay que decidir qué pasa con ellas: ver B1.1, opción recomendada.
- **(1) + (3) juntas** implican que **añadir o quitar un criterio** en una madre con valoraciones también debe pasar por la acción de migración. Si no, la madre cambia, las Minilistas heredan un criterio nuevo y todas las valoraciones existentes quedan incompletas sin que nadie lo decida.
- **(4)**: una sola fórmula no significa un solo número mágico. Hay que fijar el *prior* (media de referencia) y el peso *m*. Recomiendo **misma fórmula y mismo m en toda la app**, con prior = media del conjunto que se ordena (la Lista, la búsqueda…). Con un prior fijo de 7, una Lista donde todo saca 8–9 queda aplastada hacia 7. Quitar el término de volumen (`ln(1+n)×4`) cambia el orden de la búsqueda de forma visible.
- **(5)**: los datos de ubicación **son inconsistentes** [comprobado en código]. En `core.js`, `region` a veces es la provincia (`administrative_area_level_2`, reverse geocode ~l.1662) y a veces la CCAA (`administrative_area_level_1`, ~l.1269). Antes de mostrar «#3 en Castilla y León» hay que normalizar.

---

## B1.0 — Medir antes de tocar (A, solo lectura)

| # | Tarea | Archivos | Riesgo |
|---|---|---|---|
| 0.1 | Script de solo lectura: cobertura de `city`, `province`, `region` y `country` en `places`, valores distintos y cuántos `region` son provincia o CCAA | `functions/scripts/audit-place-locations.js` (nuevo) | A |
| 0.2 | Script de solo lectura: Minilistas cuyo `criteriaDefinition` no contiene todos los criterios de su madre, y cuántas valoraciones quedarían incompletas | `functions/scripts/audit-minilist-criteria.js` (nuevo) | A |
| 0.3 | Inventario de todos los sitios donde se ordena por nota (Lista, Home «Mejor en Listopic», Sitio «La Carta», Elemento, Perfil, réplicas de Algolia `*_by_rating` / `*_by_score`, `grouped-aggregator`) | documento | A |

## B1.1 — Minilistas siempre comparables (decisión 1)

| # | Tarea | Archivos | Riesgo |
|---|---|---|---|
| 1.1 | Al crear una Minilista se copian **todos** los criterios de la madre, bloqueados (hoy se copian solo los `type === 'slider'`; comprobar que no se pierde ninguno) | `CreateSublistPage.tsx`, `CreateListForm.tsx` | A |
| 1.2 | **Regla de Firestore**: al crear o editar una Minilista, `criteriaDefinition.keys()` debe contener todas las claves de la madre (`get(parent).data.criteriaDefinition.keys()` + `hasAll`). Tests nuevos | `firestore.rules`, `firestore-tests/rules.test.js` | C (bloquea escrituras inconsistentes) |
| 1.3 | **Propagación**: cuando la madre cambia de criterios (solo vía la acción de B1.3), la misma operación actualiza sus Minilistas | `functions/modules/admin/criteria-migration.js` (nuevo) | B |
| 1.4 | **Reparar las Minilistas existentes** (según 0.2): añadir los criterios que falten. Script en simulación y `--apply` | `functions/scripts/sync-minilist-criteria.js` (nuevo) | B |
| 1.5 | Valoraciones antiguas incompletas tras 1.4. **Recomendado**: conservan su nota guardada y se marcan `incomplete: true`; en la madre cuentan con los criterios comunes, como hoy; al editarlas se piden los criterios que faltan. Alternativa: excluirlas del ranking de la madre | `scoring.ts/js`, `AddReviewForm.tsx` | C |
| 1.6 | Simplificar `scoring`: el caso «parcial» pasa a ser solo compatibilidad con datos antiguos; tests actualizados | `lib/scoring.*`, vectores | A |

## B1.2 — Ranking único bayesiano (decisión 4)

Fórmula propuesta, una sola para toda la app:

```
posición = (n · media + m · C) / (n + m)
m = 3                               (a validar con la simulación)
C = media del conjunto ordenado     (Lista, resultados de búsqueda…); si el conjunto tiene < 5 elementos, C = 7
desempate: más valoraciones y después la más reciente
Se MUESTRA siempre la media real; la bayesiana solo ordena.
```

| # | Tarea | Archivos | Riesgo |
|---|---|---|---|
| 2.1 | Simulación con datos reales públicos: orden actual frente al orden nuevo en cada Lista pública, para m = 2, 3 y 5. Salida en `Mejoras/simulacion-ranking.md` | script de solo lectura | A |
| 2.2 | `rankPosition(avg, n, prior, m)` en `scoring.ts/js` + vectores compartidos; `rankingScore` antiguo marcado como obsoleto | `lib/scoring.*`, vectores | A |
| 2.3 | Página de Lista (Ranking, Mosaico y mapa), Home, «La Carta» del sitio y Perfil ordenan con `rankPosition`. Etiqueta «pocas valoraciones» con n < 3 | `ListPage.tsx`, `HomePage.tsx`, `PlacePage.tsx`, `ProfilePage.tsx` | C (cambia el orden visible) |
| 2.4 | Algolia: `rankingScore` = bayesiana sin término de volumen para sitios y elementos; réplicas `*_by_rating` / `*_by_score` usan `rankingScore`. Listas y usuarios mantienen su orden por actividad (no es una nota) | `functions/modules/algolia.js` | B (reindexar con `adminBackfillAlgolia`) |
| 2.5 | `grouped-aggregator` ordena igual | `grouped-aggregator.js` | A |

## B1.3 — Criterios bloqueados y migración explícita (decisiones 2 y 3)

Cambio de modelo recomendado: sacar la parte que puntúa a un campo propio,
**`scoringWeights: { criterioId: 0..3 }`**. Motivo: las reglas de Firestore no pueden
recorrer `criteriaDefinition` para comprobar cada `ponderable`, pero sí pueden
prohibir tocar un campo entero. `ponderable` queda como dato antiguo derivado.

| # | Tarea | Archivos | Riesgo |
|---|---|---|---|
| 3.1 | `scoring` lee `scoringWeights` si existe; si no, `ponderable` (×1 / ×0). Mismo resultado mientras todo sea ×1 | `lib/scoring.*` | A |
| 3.2 | Backfill: `scoringWeights` desde `ponderable` en todas las listas. Simulación → `--apply`. Añade un campo, no borra nada | `functions/scripts/backfill-scoring-weights.js` | B |
| 3.3 | **Regla**: si `reviewCount > 0`, el cliente no puede cambiar `scoringWeights` ni añadir o quitar claves de `criteriaDefinition` (nombres, etiquetas y paso siguen editables). Solo el servidor. Tests | `firestore.rules`, tests | C |
| 3.4 | `EditListForm` / `CriteriaBuilder`: con valoraciones, los interruptores y pesos aparecen bloqueados con el aviso «Cambiar esto recalcula N valoraciones» y un botón que abre la migración | `EditListForm.tsx`, `CriteriaBuilder.tsx` | A |
| 3.5 | Callable `simulateCriteriaChange(listId, cambios)`: devuelve, sin escribir, la nota de cada valoración antes y después, el ranking antes y después y las Minilistas afectadas | `functions/modules/admin/criteria-migration.js` | A |
| 3.6 | Callable `applyCriteriaChange(listId, cambios, simulationId)`: exige una simulación reciente e idéntica; escribe la definición en la madre y sus Minilistas y recalcula `overallRating` por lotes. Guarda en cada valoración `overallRatingBefore` y `scoringVersion`, con registro en `adminAuditLog` | `criteria-migration.js` | B |
| 3.7 | Pantalla de migración: tabla antes/después, cambios de posición y confirmación con el número de valoraciones afectadas | `components/CriteriaMigrationModal.tsx` (nuevo) | A |
| 3.8 | Encender pesos: `WEIGHTS_ENABLED = true` + selector ×0–×3 en `CriteriaBuilder` (en listas nuevas, libre; con valoraciones, solo vía 3.5–3.6) | `lib/scoring.*`, `CriteriaBuilder.tsx` | C |

Quién puede migrar: **propuesta**, el dueño de la Lista para sus Listas y `jefe`
para cualquiera. Pregunta abierta: ¿debe revisarlo un administrador si la Lista tiene
más de N valoraciones de otras personas?

## B1.4 — Ámbito geográfico (decisión 5)

| # | Tarea | Archivos | Riesgo |
|---|---|---|---|
| 4.1 | Normalizar ubicación en `places`: `city`, `province` (nivel 2), `ccaa` (nivel 1), `countryCode`. Arreglar las dos rutas de `core.js` que mezclan `region` | `functions/modules/core.js`, `lib/geo.js` | A (datos nuevos) |
| 4.2 | Backfill de sitios existentes a partir de sus componentes guardados. Si no los hay, geocodificación inversa por coordenadas: **tiene coste de API**, así que se estima en la simulación | `functions/scripts/backfill-place-admin-areas.js` | B |
| 4.3 | Propagar `placeCity`, `placeProvince` y `placeCcaa` a `grouped_items` y a Algolia como facetas | `grouped-aggregator.js`, `algolia.js` | B (reindexar) |
| 4.4 | Selector de ámbito en la Lista: **Cerca (radio actual) · Ciudad · Provincia · CCAA · España · Todo**. Se preselecciona la ciudad más cercana con elementos; los radios se mantienen | `ListPage.tsx`, `FilterContext.tsx` | C (UI nueva, pequeña) |
| 4.5 | Etiqueta «#3 en Valladolid» con `rankPosition` dentro del ámbito, solo si hay ≥ 5 elementos comparables | `ListItemCard.tsx`, ficha del Elemento | A |

## B1.5 — Nota global del sitio (decisión 6)

| # | Tarea | Archivos | Riesgo |
|---|---|---|---|
| 5.1 | Documentar en código y en `modelo-listopic.md` que es media simple **provisional** | `scoring.*`, docs | A |
| 5.2 | Mostrar el número de valoraciones al lado de la nota del sitio, y «pocas valoraciones» con < 3 | `PlacePage.tsx` | A |
| 5.3 | Criterio para revisarla: cuando haya ≥ 50 sitios con ≥ 5 valoraciones, repetir el estudio A–E | docs | A |

---

## Orden y bloques de commit

1. **B1.0** (medir) → informe corto. Si 0.1 o 0.2 dan sorpresas, se reajusta el plan.
2. **B1.2.1–2.2** (simulación + fórmula) → se valida *m* antes de cambiar nada visible.
3. **B1.3.1–3.4** (bloqueo + `scoringWeights`) → cierra la puerta antes de abrir los pesos.
4. **B1.1** (Minilistas comparables) → usa el bloqueo de 3.3.
5. **B1.2.3–2.5** (ranking único visible).
6. **B1.3.5–3.8** (migración y pesos).
7. **B1.4** (ámbito), en paralelo desde 4.1.
8. **B1.5** en cualquier momento.

## Despliegue (cuando toque; nada se despliega sin permiso)

Functions (callables + trigger) → Hosting → reglas (B1.1.2 y B1.3.3) → scripts en
simulación y luego `--apply` (3.2, 1.4, 4.2) → reindexar Algolia → «Recalcular TODAS las Listas».
**Las reglas nuevas van después del backfill 3.2**: si no, las listas sin
`scoringWeights` quedarían bloqueadas de forma rara.

## Calidad por bloque

Build, lint sin problemas nuevos, tests web + Functions + reglas (tests nuevos para
1.2, 3.3 y la migración), capturas móvil y escritorio en ambos temas y consola sin
errores nuevos. Simulaciones siempre antes de cualquier `--apply`.

## Preguntas abiertas

1. **1.5**: valoraciones antiguas incompletas de una Minilista: ¿conservar la nota y marcarlas (recomendado) o excluirlas del ranking de la madre?
2. **B1.2**: ¿prior = media del conjunto (recomendado) o fijo en 7? ¿m = 3?
3. **B1.3**: ¿el dueño puede migrar solo, o necesita revisión de un administrador a partir de cierto tamaño?
4. **B1.4**: la geocodificación de sitios antiguos cuesta llamadas a Google: ¿se acepta el coste estimado, o solo sitios nuevos y los que tengan componentes guardados?

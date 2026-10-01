# Modelo de Listopic

Cómo funcionan las Listas, las notas y el ranking **hoy, en esta rama**, qué está
preparado para después y qué queda por decidir. Referencia para producto y código.

- Código de las notas: `frontend/src/lib/scoring.ts` (web) y `functions/modules/lib/scoring.js`
  (servidor). Los dos pasan los mismos vectores: `frontend/src/lib/scoring.vectors.json`.
- Colores de nota: `frontend/src/lib/scoreScale.ts` + tokens `--lt-score-*` en `index.css`.
- Orden de criterios: `frontend/src/lib/criteria.ts`.

---

## 1. Vocabulario

| Palabra visible | Qué es | En código / Firestore (no se renombra) |
|---|---|---|
| **Lista** | Ranking temático con criterios propios (Croquetas, Playas…) | `lists/{id}` sin `parentListId` |
| **Minilista** | Lista hija: hereda los criterios de su Lista madre y puede añadir los suyos | `lists/{id}` con `parentListId`, `isSublist: true`; rutas `/create-sublist` |
| **Criterio** | Aspecto que se puntúa de 0 a 10 (Sabor, Textura…) | `criteriaDefinition.{id}` |
| **Valoración** | Lo que una persona pone sobre un elemento en una lista: criterios, comentario, fotos | `lists/{listId}/reviews/{id}` (antes «reseña») |
| **Nota** (de una valoración) | Media de los criterios que cuentan de esa valoración | `overallRating` |
| **Nota Listopic** | Nota de un elemento dentro de una lista: media de las notas de la gente | se calcula al leer (`ListPage`) y en `grouped_items` (Algolia) |
| **Elemento** | Lo que se valora dentro de un sitio: un plato, una playa, una ruta | agrupación por `placeId` + `itemName` |
| **Sitio** | Lugar físico (restaurante, playa, museo) | `places/{googlePlaceId}` |
| **Colección** | Carpeta personal para guardar sitios, elementos o valoraciones (Quiero ir, Ya fui…) | `users/{uid}/archives`, ruta `/archive` |
| **Novedades / Siguiendo** | Feed de lo que publica la gente que sigues | `useFollowingFeed` |

No se han renombrado colecciones, campos ni rutas: solo el texto que ve la persona.
Quedan fuera a propósito el panel de desarrollador, los textos legales, los eslóganes
de la portada y los tipos de sitio de Google («Lugar de culto»…). Los textos de las
notificaciones que genera el servidor todavía dicen «reseña» (ver `siguiente-fase.md`).

---

## 2. Criterios

| Regla | Estado |
|---|---|
| Cada criterio va de 0 a 10 con un paso (0,1 · 0,5 · 1) | Igual que antes |
| Un criterio **cuenta** para la nota (`ponderable: true`, por defecto) o **no cuenta** (`ponderable: false`, p. ej. «Precio», «Picante») | Igual que antes |
| **Ningún criterio viene puntuado**. Nada de 5 por defecto | **Nuevo** (C13 / B0.1) |
| **Todos los que cuentan son obligatorios** para publicar. Los que no cuentan son opcionales y se pueden quitar | **Nuevo** |
| Tocar el deslizador sin moverlo, o pulsar Enter, también puntúa (para poder elegir el 5 a propósito) | **Nuevo** |
| Lista sin ningún criterio que cuente: no se puede valorar y se explica por qué (antes guardaba un 5 inventado) | **Nuevo** |
| Orden estable: al crear o editar una Lista o Minilista se guarda `order`; los criterios antiguos, sin `order`, van por nombre | **Nuevo**. Antes el orden cambiaba en cada carga |

Borradores: los guardados antes de este cambio traían un 5 en todos los criterios
aunque no se hubieran tocado. Esas notas no se recuperan; el nombre y el comentario sí.

### Pesos (×0 · ×1 · ×2 · ×3)

**Actualización B1**: la fuente de verdad es `lists.scoringWeights` (id → 0..3); si falta,
`ponderable` (×1 / ×0). Pesos **activos** (`WEIGHTS_ENABLED = true` en los dos `scoring`):
×0 no cuenta, ×1–×3 cuentan esas veces. Los pesos guardados hoy son todos 0 o 1, así que
activarlos no cambia ninguna nota.

- **Lista sin valoraciones**: «Cuenta para la nota» es un selector No cuenta / ×1 / ×2 / ×3.
- **Lista con valoraciones**: añadir y renombrar criterios, sí; quitar criterios o cambiar
  pesos, solo con **«Cambiar pesos o quitar criterios…»**: se simula en el servidor
  (notas antes → después, cambio máximo, puestos, Minilistas afectadas) y luego aplica un
  administrador. Aplicar exige que nada haya cambiado desde la simulación (huella), guarda
  la nota anterior en `overallRatingBefore`, sube `scoringVersion` y no borra ninguna
  puntuación (un criterio quitado deja de contar, pero su puntuación sigue guardada).
- **Minilistas**: heredan los pesos de la madre y se actualizan con ella; sus criterios
  propios tienen su propio peso.
- Un criterio sin puntuar en una valoración (p. ej. porque se creó después) **no cuenta**
  en su media: nunca 0, 5 ni ningún valor implícito.

---

## 3. Cálculo de notas

### 3.1 Nota de una valoración

```
nota = redondeo_1_decimal( Σ(puntuación_i × peso_i) / Σ(peso_i) )   sobre los criterios que cuentan y están puntuados
peso_i = 1 hoy (0 si no cuenta)
redondeo = Number(x.toFixed(1))   (igual que siempre: 8,25 → 8,3; 7,625 → 7,6)
```

Compatibilidad comprobada: 5.000 casos aleatorios dan **exactamente** el mismo
`overallRating` que el cálculo anterior del formulario.

### 3.2 Nota Listopic de un elemento en una Lista

- **Media simple** de las notas de sus valoraciones visibles, sin redondear para ordenar
  y con un decimal al mostrarla. Es lo que ya hacía `ListPage`.
- **Media por criterio**: entre quienes puntuaron ese criterio. **Corregido**: antes dividía
  entre todas las valoraciones y bajaba la media si alguien no tenía ese criterio.
- **Filtro de bots / solo críticos**: se aplica antes de calcular, en el ranking y **ahora también en el mapa**.

### 3.3 Lista madre ↔ Minilista (B0.3)

Las valoraciones hechas desde una Minilista se guardan en la Lista madre, con `sublistId`.

| Dónde se mira | Qué nota usa una valoración de Minilista |
|---|---|
| **En la Minilista** | Su `overallRating` guardado: incluye los criterios propios de la Minilista |
| **En la Lista madre** | Se **recalcula solo con los criterios de la madre** que tenga puntuados. Los extra no cuentan |
| Si no comparte ningún criterio con la madre | Su `overallRating` guardado (no hay otra base) |

Las valoraciones hechas directamente en la madre usan su `overallRating` guardado tal
cual, aunque después se hayan editado los criterios. Así no cambia ningún resultado histórico.

**Impacto hoy en datos reales (solo lectura): 0 valoraciones públicas afectadas.**
La única Minilista pública con criterios extra («Croquetas pucelanas»: Relleno,
Textura, Rebozado) no tiene valoraciones públicas dentro de su madre. El cambio evita
que el problema aparezca en cuanto se use.

Caso parcial: «Croquetas pucelanas» se creó cuando la madre tenía otros criterios y
hoy solo comparte «Sabor». Sus valoraciones contarían en la madre solo por Sabor
(`partial: true`). Ver pregunta abierta §8.

### 3.4 Servidor (preparado, sin desplegar)

- `recalculateListReviewMetrics` ya sabe calcular una Minilista: lee sus valoraciones en la madre (`sublistId`) y en su propia subcolección antigua.
- El trigger `updateAggregatesOnReviewChange` recalcula también la Minilista afectada. **Antes nadie mantenía las métricas de las Minilistas en el servidor.**
- `averageRating` de la madre y `avgGeneralScore` de `grouped_items` usan la misma regla de §3.3.
- `algolia.js` usa la media bayesiana compartida.

---

## 4. Ranking

> **Actualización B1 (implementado)**: una sola fórmula en toda la app:
> `posición = (n·media + 3·7) / (n + 3)`, sin término de volumen, desempate por nº de
> valoraciones. Se muestra siempre la media real. Se usa en la Lista, «La Carta» del
> sitio, la Home, el perfil, el agregador y Algolia (sitios y elementos). C fijo en 7
> (no la media de cada lista: con C = 8 un 10 con una valoración volvía a encabezar).
> Lo que sigue es el estado anterior y la simulación que llevó a esta decisión.

### 4.1 Qué hay hoy (sin cambios de resultado en esta fase)

| Dónde | Fórmula |
|---|---|
| Página de la Lista (Ranking / Mosaico) | Nota Listopic (media simple); a igualdad, más valoraciones primero |
| Búsqueda (Algolia, `grouped_items`) | `rankingScore = bayesiana × 8 + ln(1 + n) × 4` con `bayesiana = (media·n + 7·5)/(n + 5)` |
| Sitios en búsqueda | lo mismo + `ln(1 + seguidores) × 1,5` |

Centralizado en `scoring.ts` / `scoring.js` (`bayesianRating`, `rankingScore`), con
vectores calculados con la fórmula original de `algolia.js`.

### 4.2 Simulación (B0.7)

Celda = media bayesiana (y entre paréntesis `rankingScore` de búsqueda) según la media
real y el número de valoraciones:

| Media real | 1 val. | 2 val. | 5 val. | 10 val. | 25 val. | 100 val. |
|---|---|---|---|---|---|---|
| 10 | 7.50 (62.8) | 7.86 (67.3) | 8.50 (75.2) | 9.00 (81.6) | 9.50 (89.0) | 9.86 (97.3) |
| 9 | 7.33 (61.4) | 7.57 (65.0) | 8.00 (71.2) | 8.33 (76.3) | 8.67 (82.4) | 8.90 (89.7) |
| 8.5 | 7.25 (60.8) | 7.43 (63.8) | 7.75 (69.2) | 8.00 (73.6) | 8.25 (79.0) | 8.43 (85.9) |
| 8 | 7.17 (60.1) | 7.29 (62.7) | 7.50 (67.2) | 7.67 (70.9) | 7.83 (75.7) | 7.95 (82.1) |
| 7 | 7.00 (58.8) | 7.00 (60.4) | 7.00 (63.2) | 7.00 (65.6) | 7.00 (69.0) | 7.00 (74.5) |
| 6 | 6.83 (57.4) | 6.71 (58.1) | 6.50 (59.2) | 6.33 (60.3) | 6.17 (62.4) | 6.05 (66.8) |

Lectura crítica:

- **En la página de la Lista, una sola valoración de 10 encabeza el ranking.** Contradice
  la decisión «una valoración no debe bastar para encabezar». No se ha cambiado aquí
  porque cambia resultados visibles (queda para B1).
- **En búsqueda pasa lo contrario: el volumen pesa demasiado.** Una media de 6,0 con 100
  valoraciones (66,8) queda por delante de una de 9,0 con 2 (65,0); un 7,0 con 100 (74,5)
  casi empata con un 10 con 5 (75,2).
- La bayesiana sola, sin término de volumen, hace lo que se pidió: 10 con 1 valoración →
  7,5, por debajo de 8,5 con 10 → 8,0 (hay test que lo fija).

**Propuesta para B1** (sin implementar): ordenar la Lista por bayesiana con el
*prior* = media de la propia lista y peso 3–5, **mostrando siempre la media real**; y
marcar «pocas valoraciones» por debajo de 3. En búsqueda, bajar el término de
volumen (×4 → ×1,5) o quitarlo. [Propuesta; conviene validarla con datos cuando haya más volumen.]

---

## 5. Ámbito geográfico (B0.6)

«Ámbito» = el conjunto de elementos con el que se compara uno para darle posición:
«#3 **en Valladolid**», «#1 **a menos de 5 km**».

Qué existe hoy:

| Pieza | Dónde | Notas |
|---|---|---|
| Selector de distancia de la Lista y la Home | `FilterContext`: 1 · 2 · 5 · 10 · 50 · 100 · 500 km o sin límite; 5 km por defecto, recordado por sesión | Filtra por distancia a tu ubicación (haversine en cliente) |
| Radio en Búsqueda | `SearchPage`: 500 m – 50 km o sin límite | Algolia `aroundLatLng` / `aroundRadius` |
| Ciudad / provincia / país del sitio | `places.city`, `province`/`region`, `country` (de Google) → `placeCity`… en `grouped_items` | Existen, pero no se usan para rankings |

**Ajuste del 30/09/2026 (noche): Lista y Home = contexto local; Buscar = explorar.**

- Lista y Home: radios y, en «Donde estás», **tu** ciudad, **tu** comunidad y
  **tu** país. Se deducen del sitio más cercano (ciudad a menos de 15 km,
  comunidad a menos de 120 km, país a menos de 600 km), sin llamar a Google.
  Sin ubicación, solo el país. Ninguna ciudad lejana en el selector. Última
  opción: «Explorar otra zona en Buscar…».
- Buscar: Zona · Ciudad / Provincia / Comunidad / País, cualquiera. Con una sola
  Lista, sin texto y ordenado por puntuación, cada resultado lleva «#N en <zona>».
- Página del elemento: un puesto principal («#3 en Valladolid») y los más
  amplios en pequeño.
- Incertidumbre: cerca de una frontera entre comunidades, la deducida puede ser
  la vecina. Es aceptable mientras no se use la geocodificación inversa de
  Google, que cuesta dinero y hoy solo pueden usar los administradores.

**Implementado (B1, sin desplegar):**

1. Selector en la Lista, de cerca a lejos: radios («A menos de 5 km», …, «Sin límite de
   distancia») → ciudad («Valladolid») → provincia («Valladolid provincia») → comunidad
   («Castilla y León») → país («España»). Sin «mundo». La palabra «ámbito» no se muestra.
2. La zona elegida filtra y ordena Ranking, Mosaico y Mapa por igual; se recuerdan la zona
   y la vista.
3. «#3 en Valladolid» con la fórmula única del §4, dentro de cada zona con **≥ 3**
   elementos. En la tarjeta, una sola etiqueta (la zona más concreta que aporte algo, sin
   repetir la que ya se está mirando); el resto, en las estadísticas del sitio.
4. CCAA con nombre único (`normalizeCcaa`, web y servidor) y ciudad con alternativas
   (`postal_town`, niveles administrativos 3 y 4) al guardar desde Google.

Datos (solo lectura, 30/09/2026): de 141 sitios, ciudad 93 %, provincia 95 %, CCAA 99 %.
Los ~10 sin ubicación se arreglan a mano desde Developer (ver `google-places-skus.md`).

---

## 6. Nota global del sitio (B0.8)

Decisión tomada: el sitio tiene una **Nota Listopic global** de todos sus elementos, y
el detalle por lista va escondido en sus estadísticas. «La nota de la comunidad es la
media de las notas de la gente.»

Opciones estudiadas con **datos reales públicos** (solo lectura, 30/09/2026):
119 valoraciones públicas, 99 sitios. **82 sitios tienen una sola valoración**; 17
tienen 2 o más; solo 4 aparecen en más de una lista y 6 tienen más de una persona.

| Opción | Definición | Diferencia con A (17 sitios con ≥ 2) | Cambios de orden |
|---|---|---|---|
| **A** Media de todas las valoraciones | lo que guarda hoy `places.averageRating` | — | — |
| **B** Media de medias por lista | cada lista pesa igual | media 0,03 · máx 0,32 | 6 de 17 posiciones |
| **C** Media de medias por elemento | cada plato/elemento pesa igual | media 0,01 · máx 0,15 | 0 |
| **D** Bayesiana de A (prior 7, peso 5) | encoge hacia 7 con pocas valoraciones | media **0,62** · máx **1,39** | 4 de 17 |
| **E** Media de medias por persona | cada persona cuenta una vez | media 0,02 · máx 0,31 | 0 |

Conclusión:

- **Hoy A, B, C y E son prácticamente iguales**: con tan pocos datos la elección no cambia nada visible.
- **Recomendación: A para mostrar** (coincide con la decisión tomada), siempre junto al número de valoraciones, y **D solo para ordenar** sitios.
- **Estado: provisional** (decisión del 30/09/2026). Revisar cuando haya ≥ 50 sitios con ≥ 5 valoraciones.
- Para **ordenar** sitios (búsqueda, Home) se usa la fórmula única del §4, no la media simple.
- Reevaluar **E** (una persona = un voto) cuando haya sitios con muchas valoraciones de la misma persona. Es la mejor defensa contra que alguien infle un sitio.
- Detalle por lista (B) en las estadísticas del sitio, como se decidió. **Implementado**: pestaña «Estadísticas» de la ficha, con nº de valoraciones, media por Lista y puesto de cada elemento en su Lista.

---

## 7. Otras reglas del modelo

- **Sin lista no hay Nota Listopic (B0.9).** Un elemento se puede guardar en una Colección como «probado» o «pendiente» sin nota. No hay un sistema paralelo de notas rápidas.
- **Novedades / Siguiendo se mantiene (B0.10).**
- **Genérico (B0.11)**: los textos nuevos hablan de «sitio» y «elemento», no de restaurante y plato («Elige un sitio (restaurante, playa…)»). Quedan textos de comida en pantallas existentes («La Carta», «platos», «Ver platos sueltos»); ver `siguiente-fase.md`.
- **Accesibilidad, intolerancias y mascotas**: ya existen como datos (`accessibilityOptions`, `petOptions`, filtro sin gluten) y como filtros de la Lista. Falta darles visibilidad en la ficha del sitio y del elemento.
- **Filtro de bots** en las Listas: se mantiene, con etiqueta visible.
- **Visibilidad (01/10/2026):** cada valoración guarda `visibility`, igual a la
  de su lista real (la Minilista si la hizo desde ella). **Una Minilista nunca
  es más pública que su madre**: con la madre privada solo puede ser privada.
  Si la madre pasa a privada, el servidor cierra sus Minilistas; si vuelve a
  pública, las Minilistas no se abren solas. Lo aplican la web, las reglas y el
  trigger `syncListVisibility`.

---

## 8. Decisiones del 30/09/2026 (plan en `plan-fase-B1.md`)

- Las Minilistas comparten **siempre** todos los criterios de la madre.
- Al activar pesos, las valoraciones históricas **se recalculan**, con simulación y comparación antes/después.
- Con valoraciones, «cuenta / no cuenta» y el peso quedan **bloqueados** salvo una migración explícita.
- **Ranking único** bayesiano en toda la app.
- Ámbito: ciudad → provincia / CCAA → España, más los radios de distancia.
- Nota global del sitio: **media simple, provisional** mientras haya pocos datos.

Las preguntas siguientes quedan como registro; las que siguen vivas están en `plan-fase-B1.md`.

## 9. Preguntas abiertas (históricas)

1. **Minilista con criterios viejos de la madre** (caso parcial de §3.3): ¿contar en la madre solo con los criterios comunes (lo implementado) o no contar en la madre hasta que se valoren todos los criterios actuales de la madre?
2. **Pesos**: al activarlos, ¿se recalculan las notas guardadas con los pesos nuevos o se respeta la nota que la persona vio al publicar? Recomiendo respetarla (guardar `weightsVersion` en la valoración) y recalcular solo la Nota Listopic.
3. **Editar criterios de una lista con valoraciones**: hoy el creador puede cambiar qué cuenta y la nota guardada no se recalcula. ¿Bloquear cambios de «cuenta / no cuenta» cuando ya hay valoraciones?
4. **Ranking de la Lista** (§4.2): ¿aprobar la bayesiana con prior de la lista para B1?
5. **Ámbito** (§5): ¿ciudad o provincia como primer ámbito con nombre? ¿Mínimo de elementos para mostrar la posición?

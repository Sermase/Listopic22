# Siguiente fase — recomendaciones y orden

Punto de partida: FASE A y B0 terminadas en la rama `Mejoras-Opus-5.5-29-09-2026`
(ver `informe-fase-A.md`). El modelo de notas está en `modelo-listopic.md`.

Leyenda de certeza: **[Hecho]** comprobado · **[Probable]** con indicios fuertes ·
**[Propuesta]** criterio de producto, a validar.

---

## 0. Antes de nada: desplegar lo preparado (bloquea todo lo demás)

Sin esto, las métricas de Minilista y la seguridad nueva no existen en producción.
Orden y comandos exactos en `informe-fase-A.md` §6. Resumen:
Functions → Hosting (fusionar en `main`) → reglas → índices → scripts (primero en simulación).

---

## 1. B1 — propuesta ordenada

| # | Qué | Por qué | Depende de | Migración | Riesgo |
|---|---|---|---|---|---|
| 1 | **Ranking de la Lista con bayesiana** (prior = media de la lista, peso 3–5), mostrando la media real y «pocas valoraciones» con < 3 | Hoy 1 valoración de 10 encabeza la Lista [Hecho, simulación en `modelo-listopic.md` §4.2] | Decisión §8.4 del modelo | No: se calcula al leer | Bajo. Cambia el orden visible; conviene avisar en Novedades |
| 2 | **Bajar el peso del volumen en búsqueda** (`ln(1+n)×4` → ×1,5 o quitarlo) | Un 6,0 con 100 valoraciones supera a un 9,0 con 2 [Hecho] | Functions desplegadas | Reindexar Algolia (función admin existente) | Bajo |
| 3 | **Pesos ×0–×3** | Diferencial de Listopic: cada crítico decide qué importa | Decisión §8.2 (respetar notas guardadas) | No, si se guarda `weightsVersion` y no se recalculan valoraciones antiguas | Medio: UI de creación y explicación a la gente |
| 4 | **Nota global del sitio**: mostrar A (media) con nº de valoraciones y el detalle por lista en estadísticas | Decisión ya tomada; datos reales dicen que A ≈ B ≈ E hoy [Hecho] | — | No | Bajo |
| 5 | **Ámbito geográfico con nombre** («#3 en Valladolid») | Pedido explícito | Medir antes cuántos `places` tienen `city`/`province` (script de solo lectura) | Quizá rellenar `city` en sitios antiguos (script) | Medio: datos de Google incompletos |
| 6 | **Accesibilidad, intolerancias y mascotas** visibles en la ficha del sitio y del elemento | Los datos existen y solo se usan como filtro | — | No | Bajo |
| 7 | **«Proponer lista»** + pestaña en Developer ordenable por nombre de la propuesta y por usuario | Pedido explícito | Reglas + tests nuevos (colección `listProposals`) | No | Bajo |
| 8 | **Bloquear «cuenta / no cuenta»** en listas con valoraciones, o recalcular | Hoy puede desalinear notas guardadas [Probable] | Decisión §8.3 | Según decisión | Medio |

---

## 2. Futuro (documentado, sin fecha)

### 2.1 Elementos que no son de Google Maps
Hoy el id de un sitio **es** el `googlePlaceId` y las reglas lo exigen al crear
(`googlePlaceId == placeId`). Un sitio manual necesitaría:
- ids propios (`manual_<uuid>`) y una regla de creación distinta (con moderación);
- coordenadas desde el mapa propio (ver 2.2) en lugar de Google;
- decidir qué pasa si luego aparece en Google (fusión: ya existe la herramienta de fusión en Developer).

### 2.2 Mapas independientes de Google
**Explorar visualización cartográfica independiente de Google Maps usando las coordenadas existentes.**
- Las coordenadas ya están en `places` y en las valoraciones; Leaflet ya pinta los mapas.
- Incidente de esta fase: CARTO empezó a exigir clave y los mapas dejaron de verse; se pasó a teselas de Esri [Hecho]. Depender de un proveedor gratuito sin contrato es frágil.
- Opciones: MapLibre GL + teselas vectoriales propias (Protomaps en Storage/CDN, coste casi fijo) o un proveedor con contrato (MapTiler, Stadia). Evitar los servidores de OpenStreetMap (bloquean sin Referer, que es lo que pasa en la app Android con `https://localhost`).
- Google seguiría solo para buscar sitios (Places), no para pintar.

### 2.3 Textos pendientes
- Notificaciones y correos del servidor todavía dicen «reseña» (`functions/`).
- Textos de comida en pantallas genéricas: «La Carta», «platos», «Ver platos sueltos», «Nadie ha escrito… sobre este plato». Propuesta: «Elementos» y textos neutros según la categoría de la lista.
- «Valorar» / «Nueva valoración» ya unificados en las pantallas de usuario.

---

## 3. Deuda y hallazgos que no entraron en esta fase

| Hallazgo | Estado | Propuesta |
|---|---|---|
| Índices de producción sin exportar: el archivo del repo puede no coincidir con lo desplegado | [Probable] | `firebase firestore:indexes --project listopic > prod-indexes.json`, comparar y **después** desplegar índices (el CLI ofrece borrar los que no estén en el archivo: responder que no) |
| Consulta de listas públicas por `isPublic` + `createdAt` sin índice (aviso en consola de la Home) | [Hecho] | Índices añadidos a `firestore.indexes.json`, sin desplegar |
| Perfil ajeno: «Listas 0» y error de permisos al leer `followingLists` sin sesión | [Hecho], ya pasaba antes de esta fase | Decidir si las listas seguidas son públicas; si no, ocultar ese contador para visitantes |
| Contador de «me gusta» que puede no persistir (regla ±1 y flujos antiguos) | [Probable] | Mover los contadores de reacciones a un trigger del servidor, como los demás |
| Cascada de triggers (una valoración dispara varias recomposiciones) | [Probable] | Medir invocaciones en producción antes de optimizar |
| Campos de Stripe/negocio en `places` | [Hecho] | Moverlos a `businessProfiles/{placeId}` con reglas propias |
| App Check sin activar | [Hecho] | Activarlo en web y Android antes de abrir más endpoints |
| C7: reutilizar datos de Google < 30 días | No autorizado en esta fase | Ahorro de coste; bajo riesgo |
| Tema claro: siguen muchas reglas `!important` heredadas | [Hecho] | Ir sustituyéndolas por tokens pantalla a pantalla (patrón usado en el hero y la escala de notas) |
| `ProfilePage.tsx` (3.500 líneas), `HomePage.tsx`, `ListPage.tsx` enormes | [Hecho] | Partir solo cuando se toque cada zona; no refactor general |
| Finales de línea mezclados (CRLF/LF) en el repo | [Hecho] | Añadir `.gitattributes` y normalizar en un commit aparte, sin otros cambios |

---

## 4. Orden recomendado

1. Desplegar lo preparado (§0) y vigilar 48 h: consola de Functions, avisos de reglas denegadas y métricas de Minilistas.
2. B1.1 + B1.2 (ranking): cambian la percepción de calidad sin migraciones.
3. B1.4 + B1.6 (ficha del sitio): poco riesgo, mucho valor visible.
4. B1.3 (pesos): cuando las decisiones §8.2 y §8.3 estén tomadas.
5. B1.5 (ámbito) tras medir la calidad de `city`/`province`.
6. B1.7 (Proponer lista).
7. Mapas independientes (2.2): en paralelo como investigación.

# Validación funcional (30/09/2026)

Hecha en un **entorno equivalente**: emuladores de Auth, Firestore y Functions
(proyecto `demo-listopic`, nada llega a producción), con la web en modo emulador
(`VITE_USE_EMULATORS=true`). Datos sembrados:
- 6 sitios en Valladolid (3), Medina, León y Madrid;
- Lista madre «Patatas bravas» con una Minilista con un criterio propio;
- un bot con dos valoraciones `private` en una lista pública, que reproduce el
  caso de producción.

Búsqueda se probó contra el índice **real** de Algolia, solo lectura y con la clave pública.

Cómo repetirlo (desde la raíz del repositorio):

```
cd functions && ../firestore-tests/node_modules/.bin/firebase emulators:start --only auth,firestore,functions --project demo-listopic
# en otra terminal
cd frontend && VITE_USE_EMULATORS=true npx vite
```

(En `functions/.secret.local` hacen falta valores ficticios de los secretos. Ese
archivo está en `.gitignore`.)

## Qué se ha comprobado

| Paso | Resultado |
|---|---|
| Añadir el criterio «Textura» a una Lista con valoraciones | ✅ Se guarda con peso ×1; el trigger lo copia a la Minilista; **ninguna nota antigua cambia** |
| Criterios fijos con valoraciones | ✅ Selectores de peso bloqueados; aviso visible; botón «Cambiar pesos…» |
| Nueva valoración con todos los criterios | ✅ Nota en vivo (9 + 8 + 7) / 3 = **8**; «Precio» (×0) no cuenta; se guarda 8 |
| Orden del ranking | ✅ Coincide con la fórmula única, calculada a mano |
| Cambio de zona | ✅ Radios, tu ciudad, tu comunidad y tu país; lo que se filtra coincide en las tres vistas |
| Cambio de vista | ✅ Ranking / Mosaico / Mapa; zona y vista se recuerdan al recargar |
| Ficha de sitio | ✅ Nota 7,3 = media de 3; puestos «#3 en Valladolid…» |
| Minilista | ✅ Nota con su criterio propio (6,8); la madre la calcula sin él |
| Simular migración (dueña y administradora) | ✅ Cifras correctas (p. ej. (9·3 + 8) / 4 = 8,8); la dueña no ve «Aplicar» |
| **Cancelar** la migración | ✅ Firestore **idéntico** antes y después (comparado documento a documento) |
| Aplicar la migración (solo emulador) | ✅ Pesos nuevos en la Lista y la Minilista, `overallRatingBefore`, `scoringVersion` 2, métricas recalculadas, formulario recargado |
| Marca ×3 en el formulario | ✅ «Sabor ×3» |
| Perfil del bot tras sincronizar la visibilidad | ✅ Enseña sus 3 valoraciones |
| Zona en Buscar (índice real) | ✅ Ciudades y provincias con recuentos. Comunidad y país salen vacíos hasta reindexar |
| Puesto en Buscar | ✅ «#1 en Madrid», «#2…» con una Lista, una zona, sin texto y orden por puntuación |
| Página del elemento | ✅ «#2 en Valladolid · Patatas bravas» y, debajo, provincia · CyL · España |
| Estados | ✅ Lista vacía, zona vacía (con «Ver toda la Lista»), no disponible y error |

## Valoraciones «desaparecidas» de ListopIA

**No se han borrado. Están ocultas.**

- Perfil `ListopIA` (uid `TtU5VnnJGyNOzYMjcoAOPvhAap82`, tipo bot). Su perfil
  público dice 79 valoraciones; la consulta del perfil devuelve **40**, todas de
  Pizzas, Hamburguesas y Brunch.
- Algolia, que el servidor rellena leyendo todas las valoraciones, sigue teniendo:
  - Patatas bravas: 37 valoraciones, de las que **29** tienen autor bot;
  - Playas: 12 valoraciones, de las que **8** tienen autor bot.
- Con acceso público solo se leen **5** de Patatas bravas y **3** de Playas: las que tienen `visibility: 'public'`.
- La suma de las diferencias (32 + 9 = 41) coincide exactamente con las
  valoraciones no públicas de toda la base (160 − 119).

**Qué las oculta, exactamente:**
1. La consulta del perfil (`useReviews` →
   `collectionGroup('reviews').where('visibility','==','public').where('userId','==',uid)`,
   desde el 03/09/2026). La Lista usa el mismo filtro
   (`useListDetails`: `where('visibility','==','public')` en listas públicas).
2. La regla `list` de `/{path=**}/reviews` solo deja listar valoraciones con
   `visibility == 'public'` a quien no es el autor ni tiene acceso a la lista.
3. La causa probable de que se quedaran en `private` (o sin el campo): el
   interruptor pública/privada de **Developer → Listas** cambiaba la lista pero
   **no** sus valoraciones. «Editar lista» sí lo hacía.

Sin credenciales de administrador no he podido leer esos documentos para
distinguir `private` de «sin campo». Para ambos casos, el arreglo es el mismo.

**Riesgo de pérdida: ninguno observado.** No se ha escrito nada en producción.
**Riesgo de ocultación: sí, en esas 41 valoraciones**, hasta sincronizarlas:
1. Solo lectura, para confirmar las cifras:
   `cd functions && GOOGLE_APPLICATION_CREDENTIALS=… node scripts/audit-review-visibility.js --user=TtU5VnnJGyNOzYMjcoAOPvhAap82`
2. Si cuadra, corregir (escribe **solo** `visibility`):
   `… node scripts/audit-review-visibility.js --apply`
   También sirve abrir «Editar lista» en Patatas bravas y en Playas y guardar
   sin cambios: guardar sincroniza sus valoraciones.

## Fallos encontrados

| # | Fallo | Estado |
|---|---|---|
| 1 | Developer → Listas pública/privada no sincroniza la visibilidad de las valoraciones (causa de lo de ListopIA) | **Corregido** (+ script) |
| 2 | «Editar lista» en una madre intentaba cambiar también las valoraciones hechas desde sus Minilistas. Si la Minilista tenía otra visibilidad, la regla lo rechazaba y el guardado quedaba a medias (la lista cambiada y las valoraciones no) | **Corregido**: cada valoración sigue a su lista real |
| 3 | Falta el índice `reviews.userId` (grupo de colecciones): fallan `deleteOwnAccount`, `propagateAuthorFieldsToReviews`, «Recalcular usuarios» y, probablemente, la gamificación | **Pendiente de tu decisión**: índice exacto en `developer-revision.md` |
| 4 | Una lista inexistente se mostraba como «Lista Privada» | **Corregido** («Lista no disponible») |
| 5 | Lista vacía y «no hay nada cerca» daban el mismo mensaje | **Corregido** |
| 6 | La Lista ofrecía ciudades lejanas (Madrid estando en Valladolid) | **Corregido**: contexto local |
| 7 | Con «España» elegida, el mapa seguía encuadrado al radio | **Corregido** (Lista y Home) |
| 8 | Cabecera del mapa: el selector tapaba «Mapa» en móvil | **Corregido** (Lista y Home) |
| 9 | «#4 en España» mirando toda la Lista (redundante) | **Corregido** |
| 10 | La migración listaba «Patatas bravas» en todas las filas, sin el sitio | **Corregido** |
| 11 | Perfil sin sesión: error de consola al leer `followingLists` | **Corregido** |
| 12 | Tema claro: el logo no se leía sobre las cabeceras de sitio y elemento; el rótulo «Sin foto del grupo» asomaba tras el título | **Corregido** |
| 13 | En Algolia la provincia se rellenaba con la comunidad si faltaba | **Corregido** (servidor, sin desplegar) |
| 14 | `PlaceService` y `config.ts` usaban URLs fijas de producción incluso en local | **Corregido** solo en modo emulador |
| 15 | La nota global del sitio incluye bots; los puestos, no | Documentado; se decide con la nota global definitiva |
| 16 | Buscar (móvil): elegir una ciudad o provincia con 1 resultado mostraba la pantalla de error. El minimapa oculto (0×0) hacía `flyTo` y Leaflet calculaba coordenadas NaN | **Corregido (01/10)**: el encuadre espera a que el mapa tenga tamaño (también en la Lista y en Developer) |
| 17 | Perfil: el filtro por Listas solo ofrecía las Listas de las valoraciones ya cargadas en el mosaico | **Corregido (01/10)**: sale de todas sus valoraciones visibles (hasta 1000), con número |
| 18 | Cabecera con foto: en móvil la foto acababa en corte; en escritorio se ampliaba muchísimo. `ProgressiveImage` anulaba el `absolute inset-0` del contenedor | **Corregido (01/10)**: la foto rellena la cabecera (en móvil recorta los laterales); en pantallas anchas va centrada sobre la misma desenfocada. Arregla también miniaturas de valoraciones y Home |
| 19 | Etiquetas repetidas en las tarjetas de Buscar («Picantes» doble) | **Corregido (01/10)** |
| 20 | Algolia (`grouped_items`) calculaba los elementos de una Lista pública con **todas** sus valoraciones, también las de Minilistas privadas: movían nota y puesto en Buscar y podían prestar su foto o etiquetas | **Corregido (02/10)**: el índice solo usa valoraciones `public`. Requiere desplegar Functions y «Reindexar todo». Los agregados internos (tarjeta de la Lista) no cambian: decisión pendiente |

Falsa alarma: el botón flotante que tapaba «Publicar valoración» son las
herramientas de TanStack Query, que solo existen en desarrollo.

## Zona en Buscar (01/10)

Botón «Zona: toda» que abre un panel (hoja inferior en móvil) con el árbol
país → comunidad → provincia → ciudad, el número de resultados y un buscador.
Se pueden elegir varias zonas de niveles distintos (Comunidad de Madrid +
Segovia provincia, o Madrid + Barcelona): se combinan con O. El árbol sale de
los resultados de la búsqueda actual sin la zona, leyendo solo los cuatro
campos de zona (hasta 1000 resultados; hoy hay 155 elementos y 143 sitios). Si a
un resultado le falta la provincia, su ciudad cuelga de la comunidad. Las zonas
van en la URL (`zone=nivel:valor`) y «#3 en …» usa la selección
(«#1 en Madrid + Barcelona»). Comprobado contra el índice real, solo lectura.

**Límite conocido:** con más de 1000 resultados el árbol solo cuenta los
primeros 1000 (el panel lo avisa). Para entonces conviene un atributo
jerárquico en Algolia (`zone.lvl0…lvl3`), que requiere reindexar.

## Pendiente

- **Desplegar** (tú): Functions (Algolia con comunidad y país, agregador,
  migración), reglas (sin cambios desde la última tanda) y, después, en
  Developer → Algolia: «Configurar índices» y «Reindexar todo». Sin reindexar,
  «Comunidad» y «País» salen vacíos en Buscar. Todo lo demás funciona.
- Índice `reviews.userId` (ver `developer-revision.md`).
- Reparar la visibilidad de las valoraciones (arriba).
- Limpieza de Developer: pendiente de tu visto bueno.
- Los puestos de Buscar incluyen valoraciones de bots, porque Algolia las
  cuenta; la Lista los excluye por defecto. Con muchos bots pueden diferir.

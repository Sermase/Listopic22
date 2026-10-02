# Coste en Google de «Actualizar desde Google» (Developer → Sitios)

Verificado el 30/09/2026 contra la documentación oficial de Google:
- Campos → SKU de Place Details (New): <https://developers.google.com/maps/documentation/places/web-service/place-details>
- Campos → datos de Place Details heredado: <https://developers.google.com/maps/documentation/places/web-service/legacy/details>
- Cupos gratuitos y precios: <https://developers.google.com/maps/billing-and-pricing/pricing>

Los precios y cupos los cambia Google; revisar esas páginas antes de una tanda grande.

## Qué hace cada actualización

Función: `adminUpdateSinglePlace` (`functions/modules/core.js`). Solo `jefe`.
**2 llamadas por sitio**, ninguna descarga de fotos.

| # | Endpoint | Campos pedidos | SKU que factura | Cupo gratis / mes | Precio después (por 1.000) |
|---|---|---|---|---|---|
| 1 | `GET maps.googleapis.com/maps/api/place/details/json` (Places API **heredada**) | `name, place_id, formatted_address, geometry, url, photos, vicinity, address_components, types` | **Places Details** (FC5C-DF28-543F) + **Basic Data** (75D4-C522-326B) | 5.000 · Basic ilimitado | 17 $ · 0 $ |
| | | `website, international_phone_number` | **Contact Data** (F095-CD01-81B2) | **1.000** | 3 $ |
| | | `price_level, rating, user_ratings_total` | **Atmosphere Data** (D63D-5CC5-302A) | **1.000** | 5 $ |
| 2 | `GET places.googleapis.com/v1/places/{id}` (Places API **New**), `X-Goog-FieldMask: accessibilityOptions,allowsDogs` | `accessibilityOptions` (Pro) + `allowsDogs` (Enterprise + Atmosphere) | **Place Details Enterprise + Atmosphere** (EB23-5ECC-F753): se factura el SKU más alto de los campos pedidos | **1.000** | 25 $ |

## Cuántos sitios se pueden actualizar gratis

- El cupo es **mensual** y por SKU (no diario). El más bajo es **1.000**: Contact Data, Atmosphere Data y Enterprise + Atmosphere.
- Máximo teórico gratis: **~1.000 sitios al mes**, **pero compartido** con todo lo que use esos SKU. Por ejemplo, el alta de sitios nuevos (`place_details_google`) pide los mismos datos de contacto y atmósfera.
- Los **~10 sitios sin ubicación** caben de sobra: 20 llamadas.

Incertidumbre: los números son los publicados hoy. El consumo real del mes está en
Google Cloud → Facturación → Informes (filtrar por SKU) y, desde el despliegue de
estas Functions, en Developer → Uso de API («Actualizar sitio desde Developer»).

## Opción barata «Solo ubicación» (recomendada para los sitios sin ubicación)

Callable `adminRefreshPlaceLocation` (nuevo, sin desplegar). Botón «Solo ubicación» en Developer → Sitios.

| Endpoint | Campos | SKU | Cupo gratis / mes | Llamadas por sitio |
|---|---|---|---|---|
| `GET places.googleapis.com/v1/places/{id}`, `X-Goog-FieldMask: addressComponents` | `addressComponents` | **Place Details Essentials** (6E05-E1C3-8D85) | **10.000** | **1** |

Solo escribe `city`, `province`, `region` (CCAA normalizada), `country` y `postalCode`. No toca contacto, fotos, valoración de Google ni accesibilidad.

## Flujo manual seguro para los sitios sin ubicación

Requisito: **desplegar antes las Functions de esta rama**. La versión nueva busca la
ciudad también en `postal_town` y en los niveles administrativos 3 y 4, que son
justo los casos de pueblo que faltan, y normaliza la CCAA.

1. Developer → Sitios → **Cargar**.
2. **«Sel. sin ubicación (N)»**: selecciona solo los que no tienen ciudad, provincia o CCAA.
3. Revisa la lista seleccionada.
4. **«Solo ubicación»** (recomendado: 1 llamada Essentials por sitio) o, si también quieres refrescar contacto y accesibilidad, **Actualizar** (2 llamadas, cupos de 1.000). La web avisa del coste exacto antes y **se niega a hacer tandas de más de 25**.
5. Comprueba en el registro de la pestaña que cada uno sale ✅ y, si quieres, pasa el script de solo lectura `node functions/scripts/audit-place-locations.js`.

Si alguno sigue sin ciudad tras actualizar, Google no la tiene para ese sitio. Se puede
completar a mano desde el editor del sitio en Developer.


## Actualización de sitios y contador por SKU (02/10/2026)

### Cuándo se llama a Google

| Quién | Sitio con propietario¹ | Sin propietario |
|---|---|---|
| Valorar o abrir un sitio (`getPlaceDetailsFromGoogle`) | **Nunca** (devuelve lo guardado) | Solo si el último refresco **completo** (`lastGoogleSync`) tiene **30 días o más**, o si el sitio es nuevo |
| Developer → ficha → «Actualizar desde Google» (`force=1`, solo jefe) | Sí | Sí |
| Developer → Sitios → Actualizar / Solo ubicación / Imagen rota | Sí | Sí |

¹ `businessOwnerUserId`, `businessVerified` o `businessManagerIds`. Una solicitud pendiente (`businessClaimId`) no cuenta. Lo que edita el negocio (ficha oficial) tiene prioridad sobre Google al mostrarse, así que un refresco manual no lo pisa.

«Solo ubicación», «estado» e «imagen» no cuentan como refresco completo: no impiden el refresco de 30 días.

### Lo que queda registrado en cada sitio

- `lastGoogleRefreshAt`: fecha del último refresco de cualquier tipo.
- `lastGoogleRefreshType`: `alta` · `valoracion` · `manual` · `ubicacion` · `estado` · `imagen`.
- `lastGoogleRefreshSkus`: SKUs consumidas en ese refresco.
- `lastGoogleSync`: se mantiene; es el del último refresco completo.

En Developer → Sitios, la columna «Google» ordena por el último refresco completo y debajo muestra el último de cualquier tipo. Los sitios con propietario llevan la etiqueta «propietario».

### «Actualizar imagen rota» (Developer → Sitios, botón 🖼 por sitio)

1. Si el sitio tiene **foto propia** (`userPhotoUrl` o fotos en `places/{id}/photos`), no hace nada.
2. Si la imagen actual **carga**, no hace nada. Lo comprueba con una petición HEAD, que es gratis. Las URL heredadas con `key=` se dan por rotas sin pedirlas, porque cada petición se factura.
3. Si ya se ha gastado el **cupo gratis de fotos del mes** (1.000), se para y pregunta antes de pagar.
4. Pide una URL nueva con el nombre de foto guardado (**Place Details Photos**, 1 llamada). Si el nombre ha caducado, antes vuelve a pedir la lista de fotos (campo `photos` → **Essentials IDs Only**, gratis).

Incertidumbre: la URL que da Google (`photoUri`) dura poco por diseño. Volverá a romperse con el tiempo. La solución de fondo es la foto propia del sitio (bloque de fotos, pendiente).

### Contador por SKU

- `googleUsage/{AAAA-MM}`: mes de facturación de Google, en hora del Pacífico.
- Lo suma `logApiUsage` con las SKUs de cada acción (`functions/modules/lib/google-usage.js`).
- Developer → Uso de API → «Google este mes por tipo de llamada» muestra, por SKU: usadas, gratis al mes, quedan gratis y coste estimado. Lo calcula `adminGoogleUsage`.
- **No incluye lo que pide el navegador** (autocompletar y fotos con `getURI` de Maps JS), que se factura aparte.
- [Incierto] Text Search y Nearby Search heredados: Google dice que devuelven todos los campos «y se factura en consecuencia», sin desglose. Contamos también Contact y Atmosphere (cota superior). Ojo: comparten el cupo de 1.000 de esas SKUs con las altas de sitios.

### Arreglado de paso

- `adminUpdateSinglePlace` registraba cada actualización **dos veces**: `admin_update_place_google` + `admin_single_update`.
- `apiUsageStats` guardaba `byAction.x` como un campo literal con punto: `set` con `merge` no interpreta rutas. Por eso Developer no veía el desglose por acción. Ahora es un mapa. Los días anteriores al despliegue siguen sin desglose.
- `syncPlaceStatusFromGoogle` (estado abierto/cerrado) no quedaba registrado. Ahora sí.

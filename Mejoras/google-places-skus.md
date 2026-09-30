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


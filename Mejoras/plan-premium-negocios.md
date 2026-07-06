# Propuesta — Completar Business Pro (premium de negocios)

Fecha: 2026-07-06
Rama: `claude/premium-business-version-r18qeh`
Estado: **Fase A implementada** en esta rama (entitlements + gestión manual + capado central con flag desactivado). Fases B y C pendientes.

Implementado (Fase A):
- `functions/modules/lib/business-plan.js` — helpers de plan compartidos.
- `functions/modules/admin/admin-plans.js` — `adminSetBusinessPlan`, `adminSetUserPlan`, scheduled `expireManualPlans` (diaria 03:30 Europe/Madrid).
- Guard en `stripe-business.js`: el webhook no degrada planes con `businessPlanSource` manual/trial; al activar por Stripe, `source` pasa a `'stripe'`.
- `frontend/src/utils/businessPlan.ts`, `hooks/useBusinessPlan.ts`, `components/RequireBusinessPro.tsx` (paywall con checkout), `config/features.ts` (`BUSINESS_PRO_ENFORCED = false`).
- `BusinessManagePage`: pestañas Pro envueltas en `RequireBusinessPro`, chip de procedencia/caducidad del plan.
- Developer → pestaña **Planes** (`PlansManagerTab`): conceder/quitar Business Pro por local y premium por usuario, con duración (indefinida/1m/3m/fecha) y notas; accesible también con `?tab=plans`.
- Requiere desplegar functions (`firebase deploy --only functions`) para que existan las callables y la scheduled.

Implementado además (inicio de Fase C — pestañas Pro funcionales):
- **Capado real activado**: `BUSINESS_PRO_ENFORCED = true`. Los locales sin Pro ven el paywall; el Pro se concede en Developer → Planes.
- `functions/modules/business-pro.js`: callables `updateBusinessVisual`, `updateCanonicalItemBusinessData`, `saveBusinessOffer`, `deleteBusinessOffer` (gestor + plan Pro activo, jefe siempre puede; sanitización, rate limit 100/día por local, audit log).
- Datos: `places/{id}/businessPro/visual` (portada URL, color de acento, estilo, texto destacado), `places/{id}/items/{itemId}.businessData` (grupo, precio, descuento, ingredientes, descripción, disponible), `places/{id}/offers/{offerId}` (título, descripción, condiciones, fechas, estado borrador/activa, máx. 20).
- Reglas Firestore: `businessPro` y `offers` legibles públicamente, escritura solo por Cloud Functions. **Desplegar también** `firebase deploy --only firestore:rules`.
- UI: `components/business/BusinessProSections.tsx` sustituye a los prototipos con formularios reales y botones de guardar; eliminado el chip "Modo pruebas".
- Pendiente de Fase C: mostrar estos datos en `PlacePage` (portada personalizada, carta oficial, ofertas activas), subida de imagen de portada a Storage, limpieza automática de ofertas caducadas, merges de items con aprobación admin y estadísticas.

**Regla de expiración de contenido Pro (invariante del producto):** al cancelar
o caducar el plan, los datos Pro NUNCA se borran — solo dejan de mostrarse.
Ninguna vía de degradación (revocación manual, scheduled de caducidad, webhook
de Stripe) toca `businessPro/`, `items/*.businessData` ni `offers/`; únicamente
cambian los campos de plan del lugar. Cuando `PlacePage` pinte contenido Pro,
debe capar SIEMPRE por `getBusinessPlanFromPlace(place).isPro`, de modo que al
reactivar el plan todo el contenido reaparezca tal cual quedó.

---

## 1. Diagnóstico del estado actual

Lo que ya existe y funciona (o casi):

| Pieza | Dónde | Estado |
|---|---|---|
| Checkout de Stripe (callable `createBusinessProCheckoutSession`) | `functions/modules/stripe-business.js` | Hecho, sin usar desde la UI |
| Webhook de Stripe con verificación de firma | `functions/modules/stripe-business.js` (`stripeBusinessWebhook`) | Hecho, falta configurar secrets y endpoint en Stripe |
| Campos de plan en el lugar | `places/{placeId}`: `businessTier`, `businessProActive`, `businessBillingStatus`, `stripeCustomerId`, `stripeSubscriptionId` | Solo los escribe el webhook |
| Cache de suscripciones | colección `businessSubscriptions/{subscriptionId}` | Hecho (la escribe el webhook) |
| Servicio frontend | `frontend/src/services/BusinessBillingService.ts` | Hecho, nadie lo llama |
| UI de gestión del negocio | `BusinessManagePage.tsx`: pestañas Datos generales / Imagen / Elementos / Patrocinado | Pestañas Pro abiertas como prototipo ("modo pruebas"); el botón Business Pro solo muestra un aviso |
| Panel Developer | `DeveloperPage.tsx` + `BusinessClaimsManagerTab` + `BusinessManagersTab` | No hay gestión de planes |
| Patrón admin backend | `functions/modules/admin/*` con `assertJefeAccess` + `writeAuditLog` | Listo para reutilizar |

Lo que falta:

1. **Gestión manual de planes** (otorgar/quitar Pro a un negocio o premium a un usuario desde Developer).
2. **Capado real** de las pestañas Pro, centralizado en un solo sitio.
3. **Convivencia manual + Stripe**: que el webhook no pise una concesión manual y viceversa.
4. **Valor real** dentro de las pestañas Pro (ahora son maquetas sin persistencia).
5. Configuración de Stripe (producto, precio, secrets, webhook) — manual, fuera del repo.

---

## 2. Arquitectura de entitlements propuesta

Principio: **una sola fuente de verdad por entidad, con procedencia (`source`)**. Tanto el pago como la concesión manual escriben los mismos campos; la procedencia decide quién puede degradar.

### 2.1 Negocios — `places/{placeId}`

Campos existentes que se mantienen, más los nuevos marcados:

```txt
places/{placeId}
  businessTier: 'free' | 'pro'
  businessProActive: boolean
  businessPlanSource: 'stripe' | 'manual' | 'trial'      ← NUEVO
  businessPlanExpiresAt: Timestamp | null                ← NUEVO (solo manual/trial)
  businessPlanGrantedBy: uid | null                      ← NUEVO
  businessPlanNotes: string                              ← NUEVO (motivo: prueba, cortesía, prensa…)
  businessBillingStatus / businessBillingPlan            (existentes, solo Stripe)
  stripeCustomerId / stripeSubscriptionId                (existentes, solo Stripe)
```

Reglas de convivencia:

- La callable admin escribe `source: 'manual'` (o `'trial'` si tiene caducidad).
- **El webhook de Stripe solo degrada si `businessPlanSource` es `'stripe'` o no existe.** Un local con Pro manual nunca pierde el plan porque Stripe mande un `subscription.deleted` viejo. Si el local paga, el webhook sube el plan y cambia `source` a `'stripe'` (pagar siempre gana a manual).
- Una scheduled function diaria degrada los `manual`/`trial` con `businessPlanExpiresAt` vencido (y escribe audit log). Mientras no haya caducidades puestas, no hace nada.

### 2.2 Usuarios — `users/{uid}` (preparado, mismo patrón)

```txt
users/{uid}
  premium: {
    active: boolean
    tier: 'premium'
    source: 'manual' | 'stripe' | 'trial'
    expiresAt: Timestamp | null
    grantedBy: uid | null
    notes: string
  }
```

- Misma callable admin y misma lógica de convivencia. Cuando llegue el Stripe de consumidor, su webhook reutiliza el patrón (y opcionalmente añade custom claim `tier`, como recoge `mejoras-pendientes.md` §"Pasos técnicos mínimos").
- Firestore rules: el bloque `premium` solo lo escriben Cloud Functions (denegar en reglas de cliente).

### 2.3 Capado centralizado (una sola puerta)

- **Backend**: `functions/modules/lib/business-plan.js` con `hasActiveBusinessPro(placeData)` (comprueba tier + expiración). La usan todas las funciones que escriban datos Pro (items oficiales, ofertas, branding), para que el capado no dependa solo de la UI.
- **Frontend**: hook `useBusinessPlan(placeId)` que devuelve `{ isPro, source, expiresAt }` + componente `<RequireBusinessPro placeId fallback={<UpsellCard/>}>`. `BusinessManagePage` deja de calcular `hasBusinessPro` inline y las 3 pestañas Pro se envuelven con esto. Es el punto único donde el día de mañana se cambia "modo pruebas" por capado real (un flag).
- **Firestore rules**: donde haya colecciones Pro persistentes (`places/{id}/items`, `offers`, branding), exigir que las escrituras pasen por callable (denegar cliente directo), que es donde vive el check de plan.

---

## 3. Gestión manual desde Developer

Nueva pestaña **"Planes"** en `DeveloperPage` (patrón de `BusinessManagersTab`/`UsersManagerTab`):

Sección Negocios:
- Buscador de lugar (por nombre / placeId, reutilizando la búsqueda de `BusinessManagersTab`).
- Ficha del plan: tier actual, `source`, caducidad, estado de facturación de Stripe si existe, y quién lo concedió.
- Acciones: **Activar Pro** (indefinido / 1 mes / 3 meses / fecha custom + notas) y **Quitar Pro**. Si `source === 'stripe'` con suscripción activa, la acción de quitar se bloquea con aviso ("gestiona la cancelación en Stripe") para no dejar a alguien pagando sin plan.
- Listado de todos los lugares con plan activo (query `businessProActive == true`), con chip de procedencia (Manual / Trial / Stripe) y caducidad.

Sección Usuarios:
- Igual pero sobre `users` (buscador por username/email/uid, patrón `UsersManagerTab`) con activar/quitar `premium`.

Backend: dos callables nuevas en `functions/modules/admin/` siguiendo el patrón existente:

- `adminSetBusinessPlan({ placeId, tier, expiresAt?, notes? })` — `assertJefeAccess` + `writeAuditLog('businessPlan.manualSet', …)`.
- `adminSetUserPlan({ userId, active, expiresAt?, notes? })` — ídem.

Con esto puedes probarlo tú mismo hoy (te das Pro a un local tuyo), y en el futuro dar cortesías/pruebas a quien quieras, todo auditado en `adminAuditLog`.

---

## 4. Activar el capado real (sin romper el modo pruebas)

Flag en un solo sitio (`frontend/src/config` o remote config en Firestore `config/features.businessProEnforced`):

- **Flag off (hoy)**: pestañas Pro abiertas, banner "modo pruebas" como ahora.
- **Flag on**: `<RequireBusinessPro>` muestra un **paywall/upsell** en lugar del contenido: lista de beneficios + botón "Hazte Pro" que llama a `createBusinessProCheckoutSession` (el servicio ya existe). Si Stripe aún no está configurado, la callable ya devuelve `failed-precondition` con mensaje claro; la UI puede mostrar "disponible próximamente" en ese caso.
- El botón "Business Pro" de la cabecera pasa de mostrar un aviso a abrir ese mismo paywall.

## 5. Qué falta para cobrar de verdad (checklist, mayormente manual)

1. Crear en Stripe el producto "Business Pro" + precio mensual (sugerencia del roadmap: 8–15 €/mes por local) y opcionalmente `trial_period_days`.
2. `firebase functions:secrets:set` → `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BUSINESS_PRO_PRICE_ID`.
3. Registrar el endpoint del webhook en Stripe (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`; añadir `invoice.payment_failed`).
4. **Customer Portal** (código nuevo pequeño): callable `createBusinessPortalSession` para que el negocio cancele, cambie tarjeta y vea facturas sin construir ese frontend. Muy recomendable antes de cobrar a nadie.
5. **Grace period**: al recibir `invoice.payment_failed` / status `past_due`, marcar `businessBillingStatus` pero no degradar hasta 5–7 días (la scheduled function del §2.1 puede encargarse).
6. Activar Stripe Tax / IVA antes de cobrar a empresas.
7. Página `/pricing` pública (puede esperar a la fase de lanzamiento).

## 6. Mejorar el valor del plan Business Pro

Orden sugerido por relación valor/esfuerzo, partiendo de los prototipos ya maquetados:

1. **Elementos y carta (el diferenciador)**: hacer real `BusinessItemsPrototype`. Ya existe `places/{placeId}/items` con items canónicos y stats; falta la "ficha oficial": precio, foto, grupo de carta, descripción, descuento, y guardado vía callable (con check de plan). Los merges/renombres sensibles siguen pasando por aprobación admin, como recoge el roadmap.
2. **Ofertas (Patrocinado, parte 1)**: `places/{placeId}/offers/{offerId}` con título, fechas, foto, condiciones y caducidad automática; visibles en `PlacePage` con etiqueta "Promocionado". Es lo más vendible a un bar/restaurante.
3. **Estadísticas básicas**: contador de visitas al perfil del lugar (increment por vista con dedupe simple), evolución de nota media en el tiempo (ya hay `ratingTotal/ratingCount`), items más reseñados. Un panel sencillo en una pestaña "Estadísticas".
4. **Imagen/branding**: persistir la personalización visual (imagen principal, galería destacada, estilo) y aplicarla en `PlacePage`. Ya existe `BrandingManager` en Developer como referencia.
5. **Después**: plantillas de respuesta a reseñas, roles de equipo (owner/manager/responder), export CSV, destacado en búsquedas (Patrocinado parte 2 — requiere tocar ranking/Algolia con etiqueta visible).

Y mantener en Free lo que da confianza al ecosistema (badge verificado, responder reseñas, datos generales): que el negocio pruebe valor antes de pagar, como ya recoge `mejoras-pendientes.md` §"Business Free".

---

## 7. Fases de implementación propuestas

**Fase A — Entitlements + gestión manual (desbloquea probar todo, sin pagos):**
1. Callables `adminSetBusinessPlan` / `adminSetUserPlan` + scheduled de expiración.
2. Guard del webhook (`source !== 'manual'` para degradar).
3. Pestaña "Planes" en Developer.
4. `useBusinessPlan` + `<RequireBusinessPro>` + flag de capado (off por defecto).

**Fase B — Preparación de cobro:**
5. Paywall/upsell conectado al checkout existente + `createBusinessPortalSession` + grace period.
6. Configuración manual de Stripe (secrets, producto, webhook, Tax).

**Fase C — Valor Pro:**
7. Carta/items oficiales → 8. Ofertas → 9. Estadísticas → 10. Branding.

Fase A es autocontenida y de riesgo bajo (todo detrás de `jefe` + audit log); B y C pueden ir en PRs separados.

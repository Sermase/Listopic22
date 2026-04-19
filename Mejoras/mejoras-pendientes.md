# Seguimiento de mejoras — Listopic

Tabla generada a partir del análisis profundo del código (sesión de revisión).
Estado:
- "Hecho" = ya commiteado en esta rama (`claude/code-review-analysis-DQFrd`).
- "Pendiente" = queda por hacer en próximas iteraciones.
- "Manual" = el usuario debe hacerlo fuera del repo (Google Cloud Console, Secret Manager, Firebase Console…). Ver `docs/SECURITY-SETUP.md`.

Última actualización: 2026-04-18 (tercera pasada — sistema de temas).

## Top 10 (análisis inicial)

| # | Mejora | Impacto | Estado | Commit / Archivos |
|---|--------|---------|--------|-------------------|
| 1 | Rotar Google Places API key + Secret Manager + bloquear lectura pública de `config/serverSecrets` | Seguridad (crítico) | Hecho (código) + Manual (rotar clave) | `functions/modules/lib/secrets.js`, `firestore.rules`, `docs/SECURITY-SETUP.md` |
| 2 | Ownership en `storage.rules` (list-images, branding, badges) | Seguridad (crítico, IDOR) | Hecho | `storage.rules` |
| 3 | Auth + rate-limit en onRequest/onCall de `functions/modules/core.js` y `reports.js` | Seguridad + coste APIs Google | Hecho | `functions/modules/core.js`, `functions/modules/reports.js`, `functions/modules/lib/auth.js` |
| 4 | Limpieza de archivos obsoletos + expandir `.gitignore` | Higiene repo | Hecho | `.gitignore`, `frontend/.gitignore`, archivos borrados |
| 5 | Adelgazar `package.json` raíz (eliminar mongoose, bcrypt, jwt, firebase v11 duplicado) | Build + superficie de ataque | Hecho | `package.json` |
| 6 | Split de `core.js` (4100+ LOC) en submódulos | Mantenibilidad | Parcial: extraído `lib/geo.js` + `lib/auth.js` + `lib/secrets.js`; documentado roadmap en cabecera | `functions/modules/core.js` (header), `functions/modules/lib/*` |
| 7 | Refactor ProfilePage (3052), HomePage (1255), ListPage (1254) + quitar `any` | Mantenibilidad | Parcial: extraído `ProfileStatsTab` como sample pattern (-98 LOC en ProfilePage). Resto pendiente | `frontend/src/components/profile/ProfileStatsTab.tsx` |
| 8 | Migrar a TanStack Query o endurecer `queryCache.ts` | Fiabilidad datos | Pendiente | — |
| 9 | ErrorBoundary + Sentry + eliminar `console.log` en prod | Observabilidad | Hecho (ErrorBoundary + esbuild.drop + Sentry SDK integrado, espera DSN en `VITE_SENTRY_DSN`) | `frontend/src/components/ErrorBoundary.tsx`, `frontend/src/main.tsx`, `frontend/src/lib/sentry.ts`, `frontend/vite.config.ts`, `docs/SECURITY-SETUP.md` |
| 10 | Roles admin granulares + audit log + userType reactivo en DeveloperPage | Seguridad + UX | Hecho (`isJefe` reactivo, `adminAuditLog` + `writeAuditLog` en **todas** las funciones admin). Roles granulares (moderator/admin/superadmin) = pendiente | `frontend/src/context/AuthContext.tsx`, `frontend/src/pages/DeveloperPage.tsx`, `functions/modules/lib/auth.js`, `functions/modules/core.js` |

## Mejoras secundarias descubiertas durante la implementación

| # | Mejora | Impacto | Estado | Notas |
|---|--------|---------|--------|-------|
| A | Report flood protection (15/h por usuario) | Anti-abuso | Hecho | `functions/modules/reports.js` |
| B | Custom claim `admin=true` para bypass de Firestore lookup en Storage rules | Latencia + coste | Manual (script en `docs/SECURITY-SETUP.md`) | Requiere ejecutar node snippet con service account |
| C | Restricciones de dominio HTTP-referrer en la API key de Google | Seguridad | Manual | Ver `docs/SECURITY-SETUP.md` sección 5 |
| D | Índices compuestos corregidos en `firestore.indexes.json` | Rendimiento consultas | Hecho | Corregida coma colgante + índices `reviews.authorId+createdAt`, `adminAuditLog.actorUid+createdAt`, `reports.reporterUid+createdAt` |
| E | `businessClaims/` colección con reglas (user crea como `pending`, jefe actualiza) | Feature usuarios-negocio | Hecho | `firestore.rules` |
| F | Cap de identificadores en `resolveChatParticipants` (≤ 20) | DoS | Hecho | `core.js` |
| G | Sourcemaps fuera de producción en Vite | Seguridad (no filtrar código) | Hecho | `frontend/vite.config.ts` |
| H | Cache en memoria de la Google API key (15 min) | Latencia + coste | Hecho | `functions/modules/lib/secrets.js` |
| I | Sistema de temas seleccionable (dark/light/warm/cool) con 4 paletas en `--lt-*` + selector en Preferencias + persistencia Firestore + localStorage + StatusBar Capacitor + bootstrap anti-FOUC | Feature UX | Hecho | `frontend/src/context/ThemeContext.tsx`, `frontend/src/index.css`, `frontend/index.html`, `frontend/src/pages/ProfilePage.tsx`, `frontend/src/components/Navbar.tsx`, bulk replace de 316 ocurrencias de `bg-[#0b1021]`/`bg-[#151b2e]`/etc. a `var(--lt-*)` en 57 ficheros |

## Deuda técnica pendiente (no en este sprint)

- **Split completo de `core.js`**: roadmap documentado en el propio archivo. Hacer en PRs separados (places/, lists/, aggregates/, admin/).
- **Migración a TanStack Query** en lugar de `queryCache.ts` casero (gana retry, SWR, deduplication, devtools).
- **Sentry (DSN)**: el SDK está instalado y el ErrorBoundary reporta errores. Falta crear el proyecto Sentry y meter el DSN en `VITE_SENTRY_DSN` (ver `docs/SECURITY-SETUP.md` §9). Integración similar para Cloud Functions: pendiente.
- **App Check** de Firebase para diferenciar tráfico legítimo en endpoints onRequest.
- **Cifrado de mensajes de chat** (mejora RGPD).
- **Roles granulares**: `moderator`, `admin`, `superadmin` en vez de `jefe` monolítico.
- **Refactor de páginas enormes** (ProfilePage 2955 LOC tras primer corte, HomePage 1255, ListPage 1254): seguir extrayendo subcomponentes siguiendo el patrón de `ProfileStatsTab`. Eliminar `any`.
- **Contadores de rate-limit** migrados de Firestore a Memorystore/Redis cuando haya tráfico masivo (~1 lectura + 1 escritura por petición actualmente).
- **Rotación periódica de la Google Places API key** (cada 6-12 meses, o al menos documentar calendario).
- **Pulido fino de los temas light/warm/cool**: el bulk replace cambió los fondos pero quedan textos/iconos con clases Tailwind sólidas (`text-white`, `text-gray-300/400`, `border-white/10`, degradados brand hardcoded) que en el tema claro pueden quedar con bajo contraste. Próximos pasos:
  1. Auditar contraste en cada página con el tema `light` activo (especialmente modales, tarjetas, navbar).
  2. Migrar `text-white` → `text-[var(--lt-text)]` y `text-gray-*` → tokens `--lt-text-muted` en los puntos calientes.
  3. Revisar gradientes `from-indigo-500 to-purple-500` para variantes por tema (usar `var(--lt-accent-grad)` donde encaje).
  4. Añadir un indicador de "tema activo" en Navbar móvil (opcional, chip pequeño).

## Acciones manuales pendientes (usuario)

Ver `docs/SECURITY-SETUP.md` para detalles. Resumen:
1. Rotar la Google Places API key en Google Cloud Console.
2. `firebase functions:secrets:set GOOGLE_PLACES_API_KEY` con el nuevo valor.
3. `firebase deploy --only firestore:rules,firestore:indexes,storage:rules`.
4. `firebase deploy --only functions` (confirmar enlace al secret con "y").
5. (Opcional) Asignar custom claim `admin=true` a las cuentas jefe.
6. Borrar el campo `googlePlacesApiKey` en `config/serverSecrets`.
7. Restringir la API key por dominio HTTP referrer.

---

# Mejoras pendientes — Listopic

Archivo de ideas, propuestas y funcionalidades planificadas.
Ordenadas por temática y fase de implementación.

---

## CUENTAS DE NEGOCIO

### Fase 1 — Perfil de negocio y verificación (sin pagos)

El dueño o gestor de un local puede reclamar un lugar de Listopic como suyo.
El proceso requiere verificación manual por parte del admin.

**Flujo de reclamación:**
- El usuario rellena un formulario: nombre, cargo, email de contacto y documentos (licencia, CIF, foto del local, etc.)
- Los archivos se suben a Firebase Storage en `business-claims/{claimId}/docs/`
- Se crea un documento en Firestore con estado `pending`, vinculado al usuario y al `placeId`
- El admin recibe notificación y aprueba o rechaza desde la DeveloperPage
- Si se aprueba, el usuario queda vinculado como propietario/gestor del lugar

**Lo que puede hacer el negocio verificado (a definir cuánto de esto va en v1):**
- Editar información básica del lugar (nombre, descripción, horarios, fotos)
- Añadir carta/menú (secciones, platos con foto y precio)
- Responder oficialmente a reseñas de su negocio
- No puede reseñar sus propios negocios

**Restricciones:**
- Un usuario puede tener vinculados varios negocios
- Un negocio solo puede tener un propietario principal (más gestores secundarios en el futuro)
- Los documentos de verificación se guardan en Storage vinculados al usuario y al lugar

---

### Fase 2 — Suscripción premium para negocios

Sistema de pagos (Stripe) que desbloquea contenido y funcionalidades extra.

**Niveles:**
- Gratuito: perfil básico, información pública estándar
- Premium: contenido extra visible solo para usuarios con cuenta activa. Si deja de pagar, ese contenido deja de mostrarse y se vuelve al estándar

**Contenido premium del negocio (ideas):**
- Galería de fotos ampliada
- Carta/menú enriquecido con fotos y descripciones detalladas
- Ofertas y promociones destacadas
- Estadísticas de visitas e interacciones

**Lógica de expiración:**
- Si el negocio deja de pagar, el contenido premium deja de mostrarse
- Los datos no se borran, solo se ocultan — si reactiva, todo vuelve
- Los usuarios ven la versión estándar mientras el negocio no tiene premium activo

---

### Fase 3 — Patrocinios y anuncios

Los negocios pagan por visibilidad extra dentro de la app.

**Niveles de patrocinio:**
- Básico: aparecer primero en búsquedas de su zona/categoría (sutil, etiqueta pequeña "Patrocinado")
- Medio: banner destacado en la página del lugar, aparición en la home
- Premium: mayor presencia en búsquedas, notificaciones a usuarios cercanos, destacado en listas relevantes

**Principios:**
- La publicidad debe ser sutil y no interrumpir la experiencia
- Siempre etiquetado como "Patrocinado" con honestidad
- El contenido orgánico (reseñas, valoraciones) nunca se puede pagar ni manipular

---

## OTRAS MEJORAS PENDIENTES

### Exportación de datos (RGPD) — DeveloperPage

- Exportar PDF con todos los datos del usuario (perfil, reseñas, listas, gamificación, chats)
- Estado actual: implementado pero con problemas de permisos en Firestore para leer listas/reseñas de otros usuarios como admin
- Pendiente: revisar reglas de Firestore para dar acceso de lectura al rol `jefe`, o implementar Cloud Function con permisos de admin SDK
- Pendiente: revisar por qué el campo de listas devuelve 0 (puede haber inconsistencia entre `userId` y `authorId`)
- Pendiente: crear índice de Firestore para `collectionGroup("reviews").where("authorId")` (single-field index en scope COLLECTION_GROUP)

### Eliminación de cuenta

- Implementada en modal de preferencias del perfil (pestaña "Eliminar")
- Pendiente: revisión y commit por parte del usuario

### Google Sign-In en APK

- Funcionando correctamente tras corrección de authDomain y plugin nativo

---

## IDEAS SUELTAS (sin fase asignada)

**Negocios:**
- Respuestas del negocio a reseñas (oficial, una sola respuesta por reseña)
- Perfil verificado con insignia visual en el lugar y en el perfil del usuario-negocio
- Panel de estadísticas para el negocio: visitas, reseñas recibidas, valoración media en el tiempo
- Gestores secundarios: varios usuarios con acceso al panel de un mismo negocio
- Integración con Google My Business para importar datos automáticamente
- Modo mapa con pins de negocios patrocinados diferenciados visualmente

**Descubrimiento y búsqueda:**
- Feed "Para ti" — personalizado por zona, seguidos y gustos
- Búsqueda por mapa con filtros (explorar zona)
- Listas curadas editoriales por Listopic ("Los mejores ramen de Madrid según la comunidad")

**Social:**
- Actividad de amigos: ver qué han reseñado o qué listas siguen recientemente
- Menciones en reseñas (@usuario)
- Colaboración en tiempo real en listas (varios editores simultáneos)
- Grupos o comunidades temáticas (ej. "Amantes del café en Barcelona")

**Experiencia de usuario:**
- Modo offline: guardar listas para consultar sin conexión
- Lista "quiero ir" con recordatorio
- Check-in: marcar visita desde el móvil con geolocalización
- Compartir reseña individual como imagen (para Instagram/WhatsApp)

**Gamificación (ampliación):**
- Retos semanales ("Reseña 3 sitios nuevos esta semana")
- Ranking entre amigos
- Medalla de primero en reseñar un lugar

**Monetización de usuarios:**
- Cuenta premium personal: sin anuncios, estadísticas avanzadas, listas privadas ilimitadas

---

## NOTIFICACIONES — EN PROGRESO

Ver brainstorming activo. Objetivo: mejorar notificaciones in-app y añadir push notifications en la APK.

**Tipos previstos:**
- Nuevos seguidores
- Comentarios en tus reseñas
- Mensajes nuevos (chats)
- Alguien sigue una lista tuya
- Medallas desbloqueadas
- Subida de nivel
- Retos completados (futuro)
- Respuesta del negocio a tu reseña (futuro)

---

*Última actualización: 2026-04-13*

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

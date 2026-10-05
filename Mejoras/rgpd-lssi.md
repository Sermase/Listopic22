# RGPD y LSSI en Listopic (octubre 2026)

Qué hace la app para cumplir y qué queda pendiente. No es asesoramiento jurídico:
los textos legales conviene que los revise un profesional antes de darlos por buenos.

## Qué hay

- **Textos legales** (`frontend/src/pages`): Términos (`/terms`), Privacidad (`/privacy`),
  Cookies (`/cookies`) y Aviso legal (`/aviso-legal`). Comparten `components/legal/LegalLayout.tsx`.
  Los datos del titular y la versión vigente están en `frontend/src/config/legal.json`.
- **Aceptación**: el registro con email pide dos casillas obligatorias y sin marcar
  (Términos + Privacidad, y edad mínima). Quien entra con Google, las cuentas anteriores
  y todos cuando cambia `version` ven `LegalAcceptanceGate` hasta aceptar. Se guarda en
  `users/{uid}.legalAcceptance` `{ version, acceptedAt (request.time), ageConfirmed, method }`;
  las reglas validan el formato y la fecha del servidor (tests V11 en `firestore-tests`).
- **Sin banner de cookies**: solo hay almacenamiento técnico o de preferencias. La analítica
  usa un identificador en memoria (no en el dispositivo) y las fuentes van empaquetadas
  (`@fontsource-variable/*`), sin Google Fonts. Si se añade analítica o publicidad de
  terceros, hará falta banner con «Rechazar» igual de visible que «Aceptar».
- **Acceso y portabilidad**: el usuario lo pide desde Editar perfil («Solicitar mis datos»,
  abre un correo prellenado). Un jefe lo genera en Developer → Exportar datos: PDF legible y
  JSON completo (`adminExportUserData`, `functions/modules/admin/admin-gdpr.js`). Plazo: un mes.
- **Borrado de cuenta** (`deleteOwnAccount` + `cleanupUserFootprint`): borra perfil, foto,
  seguidores y seguidos (también el enlace en quien la seguía), sus «me gusta», notificaciones
  (las suyas y las que generó a otros), chats privados, sus mensajes en grupos (sale del grupo), archivos de
  Storage personales y todo lo que cuelga de `users/{uid}`. Reseñas, fotos de lugares,
  comentarios y mensajes de foros se borran o se conservan como «Usuario eliminado» según
  elija. Las denuncias que hizo se conservan sin nombre ni correo.

## Pendiente antes de publicar

1. Titular: `ownerName` en `frontend/src/config/legal.json`. `ownerNif` y `ownerAddress` son
   opcionales mientras no haya actividad económica; si Listopic empieza a cobrar (planes
   Business, Stripe, patrocinios) pasan a ser obligatorios.
2. Desplegar Functions y reglas (workflow «Desplegar Functions y reglas»).
3. Índices: `firestore.indexes.json` añade índices de grupo de colecciones para comments,
   photos, messages, reactions (userId) y notifications (senderId). El workflow no despliega
   índices: `firebase deploy --only firestore:indexes`. Sin ellos funciona igual, pero más lento.
4. Política TTL de Firestore sobre `adminAuditLog.expiresAt` (consola → Firestore → TTL), para
   que la prueba de bajas y exportaciones se borre a los 3 años como dice la Privacidad.
5. Revisión jurídica de Términos, Privacidad (transferencias a EE. UU. de Google, Algolia,
   Sentry y Esri) y Aviso legal.

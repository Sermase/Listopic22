# Informe Fase A (+ B0) — Listopic

Rama: `Mejoras-Opus-5.5-29-09-2026`. Nada de lo descrito aquí se ha desplegado a
producción salvo lo que publique Hosting al fusionar en `main` (lo decide el dueño).
Reglas, índices, Cloud Functions, migraciones y scripts: **preparados, sin desplegar ni ejecutar**.

> Documento vivo: se completa bloque a bloque durante la sesión.

## Línea base (antes de cambios)

| Métrica | Valor |
|---|---|
| JS inicial (gzip, index.html + imports estáticos) | 385,5 KB |
| CSS inicial (gzip) | 30,8 KB |
| Extra por ruta (gzip): Home / Lista / Sitio / Perfil / Buscar | +131 / +158 / +167 / +172 / +134 KB |
| ESLint | 403 errores, 22 avisos |
| Tests unitarios frontend | 53 / 53 |
| Carga móvil simulada (4G lenta + CPU 4x, vía proxy) Home | FCP 4,9 s · LCP 7,0 s |
| Carga móvil simulada Lista | LCP 9,6 s · CLS 0,24 |
| Tests de reglas contra reglas actuales | 14 ataques de 14 funcionaban |

## 1. Seguridad — reglas de Firestore (preparado, sin desplegar)

Suite nueva: `firestore-tests/` (emulador, `npm test`). 46 casos: ataques (deben
denegarse) y flujos reales de la app con sus payloads (no deben romperse).

- Antes del cambio: **14/14 ataques funcionaban** (salida guardada en el informe de sesión).
- Después: **46/46 en verde**.

| Vulnerabilidad | Cambio en `firestore.rules` |
|---|---|
| V1 Leer listas privadas con solo "seguir" (usuario o lista) | `canReadListById` y la regla de lectura de `lists` ya no aceptan seguidores. Privada = dueño, editores, invitados, jefe. Coincide con `sublistas_funcionamiento.txt` §3B. |
| V2 Un editor se apropia de la lista | Identidad (`userId`, `parentListId`…) inmutable salvo jefe; permisos y visibilidad solo el dueño. |
| V3 Métricas de lista falsificadas | Métricas solo servidor; al crear deben ir a 0 / `{}` (los formularios ya lo hacen). |
| V4 Usuario se da insignias, XP, nivel, contadores o rol | Lista blanca de campos propios (`userSelfUpdateKeys`). |
| V5 Business Pro gratis creando un lugar con campos de negocio / notas falsas | Crear solo con campos del lugar de respaldo y métricas a 0; portada solo si falta y de nuestro Storage. |
| V6 Expulsar o reescribir participantes de un chat | Solo se puede añadir gente (superconjunto, máx. 50). |
| V7 Me gusta / comentarios arbitrarios | Solo ±1; se elimina `request.writeFields` (obsoleto). |

**Orden obligatorio de despliegue**: 1) publicar el frontend de esta rama (deja de
escribir contadores desde el cliente); 2) `firebase deploy --only firestore:rules`.
Las versiones antiguas de la app Android seguirán intentando esas escrituras: fallan
de forma silenciosa (ya estaban envueltas en `catch`), sin romper flujos.

**Cambio de comportamiento visible (decisión ya alineada con el diseño documentado)**:
quien sigue a un usuario deja de ver sus listas privadas. Para compartir una lista
privada hay que invitar (Lector / Colaborador).

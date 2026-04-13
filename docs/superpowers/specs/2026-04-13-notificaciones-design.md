# Notificaciones — Diseño

**Fecha:** 2026-04-13  
**Estado:** Aprobado para implementación

---

## Objetivo

Mejorar el sistema de notificaciones in-app existente y añadir push notifications reales en la APK de Android via Firebase Cloud Messaging (FCM). Las notificaciones deben agruparse por tipo y contexto para evitar spam, y mostrarse como un banner discreto y efímero cuando la app está abierta.

---

## Alcance

### Dentro del alcance

- Agrupación de notificaciones en Firestore (upsert, no insert por evento)
- Nuevos tipos: `new_message` y `list_follow`
- Notificaciones de chat se borran al leerlas (el historial ya está en el chat)
- Push notifications Android via FCM (`@capacitor/push-notifications`)
- Banner in-app propio (pequeño, con blur, efímero) para cuando la app está abierta
- Registro y gestión de tokens FCM por dispositivo
- Cola de banners si llegan varios seguidos

### Fuera del alcance

- Notificaciones en iOS (se puede añadir después con el mismo sistema)
- Notificaciones de "alguien comparte tu reseña"
- Email de notificaciones
- Preferencias granulares por tipo de notificación (futuro)

---

## Tipos de notificación

| Tipo | Agrupa por | Se borra al leer | Descripción |
|---|---|---|---|
| `new_message` | `chatId` | ✅ Sí | Mensajes nuevos en un chat |
| `new_follower` | — (acumulativo) | No | Alguien te sigue |
| `review_comment` | `reviewId` | No | Comentarios en una reseña tuya |
| `review_like` | `reviewId` | No | Likes en una reseña tuya |
| `list_follow` | `listId` | No | Alguien sigue una lista tuya |
| `level_up` | — | No | Subida de nivel |
| `badge_earned` | `badgeId` | No | Medalla desbloqueada |
| `report_resolved` | — | No | Admin resolvió tu reporte |
| `new_report` | — | No | (solo admins) nuevo reporte |

---

## Modelo de datos — Firestore

```
users/{uid}/notifications/{notificationId}
```

El `notificationId` es la **clave de agrupación** — se construye de forma determinista:
- `new_message` → `msg_{chatId}`
- `new_follower` → `followers_new`
- `review_comment` → `comment_{reviewId}`
- `review_like` → `like_{reviewId}`
- `list_follow` → `listfollow_{listId}`
- `level_up` → `levelup_{newLevel}`
- `badge_earned` → `badge_{badgeId}`
- `report_resolved` / `new_report` → `report_{reportId}`

**Campos del documento:**

```js
{
  type: string,           // tipo de notificación
  read: boolean,          // false hasta que el usuario la abre
  count: number,          // cuántos eventos agrupa (por defecto 1)
  createdAt: Timestamp,   // primera vez que ocurrió
  updatedAt: Timestamp,   // última actualización (ordena la lista)
  senderId: string,       // último remitente
  senderName: string,
  senderPhoto: string | null,
  message: string,        // texto dinámico, ej: "3 mensajes nuevos de Juan"
  link: string,           // ruta de navegación al pulsar
  deletedOnRead: boolean, // true solo para new_message → se borra al marcar leída
  
  // Opcionales según tipo:
  chatId?: string,
  reviewId?: string,
  listId?: string,
  badgeId?: string,
  badgeName?: string,
  badgeImageUrl?: string | null,
  level?: number,
  xp?: number,
  placeName?: string,
  preview?: string,       // preview del último comentario/mensaje
}
```

**Texto dinámico del `message` según `count`:**
- `new_message`, count=1 → "Mensaje nuevo de Juan"
- `new_message`, count=3 → "3 mensajes nuevos de Juan"
- `new_follower`, count=1 → "Ana ha empezado a seguirte"
- `new_follower`, count=4 → "Ana y otras 3 personas han empezado a seguirte"
- `review_comment`, count=2 → "2 comentarios nuevos en tu reseña"

---

## Cloud Functions — cambios

### Patrón upsert

Todas las funciones de notificación pasan de `add()` a `set({ merge: true })` usando el `notificationId` determinista:

```js
const notifId = `msg_${chatId}`;
const ref = db.doc(`users/${recipientId}/notifications/${notifId}`);
const existing = await ref.get();
const count = existing.exists ? (existing.data().count || 1) + 1 : 1;

await ref.set({
  type: 'new_message',
  read: false,
  count,
  updatedAt: FieldValue.serverTimestamp(),
  createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp(),
  senderId,
  senderName,
  senderPhoto,
  message: count === 1 ? `Mensaje nuevo de ${senderName}` : `${count} mensajes nuevos de ${senderName}`,
  link: `/chats/${chatId}`,
  chatId,
  deletedOnRead: true,
  preview: messageText.slice(0, 60),
}, { merge: false }); // reemplaza completo para actualizar message y count
```

### Nuevos triggers

**`new_message`** — `functions/modules/notifications.js`:
```
onDocumentCreated('chats/{chatId}/messages/{msgId}')
```
→ Notifica a todos los participantes del chat excepto el remitente.

**`list_follow`** — `functions/modules/notifications.js`:
```
onDocumentCreated('users/{uid}/followingLists/{listId}')
```
→ Notifica al autor de la lista.

### Push FCM tras escribir en Firestore

Después de cada upsert, la función envía el push:

```js
const tokens = await getTokensForUser(recipientId); // users/{uid}/fcmTokens
await admin.messaging().sendEachForMulticast({
  tokens,
  notification: {
    title: 'Listopic',
    body: message,
  },
  data: {
    type,
    link,
    notificationId: notifId,
  },
  android: {
    priority: 'high',
    notification: { channelId: 'listopic_default' },
  },
});
```

Los tokens inválidos (error `registration-token-not-registered`) se eliminan automáticamente de Firestore.

---

## Frontend — FCM y tokens

### Registro del token

En `App.tsx`, al hacer login o al montar la app en plataforma nativa:

```ts
import { PushNotifications } from '@capacitor/push-notifications';

// Solicitar permiso
await PushNotifications.requestPermissions();
await PushNotifications.register();

// Escuchar el token
PushNotifications.addListener('registration', async ({ value: token }) => {
  await setDoc(doc(db, 'users', uid, 'fcmTokens', token), {
    token,
    platform: 'android',
    createdAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
  });
});
```

### Interceptar push cuando la app está abierta

```ts
PushNotifications.addListener('pushNotificationReceived', (notification) => {
  // No mostrar el nativo — mostrar el banner propio
  showInAppBanner({
    type: notification.data.type,
    message: notification.notification.body,
    link: notification.data.link,
  });
});

PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
  // Usuario pulsó la notificación nativa (app en segundo plano)
  navigate(action.notification.data.link);
});
```

---

## Frontend — Banner in-app

### Componente `NotificationBanner`

Montado globalmente en `App.tsx`, encima del contenido principal.

**Diseño:**
- Píldora pequeña, ancho máximo ~320px, centrada horizontalmente en la parte superior
- Fondo: `bg-black/70 backdrop-blur-md`
- Contenido: foto del remitente (24px) + icono del tipo + texto truncado a 1 línea
- Sin botón de cerrar — desaparece sola

**Animación:**
- Aparece: `translate-y-0 opacity-100` desde `translate-y-[-100%] opacity-0`, duración 200ms
- Espera: 1.5 segundos visible
- Desaparece: fade out opacity a 0, duración 400ms

**Cola:**
- Si llega un segundo banner mientras el primero está visible, se encola
- Al desaparecer el primero, aparece el siguiente automáticamente
- Máximo 5 en cola — si hay más se descartan

**Interacción:**
- Pulsar → navegar al `link` y marcar notificación como leída
- No pulsar → desaparece y la notificación queda como no leída (la campana sigue con badge)

### Contexto global `NotificationBannerContext`

```ts
interface BannerItem {
  type: NotificationType,
  message: string,
  link: string,
  senderPhoto?: string,
}

// API:
showBanner(item: BannerItem): void
```

---

## Frontend — Cambios en notificaciones in-app existentes

### `NotificationModal` y `NotificationHistoryModal`

- Ordenar por `updatedAt` descendente (ya existe, puede estar usando `createdAt`)
- Mostrar `count` en badge cuando `count > 1`: "3 nuevos"
- Las de tipo `new_message` con `deletedOnRead: true` → al marcarlas como leídas, `deleteDoc()` en vez de `updateDoc({ read: true })`
- Al abrir el chat desde la notificación, marcar/borrar la notificación correspondiente

### `ChatsPage`

Al abrir un chat, buscar y borrar la notificación `msg_{chatId}` si existe:
```ts
await deleteDoc(doc(db, 'users', uid, 'notifications', `msg_${chatId}`));
```

---

## Preferencias de notificaciones

El usuario puede configurar qué tipos de notificación recibe desde una nueva pestaña **"Notificaciones"** en el modal de preferencias del perfil (junto a "Usuario", "Busqueda" y "Eliminar").

### Modelo de datos

Se guarda en el documento del usuario en Firestore:

```js
users/{uid}.notificationPreferences: {
  new_message: true,
  new_follower: true,
  review_comment: true,
  review_like: true,
  list_follow: true,
  level_up: true,
  badge_earned: true,
}
```

Por defecto todos activados. Si un tipo está en `false`, la Cloud Function no crea la notificación ni manda el push para ese usuario.

### UI — pestaña "Notificaciones" en modal de preferencias

Lista de toggles, uno por tipo, con etiqueta descriptiva y el icono correspondiente:

| Toggle | Etiqueta |
|---|---|
| `new_message` | Mensajes nuevos |
| `new_follower` | Nuevos seguidores |
| `review_comment` | Comentarios en tus reseñas |
| `review_like` | Likes en tus reseñas |
| `list_follow` | Alguien sigue una lista tuya |
| `level_up` | Subidas de nivel |
| `badge_earned` | Medallas desbloqueadas |

Se guarda junto con el resto de preferencias al pulsar "Guardar preferencias".

### Archivos adicionales afectados

| Archivo | Acción |
|---|---|
| `frontend/src/pages/ProfilePage.tsx` | Añadir pestaña "Notificaciones" en modal de preferencias con toggles |
| `functions/modules/notifications.js` | Leer `notificationPreferences` antes de crear cada notificación |

---

## Archivos a crear / modificar

| Archivo | Acción |
|---|---|
| `frontend/src/components/NotificationBanner.tsx` | Crear — componente banner efímero |
| `frontend/src/context/NotificationBannerContext.tsx` | Crear — cola global de banners |
| `frontend/src/App.tsx` | Modificar — montar banner, registrar FCM, listeners de push |
| `frontend/src/components/NotificationModal.tsx` | Modificar — orden por updatedAt, mostrar count, borrar chats |
| `frontend/src/components/NotificationHistoryModal.tsx` | Modificar — ídem |
| `frontend/src/pages/ChatsPage.tsx` | Modificar — borrar notificación al abrir chat |
| `functions/modules/notifications.js` | Modificar — upsert pattern, push FCM, nuevos triggers |
| `frontend/package.json` | Modificar — añadir `@capacitor/push-notifications` |
| `frontend/android/app/src/main/AndroidManifest.xml` | Modificar — permisos y canal de notificaciones |
| `frontend/src/pages/ProfilePage.tsx` | Modificar — pestaña "Notificaciones" con toggles de preferencias |

---

## Dependencias externas

- `@capacitor/push-notifications` — nuevo paquete npm
- Firebase Cloud Messaging ya está disponible via `firebase-admin` en Cloud Functions
- No se necesita ninguna cuenta externa ni servicio de pago

---

*Diseño generado: 2026-04-13*

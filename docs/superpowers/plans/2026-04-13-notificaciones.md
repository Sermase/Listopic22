# Notificaciones — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir push notifications reales en Android via FCM, agrupar notificaciones en Firestore por tipo+contexto, añadir dos tipos nuevos (new_message, list_follow), banner in-app efímero, y pestaña de preferencias de notificaciones en el perfil.

**Architecture:** Las Cloud Functions escriben en Firestore con un ID determinista (upsert) en vez de añadir documentos nuevos, y tras escribir envían el push via FCM. El frontend registra el token FCM en login, intercepta los pushes cuando la app está abierta y muestra un banner propio (cola, 1.5s, fade). Las preferencias se guardan en el documento del usuario y las Cloud Functions las consultan antes de notificar.

**Tech Stack:** Firebase Cloud Messaging, `@capacitor/push-notifications`, React context para la cola de banners, Firestore subcollección `users/{uid}/notifications`, Cloud Functions v2 Node.js.

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `functions/modules/notifications.js` | Modificar — upsert, FCM push, nuevos triggers (message, list_follow) |
| `functions/modules/chat.js` | Modificar — llamar a sendNotification tras actualizar chat |
| `functions/modules/social.js` | Modificar — llamar a sendNotification en onListFollowingWrite |
| `frontend/src/context/NotificationBannerContext.tsx` | Crear — cola global de banners |
| `frontend/src/components/NotificationBanner.tsx` | Crear — banner visual efímero |
| `frontend/src/App.tsx` | Modificar — montar banner, registrar FCM, listeners push |
| `frontend/src/components/NotificationModal.tsx` | Modificar — ordenar por updatedAt, borrar chats al leer |
| `frontend/src/components/NotificationHistoryModal.tsx` | Modificar — mismo orden, mostrar count |
| `frontend/src/pages/ChatsPage.tsx` | Modificar — borrar notif msg_{chatId} al abrir chat |
| `frontend/src/pages/ProfilePage.tsx` | Modificar — pestaña Notificaciones con toggles |
| `frontend/src/services/UserProfileService.ts` | Modificar — guardar notificationPreferences |
| `frontend/android/app/src/main/AndroidManifest.xml` | Modificar — permisos POST_NOTIFICATIONS |
| `frontend/package.json` | Modificar — añadir @capacitor/push-notifications |

---

## Task 1: Instalar dependencia de push notifications

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Instalar el paquete**

```bash
cd frontend
npm install @capacitor/push-notifications
npx cap sync android
```

Resultado esperado: sin errores, `@capacitor/push-notifications` aparece en `package.json` dependencies.

- [ ] **Step 2: Verificar que el paquete está disponible**

```bash
node -e "require('@capacitor/push-notifications'); console.log('ok')"
```

Resultado esperado: `ok`

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/android/
git commit -m "feat: install @capacitor/push-notifications"
```

---

## Task 2: Permisos Android para notificaciones push

**Files:**
- Modify: `frontend/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Abrir el archivo**

Ruta: `frontend/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 2: Añadir permiso POST_NOTIFICATIONS dentro de `<manifest>`**

Busca la línea `<uses-permission android:name="android.permission.INTERNET" />` y añade justo después:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
```

- [ ] **Step 3: Verificar que el archivo sigue siendo XML válido**

```bash
xmllint --noout frontend/android/app/src/main/AndroidManifest.xml && echo "XML válido"
```

Resultado esperado: `XML válido`

- [ ] **Step 4: Commit**

```bash
git add frontend/android/app/src/main/AndroidManifest.xml
git commit -m "feat: add POST_NOTIFICATIONS permission to AndroidManifest"
```

---

## Task 3: Refactorizar sendNotification a upsert + añadir push FCM

**Files:**
- Modify: `functions/modules/notifications.js`

Esta es la pieza central. Reemplaza la función `sendNotification` para que:
1. Use un ID determinista (upsert) cuando se pase `notificationId`
2. Incremente `count` si ya existe y no está leída
3. Envíe el push FCM tras escribir en Firestore

- [ ] **Step 1: Reemplazar `sendNotification` en `functions/modules/notifications.js`**

Reemplaza **todo el contenido del archivo** con:

```js
const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const db = getFirestore();

// ─── Obtener tokens FCM de un usuario ──────────────────────────────────────
async function getFcmTokens(userId) {
    try {
        const snap = await db.collection("users").doc(userId).collection("fcmTokens").get();
        return snap.docs.map(d => d.data().token).filter(Boolean);
    } catch {
        return [];
    }
}

// ─── Limpiar tokens inválidos ───────────────────────────────────────────────
async function cleanInvalidTokens(userId, invalidTokens) {
    if (!invalidTokens.length) return;
    const snap = await db.collection("users").doc(userId).collection("fcmTokens").get();
    const batch = db.batch();
    snap.docs.forEach(d => {
        if (invalidTokens.includes(d.data().token)) batch.delete(d.ref);
    });
    await batch.commit();
}

// ─── Enviar push FCM ────────────────────────────────────────────────────────
async function sendPush(userId, title, body, data = {}) {
    const tokens = await getFcmTokens(userId);
    if (!tokens.length) return;

    try {
        const response = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title, body },
            data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
            android: {
                priority: "high",
                notification: { channelId: "listopic_default", sound: "default" }
            }
        });

        const invalidTokens = [];
        response.responses.forEach((r, i) => {
            if (!r.success && r.error?.code === "messaging/registration-token-not-registered") {
                invalidTokens.push(tokens[i]);
            }
        });
        await cleanInvalidTokens(userId, invalidTokens);
    } catch (err) {
        logger.error("Error sending FCM push:", err);
    }
}

// ─── Leer preferencias del usuario ─────────────────────────────────────────
async function getUserNotifPrefs(userId) {
    try {
        const snap = await db.collection("users").doc(userId).get();
        return snap.exists ? (snap.data().notificationPreferences || {}) : {};
    } catch {
        return {};
    }
}

// ─── sendNotification (upsert) ──────────────────────────────────────────────
/**
 * @param {string} userId - UID del destinatario
 * @param {string} type - Tipo de notificación
 * @param {object} payload - { senderId, senderName, senderPhoto, message, link, ... }
 * @param {object} options - { notificationId: string, deletedOnRead?: boolean }
 */
async function sendNotification(userId, type, payload, options = {}) {
    if (!userId) return;

    try {
        // Comprobar preferencias
        const prefs = await getUserNotifPrefs(userId);
        if (prefs[type] === false) return; // usuario desactivó este tipo

        const userRef = db.collection("users").doc(userId);
        const notifId = options.notificationId || null;

        if (notifId) {
            const notifRef = userRef.collection("notifications").doc(notifId);
            const existing = await notifRef.get();

            if (existing.exists && !existing.data().read) {
                // Actualizar: incrementar count, nuevo mensaje, updatedAt
                const newCount = (existing.data().count || 1) + 1;
                const newMessage = buildMessage(type, payload.senderName, newCount, payload);

                await notifRef.set({
                    ...payload,
                    type,
                    count: newCount,
                    message: newMessage,
                    updatedAt: FieldValue.serverTimestamp(),
                    deletedOnRead: options.deletedOnRead || false,
                }, { merge: true });

                await sendPush(userId, "Listopic", newMessage, { type, link: payload.link || "", notificationId: notifId });
                return;
            }

            // Crear nuevo (no existe o ya estaba leída)
            const message = buildMessage(type, payload.senderName, 1, payload);
            await notifRef.set({
                type,
                ...payload,
                message,
                count: 1,
                read: false,
                deletedOnRead: options.deletedOnRead || false,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });

            await userRef.set({ unreadNotificationsCount: FieldValue.increment(1) }, { merge: true });
            await sendPush(userId, "Listopic", message, { type, link: payload.link || "", notificationId: notifId });
            return;
        }

        // Sin notifId: insert clásico (para badges, level_up que no agrupan)
        const message = payload.message || buildMessage(type, payload.senderName, 1, payload);
        await userRef.collection("notifications").add({
            type,
            ...payload,
            message,
            count: 1,
            read: false,
            deletedOnRead: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        await userRef.set({ unreadNotificationsCount: FieldValue.increment(1) }, { merge: true });
        await sendPush(userId, "Listopic", message, { type, link: payload.link || "" });

    } catch (error) {
        logger.error(`Error sending notification to ${userId}:`, error);
    }
}

// ─── Texto dinámico por tipo ────────────────────────────────────────────────
function buildMessage(type, senderName, count, payload) {
    const name = senderName || "Alguien";
    switch (type) {
        case "new_message":
            return count === 1
                ? `Mensaje nuevo de ${name}`
                : `${count} mensajes nuevos de ${name}`;
        case "new_follower":
            return count === 1
                ? `${name} ha empezado a seguirte`
                : `${name} y otras ${count - 1} personas han empezado a seguirte`;
        case "review_comment":
            return count === 1
                ? `${name} ha comentado en tu reseña`
                : `${count} comentarios nuevos en tu reseña`;
        case "review_like":
            return count === 1
                ? `A ${name} le ha gustado tu reseña`
                : `A ${count} personas les ha gustado tu reseña`;
        case "list_follow":
            return count === 1
                ? `${name} sigue ahora tu lista`
                : `${count} personas siguen ahora tu lista`;
        case "level_up":
            return `Has subido al nivel ${payload.level || ""}`;
        case "badge_earned":
            return `Has desbloqueado la medalla "${payload.badgeName || ""}"`;
        default:
            return payload.message || "Nueva notificación";
    }
}

// ─── TRIGGERS ───────────────────────────────────────────────────────────────

const onFollowUser = onDocumentWritten("users/{uid}/followers/{followerId}", async (event) => {
    if (!event.data.before.exists && event.data.after.exists) {
        const followerId = event.params.followerId;
        const targetUserId = event.params.uid;

        const snap = await db.collection("users").doc(followerId).get();
        const followerName = snap.exists ? (snap.data().displayName || "Un usuario") : "Un usuario";
        const followerPhoto = snap.exists ? (snap.data().photoUrl || null) : null;

        await sendNotification(targetUserId, "new_follower", {
            senderId: followerId,
            senderName: followerName,
            senderPhoto: followerPhoto,
            link: `/profile/${followerId}`,
        }, { notificationId: "followers_new" });
    }
});

const onReviewReaction = onDocumentWritten("lists/{listId}/reviews/{reviewId}/reactions/{userId}", async (event) => {
    if (!event.data.before.exists && event.data.after.exists) {
        const { listId, reviewId, userId: reactorId } = event.params;
        const reactionData = event.data.after.data();
        if (reactionData.reaction !== "like") return;

        const reviewSnap = await db.doc(`lists/${listId}/reviews/${reviewId}`).get();
        if (!reviewSnap.exists) return;
        const reviewData = reviewSnap.data();
        const authorId = reviewData.userId || reviewData.authorId;
        if (authorId === reactorId) return;

        const reactorSnap = await db.collection("users").doc(reactorId).get();
        const reactorName = reactorSnap.exists ? (reactorSnap.data().displayName || "Alguien") : "Alguien";
        const reactorPhoto = reactorSnap.exists ? reactorSnap.data().photoUrl : null;

        await sendNotification(authorId, "review_like", {
            senderId: reactorId,
            senderName: reactorName,
            senderPhoto: reactorPhoto,
            link: reviewData.placeId ? `/place/${reviewData.placeId}?reviewId=${reviewId}` : `/list/${listId}`,
            placeName: reviewData.placeName || "un lugar",
        }, { notificationId: `like_${reviewId}` });
    }
});

const onReviewComment = onDocumentWritten("lists/{listId}/reviews/{reviewId}/comments/{commentId}", async (event) => {
    const { listId, reviewId } = event.params;
    const reviewRef = db.doc(`lists/${listId}/reviews/${reviewId}`);
    const isCreate = !event.data.before.exists && event.data.after.exists;
    const isDelete = event.data.before.exists && !event.data.after.exists;
    if (!isCreate && !isDelete) return;

    if (isCreate) {
        await reviewRef.update({ commentCount: FieldValue.increment(1) });

        const commentData = event.data.after.data();
        const commenterId = commentData.userId;
        const reviewSnap = await reviewRef.get();
        if (!reviewSnap.exists) return;

        const reviewData = reviewSnap.data();
        const authorId = reviewData.userId || reviewData.authorId;
        if (authorId === commenterId) return;

        const commenterSnap = await db.collection("users").doc(commenterId).get();
        const commenterName = commenterSnap.exists ? (commenterSnap.data().displayName || "Alguien") : "Alguien";
        const commenterPhoto = commenterSnap.exists ? commenterSnap.data().photoUrl : null;

        await sendNotification(authorId, "review_comment", {
            senderId: commenterId,
            senderName: commenterName,
            senderPhoto: commenterPhoto,
            link: `/list/${listId}?reviewId=${reviewId}`,
            placeName: reviewData.placeName || "un lugar",
            preview: commentData.text ? commentData.text.substring(0, 60) : "",
        }, { notificationId: `comment_${reviewId}` });

    } else if (isDelete) {
        await reviewRef.update({ commentCount: FieldValue.increment(-1) });
    }
});

module.exports = {
    onFollowUser,
    onReviewReaction,
    onReviewComment,
    sendNotification,
};
```

- [ ] **Step 2: Verificar sintaxis**

```bash
cd functions && node -e "require('./modules/notifications'); console.log('ok')"
```

Resultado esperado: `ok`

- [ ] **Step 3: Commit**

```bash
git add functions/modules/notifications.js
git commit -m "feat: refactor sendNotification to upsert + FCM push"
```

---

## Task 4: Trigger new_message en chat.js

**Files:**
- Modify: `functions/modules/chat.js`

- [ ] **Step 1: Añadir llamada a sendNotification al final de onMessageCreate**

Abre `functions/modules/chat.js`. Añade el require al principio:

```js
const { sendNotification } = require("./notifications");
```

Y al final del bloque `try` de `onMessageCreate`, después del `await db.runTransaction(...)`, añade:

```js
        // Notificar a participantes (excepto remitente)
        const chatSnap = await db.collection("chats").doc(chatId).get();
        if (chatSnap.exists) {
            const participants = chatSnap.data().participants || [];
            const senderSnap = await db.collection("users").doc(senderId).get();
            const senderName = senderSnap.exists ? (senderSnap.data().displayName || "Alguien") : "Alguien";
            const senderPhoto = senderSnap.exists ? (senderSnap.data().photoUrl || null) : null;

            await Promise.all(
                participants
                    .filter(uid => uid !== senderId)
                    .map(uid => sendNotification(uid, "new_message", {
                        senderId,
                        senderName,
                        senderPhoto,
                        link: `/chats/${chatId}`,
                        preview: (messageData.text || "").slice(0, 60),
                    }, {
                        notificationId: `msg_${chatId}`,
                        deletedOnRead: true,
                    }))
            );
        }
```

- [ ] **Step 2: Verificar sintaxis**

```bash
cd functions && node -e "require('./modules/chat'); console.log('ok')"
```

Resultado esperado: `ok`

- [ ] **Step 3: Commit**

```bash
git add functions/modules/chat.js
git commit -m "feat: notify chat participants on new message"
```

---

## Task 5: Trigger list_follow en social.js

**Files:**
- Modify: `functions/modules/social.js`

- [ ] **Step 1: Añadir require al principio de social.js**

```js
const { sendNotification } = require("./notifications");
```

- [ ] **Step 2: En la función `onListFollowingWrite`, dentro del bloque `isCreate`, añadir notificación**

Localiza el bloque donde se incrementa `followingListsCount`. Después de `await userRef.update({ followingListsCount: ... })`, añade:

```js
            // Notificar al autor de la lista
            try {
                const listSnap = await db.collection("lists").doc(listId).get();
                if (listSnap.exists) {
                    const listData = listSnap.data();
                    const listAuthorId = listData.userId || listData.authorId;
                    if (listAuthorId && listAuthorId !== uid) {
                        const followerSnap = await db.collection("users").doc(uid).get();
                        const followerName = followerSnap.exists ? (followerSnap.data().displayName || "Alguien") : "Alguien";
                        const followerPhoto = followerSnap.exists ? (followerSnap.data().photoUrl || null) : null;

                        await sendNotification(listAuthorId, "list_follow", {
                            senderId: uid,
                            senderName: followerName,
                            senderPhoto: followerPhoto,
                            link: `/list/${listId}`,
                            listId,
                        }, { notificationId: `listfollow_${listId}` });
                    }
                }
            } catch (e) {
                logger.error("Error sending list_follow notification:", e);
            }
```

- [ ] **Step 3: Verificar sintaxis**

```bash
cd functions && node -e "require('./modules/social'); console.log('ok')"
```

Resultado esperado: `ok`

- [ ] **Step 4: Commit**

```bash
git add functions/modules/social.js
git commit -m "feat: notify list author when someone follows their list"
```

---

## Task 6: Desplegar Cloud Functions

**Files:** (ninguno nuevo, solo despliegue)

- [ ] **Step 1: Desplegar solo los módulos cambiados**

```bash
cd /ruta/del/proyecto
firebase deploy --only functions:onFollowUser,functions:onReviewReaction,functions:onReviewComment,functions:onMessageCreate,functions:onListFollowingWrite
```

Resultado esperado: `Deploy complete!` sin errores.

- [ ] **Step 2: Verificar en Firebase Console**

Ir a Firebase Console → Functions → comprobar que las 5 funciones están activas y sin errores recientes.

---

## Task 7: Contexto global del banner — NotificationBannerContext

**Files:**
- Create: `frontend/src/context/NotificationBannerContext.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export interface BannerItem {
    type: string;
    message: string;
    link: string;
    senderPhoto?: string | null;
}

interface BannerContextValue {
    showBanner: (item: BannerItem) => void;
    current: BannerItem | null;
    dismiss: () => void;
}

const BannerContext = createContext<BannerContextValue>({
    showBanner: () => {},
    current: null,
    dismiss: () => {},
});

export const useNotificationBanner = () => useContext(BannerContext);

export const NotificationBannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [current, setCurrent] = useState<BannerItem | null>(null);
    const queue = useRef<BannerItem[]>([]);
    const showing = useRef(false);

    const showNext = useCallback(() => {
        if (queue.current.length === 0) {
            showing.current = false;
            setCurrent(null);
            return;
        }
        const next = queue.current.shift()!;
        showing.current = true;
        setCurrent(next);
    }, []);

    const dismiss = useCallback(() => {
        showNext();
    }, [showNext]);

    const showBanner = useCallback((item: BannerItem) => {
        if (queue.current.length >= 5) return; // máximo 5 en cola
        if (!showing.current) {
            showing.current = true;
            setCurrent(item);
        } else {
            queue.current.push(item);
        }
    }, []);

    return (
        <BannerContext.Provider value={{ showBanner, current, dismiss }}>
            {children}
        </BannerContext.Provider>
    );
};
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd frontend && ./node_modules/.bin/tsc -p tsconfig.app.json --noEmit --skipLibCheck 2>&1 | tail -5
echo "EXIT: $?"
```

Resultado esperado: `EXIT: 0`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/context/NotificationBannerContext.tsx
git commit -m "feat: add NotificationBannerContext for in-app push banner queue"
```

---

## Task 8: Componente NotificationBanner

**Files:**
- Create: `frontend/src/components/NotificationBanner.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Heart, UserPlus, MessageSquare, Star, Award, List } from 'lucide-react';
import { useNotificationBanner } from '../context/NotificationBannerContext';

const ICON_MAP: Record<string, React.ReactNode> = {
    new_message: <MessageSquare className="w-3.5 h-3.5 text-blue-400" />,
    new_follower: <UserPlus className="w-3.5 h-3.5 text-indigo-400" />,
    review_like: <Heart className="w-3.5 h-3.5 text-pink-400" />,
    review_comment: <MessageSquare className="w-3.5 h-3.5 text-blue-400" />,
    list_follow: <List className="w-3.5 h-3.5 text-cyan-400" />,
    level_up: <Star className="w-3.5 h-3.5 text-amber-400" />,
    badge_earned: <Award className="w-3.5 h-3.5 text-amber-400" />,
};

export const NotificationBanner: React.FC = () => {
    const { current, dismiss } = useNotificationBanner();
    const navigate = useNavigate();
    const [visible, setVisible] = useState(false);
    const [fading, setFading] = useState(false);

    useEffect(() => {
        if (!current) {
            setVisible(false);
            setFading(false);
            return;
        }

        // Aparecer
        setFading(false);
        setVisible(true);

        // Esperar 1.5s → fade out → dismiss
        const fadeTimer = setTimeout(() => setFading(true), 1500);
        const dismissTimer = setTimeout(() => dismiss(), 1500 + 400);

        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(dismissTimer);
        };
    }, [current, dismiss]);

    if (!current || !visible) return null;

    const handleClick = () => {
        dismiss();
        if (current.link) navigate(current.link);
    };

    const icon = ICON_MAP[current.type] || <Bell className="w-3.5 h-3.5 text-gray-400" />;

    return (
        <div
            onClick={handleClick}
            className="fixed top-16 left-1/2 z-[200] cursor-pointer"
            style={{
                transform: 'translateX(-50%)',
                transition: 'opacity 400ms ease',
                opacity: fading ? 0 : 1,
                pointerEvents: fading ? 'none' : 'auto',
            }}
        >
            <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/70 backdrop-blur-md border border-white/10 shadow-xl max-w-[300px]">
                {current.senderPhoto ? (
                    <img
                        src={current.senderPhoto}
                        alt=""
                        className="w-5 h-5 rounded-full object-cover shrink-0"
                    />
                ) : (
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                        {icon}
                    </div>
                )}
                <span className="text-white text-xs font-medium truncate">{current.message}</span>
                <div className="shrink-0">{icon}</div>
            </div>
        </div>
    );
};
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd frontend && ./node_modules/.bin/tsc -p tsconfig.app.json --noEmit --skipLibCheck 2>&1 | tail -5
echo "EXIT: $?"
```

Resultado esperado: `EXIT: 0`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/NotificationBanner.tsx
git commit -m "feat: add NotificationBanner in-app component"
```

---

## Task 9: Integrar banner y FCM en App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Añadir imports al principio de App.tsx**

```tsx
import { PushNotifications } from '@capacitor/push-notifications';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { NotificationBannerProvider, useNotificationBanner } from './context/NotificationBannerContext';
import { NotificationBanner } from './components/NotificationBanner';
```

- [ ] **Step 2: Crear componente PushSetup dentro de App.tsx, antes de AppRoutes**

```tsx
const PushSetup: React.FC = () => {
    const { user } = useAuth();
    const { showBanner } = useNotificationBanner();
    const navigate = useNavigate();

    React.useEffect(() => {
        if (!Capacitor.isNativePlatform() || !user) return;

        const setup = async () => {
            const permission = await PushNotifications.requestPermissions();
            if (permission.receive !== 'granted') return;
            await PushNotifications.register();
        };
        setup();

        // Token registrado
        const regListener = PushNotifications.addListener('registration', async ({ value: token }) => {
            await setDoc(
                doc(db, 'users', user.uid, 'fcmTokens', token),
                { token, platform: 'android', lastSeen: serverTimestamp(), createdAt: serverTimestamp() },
                { merge: true }
            );
        });

        // Push recibido con app ABIERTA → banner propio
        const recvListener = PushNotifications.addListener('pushNotificationReceived', (notification) => {
            showBanner({
                type: notification.data?.type || 'system',
                message: notification.notification.body || '',
                link: notification.data?.link || '',
                senderPhoto: notification.data?.senderPhoto || null,
            });
        });

        // Usuario pulsó notificación nativa (app en segundo plano)
        const actionListener = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            const link = action.notification.data?.link;
            if (link) navigate(link);
        });

        return () => {
            regListener.then(l => l.remove());
            recvListener.then(l => l.remove());
            actionListener.then(l => l.remove());
        };
    }, [user, showBanner, navigate]);

    return null;
};
```

- [ ] **Step 3: Envolver App en NotificationBannerProvider y añadir componentes**

En la función `App()`, el return actual es:
```tsx
return (
    <ToastProvider>
        <LocationActivator />
        <Router>
            ...
        </Router>
    </ToastProvider>
);
```

Cámbialo a:
```tsx
return (
    <ToastProvider>
        <LocationActivator />
        <NotificationBannerProvider>
            <Router>
                <ScrollToTop />
                <div className="min-h-screen bg-[#0b1021] text-gray-100 font-sans selection:bg-indigo-500/30"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    <Navbar />
                    <NotificationBanner />
                    <AppRoutes />
                    <PushSetup />
                </div>
            </Router>
        </NotificationBannerProvider>
    </ToastProvider>
);
```

Nota: `PushSetup` necesita estar dentro de `<Router>` porque usa `useNavigate`.

- [ ] **Step 4: Verificar TypeScript**

```bash
cd frontend && ./node_modules/.bin/tsc -p tsconfig.app.json --noEmit --skipLibCheck 2>&1 | tail -5
echo "EXIT: $?"
```

Resultado esperado: `EXIT: 0`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: integrate FCM push setup and in-app banner into App"
```

---

## Task 10: Actualizar NotificationModal — ordenar por updatedAt y borrar chats

**Files:**
- Modify: `frontend/src/components/NotificationModal.tsx`

- [ ] **Step 1: Cambiar la query para ordenar por `updatedAt`**

En `NotificationModal.tsx`, línea ~29, cambia:
```tsx
orderBy('createdAt', 'desc'),
```
por:
```tsx
orderBy('updatedAt', 'desc'),
```

- [ ] **Step 2: Añadir `deleteDoc` al import de firebase/firestore**

```tsx
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
```

- [ ] **Step 3: Actualizar el handler de click en notificaciones para borrar chats**

Busca las dos ocurrencias de:
```tsx
onClick={() => {
    if (!notification.read && user) {
        updateDoc(doc(db, 'users', user.uid, 'notifications', notification.id), { read: true });
    }
    onClose();
}}
```

Reemplaza **ambas** por:
```tsx
onClick={() => {
    if (!notification.read && user) {
        if (notification.deletedOnRead) {
            deleteDoc(doc(db, 'users', user.uid, 'notifications', notification.id));
        } else {
            updateDoc(doc(db, 'users', user.uid, 'notifications', notification.id), { read: true });
        }
    }
    onClose();
}}
```

- [ ] **Step 4: Actualizar `handleMarkAllRead` para respetar deletedOnRead**

```tsx
const handleMarkAllRead = async () => {
    if (!user) return;
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;

    const batch = writeBatch(db);
    unread.forEach(n => {
        const ref = doc(db, 'users', user.uid, 'notifications', n.id);
        if (n.deletedOnRead) {
            batch.delete(ref);
        } else {
            batch.update(ref, { read: true });
        }
    });
    await batch.commit();
};
```

- [ ] **Step 5: Mostrar `count` en el badge cuando > 1**

El badge ya existe con `notification.groupCount`. Ahora las notificaciones agrupadas tienen `count` en el propio documento. Actualiza la condición en los dos bloques de renderizado:

```tsx
{(notification.count > 1 || notification.groupCount > 1) && (
    <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
        {notification.count || notification.groupCount}
    </span>
)}
```

- [ ] **Step 6: Añadir icono para list_follow y new_message**

En la función `getIcon`:
```tsx
case 'new_message':
    return <MessageSquare className="w-4 h-4 text-blue-400" />;
case 'list_follow':
    return <ListIcon className="w-4 h-4 text-cyan-400" />;
```

Añade `List as ListIcon` al import de lucide-react.

- [ ] **Step 7: Verificar TypeScript**

```bash
cd frontend && ./node_modules/.bin/tsc -p tsconfig.app.json --noEmit --skipLibCheck 2>&1 | tail -5
echo "EXIT: $?"
```

Resultado esperado: `EXIT: 0`

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/NotificationModal.tsx
git commit -m "feat: update NotificationModal — updatedAt order, delete chat notifs, count badge"
```

---

## Task 11: Actualizar NotificationHistoryModal

**Files:**
- Modify: `frontend/src/components/NotificationHistoryModal.tsx`

- [ ] **Step 1: Añadir icono new_message y list_follow a getIcon**

```tsx
case 'new_message':
    return <MessageSquare className="w-4 h-4 text-blue-400" />;
case 'list_follow':
    return <ListIcon className="w-4 h-4 text-cyan-400" />;
```

Añade `List as ListIcon` al import de lucide-react.

- [ ] **Step 2: Cambiar query a `updatedAt`**

```tsx
orderBy('updatedAt', 'desc')
```

- [ ] **Step 3: Mostrar count si > 1 junto al mensaje**

En el bloque de renderizado de cada notificación, después de `{notification.message}`, añade:

```tsx
{notification.count > 1 && (
    <span className="ml-1 text-xs font-bold text-indigo-400">({notification.count})</span>
)}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd frontend && ./node_modules/.bin/tsc -p tsconfig.app.json --noEmit --skipLibCheck 2>&1 | tail -5
echo "EXIT: $?"
```

Resultado esperado: `EXIT: 0`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NotificationHistoryModal.tsx
git commit -m "feat: update NotificationHistoryModal — updatedAt order, count display"
```

---

## Task 12: Borrar notificación de chat al abrir ChatsPage

**Files:**
- Modify: `frontend/src/pages/ChatsPage.tsx`

- [ ] **Step 1: Añadir import de deleteDoc**

```tsx
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
```

(Si ya están importados, omitir.)

- [ ] **Step 2: Añadir efecto que borra la notificación cuando se activa un chat**

Busca el `useEffect` que hace `setActiveChat(chatId)` (~línea 104). Añade justo después del `setActiveChat`:

```tsx
// Borrar notificación de mensaje de este chat si existe
if (user && chatId) {
    deleteDoc(doc(db, 'users', user.uid, 'notifications', `msg_${chatId}`)).catch(() => {});
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd frontend && ./node_modules/.bin/tsc -p tsconfig.app.json --noEmit --skipLibCheck 2>&1 | tail -5
echo "EXIT: $?"
```

Resultado esperado: `EXIT: 0`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ChatsPage.tsx
git commit -m "feat: delete chat notification when opening chat"
```

---

## Task 13: Pestaña de preferencias de notificaciones en ProfilePage

**Files:**
- Modify: `frontend/src/pages/ProfilePage.tsx`
- Modify: `frontend/src/services/UserProfileService.ts`

### Parte A — UserProfileService

- [ ] **Step 1: Añadir `notificationPreferences` al tipo `PreferencesUpdateData`**

Localiza la definición de `PreferencesUpdateData` en `UserProfileService.ts` y añade el campo:

```ts
notificationPreferences?: {
    new_message?: boolean;
    new_follower?: boolean;
    review_comment?: boolean;
    review_like?: boolean;
    list_follow?: boolean;
    level_up?: boolean;
    badge_earned?: boolean;
};
```

- [ ] **Step 2: En `updateUserProfilePreferences`, guardar las preferencias**

Dentro del `setDoc(userRef, { ... }, { merge: true })`, añade:

```ts
...(data.notificationPreferences !== undefined
    ? { notificationPreferences: data.notificationPreferences }
    : {}),
```

### Parte B — ProfilePage

- [ ] **Step 3: Añadir estado para la pestaña y las preferencias**

Busca donde están los estados del modal de preferencias (~línea 138) y añade:

```tsx
const [preferencesTab, setPreferencesTab] = useState<"user" | "search" | "delete" | "notifications">("user");
const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    new_message: true,
    new_follower: true,
    review_comment: true,
    review_like: true,
    list_follow: true,
    level_up: true,
    badge_earned: true,
});
```

- [ ] **Step 4: Cargar las preferencias cuando se abre el modal**

En `openPreferencesModal`, después de `setIsEditing(true)`:

```tsx
if (profile?.notificationPreferences) {
    setNotifPrefs({ ...notifPrefs, ...profile.notificationPreferences });
}
```

- [ ] **Step 5: Añadir botón de pestaña "Notificaciones" en la tab bar**

Junto a los botones "Usuario", "Busqueda" y "Eliminar":

```tsx
<button
    type="button"
    onClick={() => setPreferencesTab("notifications")}
    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${preferencesTab === "notifications"
        ? "bg-indigo-600 text-white"
        : "text-gray-300 hover:text-white"
    }`}
>
    Notificaciones
</button>
```

- [ ] **Step 6: Añadir contenido de la pestaña notifications**

Junto al bloque `{preferencesTab === "delete" && (...)}`, añade:

```tsx
{preferencesTab === "notifications" && (
    <div className="space-y-3">
        <p className="text-xs text-gray-500">Elige qué notificaciones quieres recibir.</p>
        {[
            { key: "new_message", label: "Mensajes nuevos" },
            { key: "new_follower", label: "Nuevos seguidores" },
            { key: "review_comment", label: "Comentarios en tus reseñas" },
            { key: "review_like", label: "Likes en tus reseñas" },
            { key: "list_follow", label: "Alguien sigue una lista tuya" },
            { key: "level_up", label: "Subidas de nivel" },
            { key: "badge_earned", label: "Medallas desbloqueadas" },
        ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-sm text-gray-300">{label}</span>
                <button
                    type="button"
                    onClick={() => setNotifPrefs(prev => ({ ...prev, [key]: !prev[key] }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                        notifPrefs[key] !== false ? 'bg-indigo-600' : 'bg-white/10'
                    }`}
                >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                        notifPrefs[key] !== false ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                </button>
            </div>
        ))}
    </div>
)}
```

- [ ] **Step 7: Pasar `notificationPreferences` al guardar preferencias**

En la función `savePreferences`, dentro del objeto que se pasa a `updateUserProfilePreferences`, añade:

```tsx
notificationPreferences: notifPrefs,
```

- [ ] **Step 8: Verificar TypeScript**

```bash
cd frontend && ./node_modules/.bin/tsc -p tsconfig.app.json --noEmit --skipLibCheck 2>&1 | tail -5
echo "EXIT: $?"
```

Resultado esperado: `EXIT: 0`

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/ProfilePage.tsx frontend/src/services/UserProfileService.ts
git commit -m "feat: add notification preferences tab in profile modal"
```

---

## Task 14: Build y prueba en Android

- [ ] **Step 1: Build del frontend**

```bash
cd frontend
npm run build
```

Resultado esperado: sin errores de TypeScript ni de Vite.

- [ ] **Step 2: Sync con Android**

```bash
npx cap sync android
```

- [ ] **Step 3: Prueba manual en dispositivo/emulador**

Pasos a verificar:
1. Al abrir la app por primera vez → solicita permiso de notificaciones → aceptar
2. Desde otra cuenta, enviar un mensaje → debe llegar push en Android
3. Con la app abierta, enviar otro mensaje → debe aparecer el banner in-app (pequeño, arriba, desaparece en 1.5s)
4. Abrir el chat → la notificación `msg_{chatId}` debe desaparecer de la campana
5. Con la app cerrada, enviar mensaje → debe llegar notificación nativa del sistema
6. Pulsar la notificación nativa → debe abrir la app y navegar al chat correcto
7. En preferencias → pestaña Notificaciones → desactivar "Mensajes nuevos" → enviar mensaje → no debe llegar notificación

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat: push notifications complete — FCM, banner, preferences"
```

---

## Self-Review

**Spec coverage:**
- ✅ Upsert pattern en sendNotification
- ✅ FCM push tras cada notificación
- ✅ Nuevos tipos: new_message (Task 4), list_follow (Task 5)
- ✅ deletedOnRead para chats (Tasks 3, 10, 12)
- ✅ Banner in-app: cola, 1.5s, fade (Tasks 7, 8, 9)
- ✅ Push con app abierta → banner propio (Task 9)
- ✅ Push con app cerrada → nativo Android (Task 9)
- ✅ Tokens FCM guardados en users/{uid}/fcmTokens (Task 9)
- ✅ Tokens inválidos limpiados automáticamente (Task 3)
- ✅ Preferencias de notificación por tipo (Task 13)
- ✅ Cloud Functions consultan preferencias antes de notificar (Task 3)
- ✅ NotificationModal ordena por updatedAt (Task 10)
- ✅ Count badge en notificaciones agrupadas (Tasks 10, 11)
- ✅ Icono new_message y list_follow (Tasks 10, 11)
- ✅ Permisos AndroidManifest (Task 2)

**Placeholders:** Ninguno.

**Consistencia de tipos:** `notifId` determinista es consistente en Tasks 3, 4, 5, 10, 12. `deletedOnRead` se crea en Task 3 y se consume en Tasks 10 y 12.

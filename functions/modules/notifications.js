const { onDocumentWritten } = require("firebase-functions/v2/firestore");
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
    logger.info("sendPush started", {
        type: data.type || "unknown",
        hasLink: Boolean(data.link),
    });
    const tokens = await getFcmTokens(userId);
    if (!tokens.length) {
        logger.info("sendPush skipped: no FCM tokens", {
            type: data.type || "unknown",
        });
        return;
    }

    try {
        const payload = {
            tokens,
            notification: { title, body },
            data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
            android: {
                priority: "high",
                notification: { channelId: "listopic_default", sound: "default" }
            }
        };
        const response = await admin.messaging().sendEachForMulticast(payload);

        logger.info("sendPush completed", {
            type: data.type || "unknown",
            tokenCount: tokens.length,
            successCount: response.successCount,
            failureCount: response.failureCount,
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
 * @param {object} options - { notificationId?: string, deletedOnRead?: boolean }
 */
async function sendNotification(userId, type, payload, options = {}) {
    if (!userId) return;

    try {
        // Comprobar preferencias
        const prefs = await getUserNotifPrefs(userId);
        if (prefs[type] === false) return;

        const userRef = db.collection("users").doc(userId);
        const notifId = options.notificationId || null;

        if (type === "new_message") {
            const message = buildMessage(type, payload.senderName, 1, payload);
            await sendPush(userId, "Listopic", message, { type, link: payload.link || "", notificationId: notifId });
            return;
        }

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
        case "business_claim_reviewed":
        case "business_assigned":
            return payload.message || "Actualización de negocio";
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

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { sendNotification } = require("./notifications");

const db = getFirestore();

/**
 * Trigger: When a new message is created in a chat.
 * Path: chats/{chatId}/messages/{messageId}
 */
const onMessageCreate = onDocumentCreated("chats/{chatId}/messages/{messageId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const messageData = snapshot.data();
    const chatId = event.params.chatId;
    const senderId = messageData.senderId;

    try {
        const chatRef = db.collection("chats").doc(chatId);

        // Transaction to read current participants & unread counts, then increment safely
        await db.runTransaction(async (transaction) => {
            const chatDoc = await transaction.get(chatRef);
            if (!chatDoc.exists) return;

            const chatData = chatDoc.data();
            const participants = chatData.participants || [];

            // Prepare updates
            // We want to increment unreadCount for everyone EXCEPT sender
            const updates = {
                lastMessage: messageData.text || 'Mensaje (Multimedia)',
                lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            participants.forEach(uid => {
                if (uid !== senderId) {
                    // Increment using FieldValue for atomicity (though transaction read/write is also fine)
                    updates[`unreadCount.${uid}`] = admin.firestore.FieldValue.increment(1);
                }
            });

            transaction.update(chatRef, updates);
        });

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

    } catch (error) {
        logger.error("Error processing chat message notification", {
            chatId,
            messageId: event.params.messageId,
            error,
        });
    }
});

module.exports = {
    onMessageCreate
};

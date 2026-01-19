const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const db = getFirestore();

/**
 * Sends a notification to a specific user.
 * @param {string} userId - The recipient's UID.
 * @param {string} type - 'new_follower', 'review_like', 'review_comment', 'place_closed'.
 * @param {object} payload - Data related to the notification (senderId, senderName, link, etc.).
 */
async function sendNotification(userId, type, payload) {
    if (!userId) return;

    try {
        await db.collection("users").doc(userId).collection("notifications").add({
            type,
            ...payload,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Optionally update an unreadCount on the user doc if we want super fast access
        // But for now, client-side count or simple query is okay. 
        // Let's increment unreadCount for performance on the Bell icon.
        await db.collection("users").doc(userId).update({
            unreadNotificationsCount: admin.firestore.FieldValue.increment(1)
        });

    } catch (error) {
        logger.error(`Error sending notification to ${userId}:`, error);
    }
}

// --- TRIGGERS ---

/**
 * Trigger: When a user gets a new follower.
 * Path: users/{uid}/followers/{followerId}
 */
const onFollowUser = onDocumentWritten("users/{uid}/followers/{followerId}", async (event) => {
    const followerId = event.params.followerId;
    const targetUserId = event.params.uid;

    // Only on create
    if (!event.data.before.exists && event.data.after.exists) {
        // Fetch FRESH follower data (don't rely on the follower subcollection doc which might be stale copy)
        // OR if the subcollection is just an ID, we MUST fetch. 
        // Assuming subcollection might have minimal data.

        let followerName = "Un usuario";
        let followerPhoto = null;

        const userSnap = await db.collection("users").doc(followerId).get();
        if (userSnap.exists) {
            followerName = userSnap.data().displayName || "Un usuario";
            followerPhoto = userSnap.data().photoUrl || null;
        }

        await sendNotification(targetUserId, 'new_follower', {
            senderId: followerId,
            senderName: followerName,
            senderPhoto: followerPhoto,
            message: "te ha empezado a seguir.",
            link: `/profile/${followerId}`
        });
    }
});

/**
 * Trigger: When a review gets a REACTION (Like).
 * Path: reviews/{reviewId}/reactions/{userId}
 * Note: We now use root-level reviews collection for easier access.
 */
const onReviewReaction = onDocumentWritten("reviews/{reviewId}/reactions/{userId}", async (event) => {
    const reviewId = event.params.reviewId;
    const reactorId = event.params.userId;

    // Only on create (Unlike shouldn't notify)
    if (!event.data.before.exists && event.data.after.exists) {
        const reactionData = event.data.after.data();

        // Only notify for 'like'
        if (reactionData.reaction !== 'like') return;

        // Fetch review to get author and placeId
        const reviewSnapshot = await db.collection('reviews').doc(reviewId).get();
        if (!reviewSnapshot.exists) return;

        const reviewData = reviewSnapshot.data();
        const authorId = reviewData.userId || reviewData.authorId;
        const placeId = reviewData.placeId; // Ensure this exists on review doc

        // Don't notify self-likes
        if (authorId === reactorId) return;

        // Get Reactor info
        const reactorSnapshot = await db.collection("users").doc(reactorId).get();
        const reactorName = reactorSnapshot.exists ? (reactorSnapshot.data().displayName || "Alguien") : "Alguien";
        const reactorPhoto = reactorSnapshot.exists ? reactorSnapshot.data().photoUrl : null;

        await sendNotification(authorId, 'review_like', {
            senderId: reactorId,
            senderName: reactorName,
            senderPhoto: reactorPhoto,
            message: "indicó que le gusta tu reseña.",
            link: placeId ? `/place/${placeId}?reviewId=${reviewId}` : `/reviews/${reviewId}`,
            placeName: reviewData.placeName || "un lugar"
        });
    }
});

/**
 * Trigger: When a review gets a COMMENT.
 * Path: lists/{listId}/reviews/{reviewId}/comments/{commentId}
 */
const onReviewComment = onDocumentWritten("lists/{listId}/reviews/{reviewId}/comments/{commentId}", async (event) => {
    const listId = event.params.listId;
    const reviewId = event.params.reviewId;
    const reviewRef = db.doc(`lists/${listId}/reviews/${reviewId}`);

    const isCreate = !event.data.before.exists && event.data.after.exists;
    const isDelete = event.data.before.exists && !event.data.after.exists;

    if (!isCreate && !isDelete) return;

    try {
        if (isCreate) {
            // 1. Increment comment count
            await reviewRef.update({ commentCount: admin.firestore.FieldValue.increment(1) });

            // 2. Send Notification
            const commentData = event.data.after.data();
            const commenterId = commentData.userId;

            // Fetch review to get author
            const reviewSnapshot = await reviewRef.get();
            if (!reviewSnapshot.exists) return;

            const reviewData = reviewSnapshot.data();
            const authorId = reviewData.userId || reviewData.authorId;

            // Don't notify self-comments
            if (authorId === commenterId) return;

            // Fetch FRESH commenter info
            let commenterName = commentData.userName || "Alguien";
            let commenterPhoto = commentData.userPhoto || null;

            const commenterSnap = await db.collection("users").doc(commenterId).get();
            if (commenterSnap.exists) {
                const cData = commenterSnap.data();
                commenterName = cData.displayName || commenterName;
                commenterPhoto = cData.photoUrl || commenterPhoto;
            }

            await sendNotification(authorId, 'review_comment', {
                senderId: commenterId,
                senderName: commenterName,
                senderPhoto: commenterPhoto,
                message: "comentó en tu reseña.",
                link: `/list/${listId}?reviewId=${reviewId}`,
                placeName: reviewData.placeName || "un lugar",
                preview: commentData.text ? (commentData.text.substring(0, 50) + "...") : ""
            });
        } else if (isDelete) {
            // 1. Decrement comment count
            await reviewRef.update({ commentCount: admin.firestore.FieldValue.increment(-1) });
        }
    } catch (error) {
        console.error("Error in onReviewComment:", error);
    }
});


module.exports = {
    onFollowUser,
    onReviewReaction,
    onReviewComment,
    sendNotification // Exported for use by reports or other modules
};

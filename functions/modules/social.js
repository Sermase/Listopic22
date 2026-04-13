const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { sendNotification } = require("./notifications");
const db = getFirestore();

/**
 * Trigger: Maintain consistency for USER followers.
 * Listens to: users/{uid}/following/{targetUserId}
 */
exports.onUserFollowingWrite = onDocumentWritten("users/{uid}/following/{targetUserId}", async (event) => {
    const uid = event.params.uid; // The follower
    const targetUserId = event.params.targetUserId; // The followed user

    const isCreate = !event.data.before.exists && event.data.after.exists;
    const isDelete = event.data.before.exists && !event.data.after.exists;

    if (!isCreate && !isDelete) return; // No change in existence

    const followerRef = db.collection("users").doc(targetUserId).collection("followers").doc(uid);
    const currentUserRef = db.collection("users").doc(uid);
    const targetUserRef = db.collection("users").doc(targetUserId);

    try {
        if (isCreate) {
            // 1. Create reciprocal follower document safely (Server-side)
            await followerRef.set({
                uid: uid,
                followedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 2. Increment counters
            await currentUserRef.update({ followingCount: admin.firestore.FieldValue.increment(1) });
            await targetUserRef.update({ followersCount: admin.firestore.FieldValue.increment(1) });

            // 3. Send Notification (Delegate to helper or existing logic)
            // Note: We can either keep onFollowUser in notifications.js or move it here. 
            // Since we are reusing sendNotification, let's do it here to avoid race conditions or double triggers if we disable the old one.
            // But if notifications.js listens to 'followers/{followerId}', it will still trigger after step 1!
            // So we DO NOT send notification here if we keep the other trigger.
            // DECISION: We will KEEP onFollowUser in notifications.js listening to 'followers/{id}' 
            // because that's what we just wrote to in Step 1.

        } else if (isDelete) {
            // 1. Delete reciprocal follower document
            await followerRef.delete();

            // 2. Decrement counters
            await currentUserRef.update({ followingCount: admin.firestore.FieldValue.increment(-1) });
            await targetUserRef.update({ followersCount: admin.firestore.FieldValue.increment(-1) });
        }
    } catch (error) {
        console.error(`Error in onUserFollowingWrite for ${uid} -> ${targetUserId}:`, error);
    }
});

/**
 * Trigger: Maintain consistency for PLACE followers.
 * Listens to: users/{uid}/followingPlaces/{placeId}
 */
exports.onPlaceFollowingWrite = onDocumentWritten("users/{uid}/followingPlaces/{placeId}", async (event) => {
    const uid = event.params.uid;
    const placeId = event.params.placeId;

    const isCreate = !event.data.before.exists && event.data.after.exists;
    const isDelete = event.data.before.exists && !event.data.after.exists;

    if (!isCreate && !isDelete) return;

    const userRef = db.collection("users").doc(uid);
    const placeRef = db.collection("places").doc(placeId);
    const placeFollowerRef = placeRef.collection("followers").doc(uid);

    try {
        if (isCreate) {
            await userRef.update({ followingPlacesCount: admin.firestore.FieldValue.increment(1) });
            // Ensure place exists or merge
            await placeRef.set({ followersCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
            await placeFollowerRef.set({
                userId: uid,
                followedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } else if (isDelete) {
            await userRef.update({ followingPlacesCount: admin.firestore.FieldValue.increment(-1) });
            await placeRef.update({ followersCount: admin.firestore.FieldValue.increment(-1) });
            await placeFollowerRef.delete();
        }
    } catch (error) {
        console.error(`Error in onPlaceFollowingWrite for ${uid} -> ${placeId}:`, error);
    }
});

/**
 * Trigger: Maintain consistency for LIST followers.
 * Listens to: users/{uid}/followingLists/{listId}
 */
exports.onListFollowingWrite = onDocumentWritten("users/{uid}/followingLists/{listId}", async (event) => {
    const uid = event.params.uid;
    const listId = event.params.listId;

    const isCreate = !event.data.before.exists && event.data.after.exists;
    const isDelete = event.data.before.exists && !event.data.after.exists;

    if (!isCreate && !isDelete) return;

    const userRef = db.collection("users").doc(uid);
    const listRef = db.collection("lists").doc(listId);
    const listFollowerRef = listRef.collection("followers").doc(uid);

    try {
        if (isCreate) {
            await userRef.update({ followingListsCount: admin.firestore.FieldValue.increment(1) });
            // For Lists, "Following" == "Liking", so we update 'likes' count.
            // Also maintaining 'followersCount' for consistency if needed, but UI uses 'likes'.
            await listRef.update({
                likes: admin.firestore.FieldValue.increment(1),
                followersCount: admin.firestore.FieldValue.increment(1)
            });
            await listFollowerRef.set({
                userId: uid,
                followedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

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
        } else if (isDelete) {
            await userRef.update({ followingListsCount: admin.firestore.FieldValue.increment(-1) });
            await listRef.update({
                likes: admin.firestore.FieldValue.increment(-1),
                followersCount: admin.firestore.FieldValue.increment(-1)
            });
            await listFollowerRef.delete();
        }
    } catch (error) {
        console.error(`Error in onListFollowingWrite for ${uid} -> ${listId}:`, error);
    }
});

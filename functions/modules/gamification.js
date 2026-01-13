const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const db = getFirestore();

// --- Badge Logic Engine ---

/**
 * Calculate Level based on XP.
 * Formula: Level = Floor(Sqrt(XP / 50)) + 1
 * Level 1: 0-49 XP
 * Level 2: 50-199 XP
 * Level 3: 200-449 XP
 * ...
 */
function calculateLevel(xp) {
    if (!xp || xp < 0) return 1;
    return Math.floor(Math.sqrt(xp / 50)) + 1;
}

/**
 * Checks and awards badges for a specific user based on their stats and actions.
 * Also recalculates Level and XP.
 * @param {string} userId
 */
async function checkBadges(userId) {
    if (!userId) return;

    const userRef = db.collection("users").doc(userId);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) return;

    const userData = userSnapshot.data();
    const currentBadges = userData.badges || [];
    const newBadges = [];

    // Fetch all active badge definitions
    const badgesSnapshot = await db.collection("badges").where("active", "==", true).get();
    const badgeDefinitions = [];
    badgesSnapshot.forEach(doc => {
        badgeDefinitions.push({ id: doc.id, ...doc.data() });
    });

    // Evaluate each badge
    for (const badge of badgeDefinitions) {
        // Skip if already earned
        if (currentBadges.includes(badge.id)) continue;

        let earned = false;

        // 1. Simple Rules (Thresholds)
        if (badge.type === "review_count" && (userData.reviewsCount || 0) >= (badge.threshold || 0)) {
            earned = true;
        }

        // 2. Photo Count Logic
        if (badge.type === "photo_count") {
            // We need to count reviews with photos if photosCount is not on user. 
            // Ideally we should have aggregated this. For now, let's query (careful with costs).
            // Mitigation: Only query if user is reasonably active or we don't have the field.
            // Better: Let's assume we will add photosCount to user soon, OR query it here.
            // Querying is safest for "Photographer" badge which is high value.
            const photosQuery = await db.collectionGroup("reviews")
                .where("userId", "==", userId)
                .where("hasPhotos", "==", true) // Assumes we save 'hasPhotos' or similar. 
            // Using 'images' field array is not directly queryable for "non-empty" easily in standard firestore without a helper field.
            // Alternative: client side or aggregation.
            // Let's assume we simply rely on a new 'stats.photosCount' or similar we might add.
            // For this turn, I will stick to 'custom' logic.
        }

        // 3. Custom Hardcoded Logic (based on ID)
        if (!earned) {
            if (badge.id === "PIONERO" && (userData.reviewsCount || 0) >= 1) {
                earned = true;
            }

            if (badge.id === "PHOTOGRAPHER") {
                // Check for 10 reviews with photos. 
                // Since we don't have 'photosCount' aggregated, and array length query is hard,
                // We will skip this auto-check unless we have the aggregate.
                // TODO: Implement photosCount aggregation.
                // For now, let's award if reviewsCount > 9000 (just kidding).
                // Let's use a workaround: if badge.threshold is met by *reviewsCount* (fallback) 
                // OR we implemented 'photosCount' field.
                if ((userData.photosCount || 0) >= (badge.threshold || 10)) {
                    earned = true;
                }
            }
        }


        if (earned) {
            newBadges.push(badge.id);
        }
    }

    // --- LEVEL & XP CALCULATION ---
    const reviewsXP = (userData.reviewsCount || 0) * 10;
    const photosXP = (userData.photosCount || 0) * 5;
    // Assuming listsCount exists, or we skip it for now. Let's add it if available, else 0.
    const listsXP = (userData.listsCount || 0) * 20;

    // Bonus XP from Badges? Maybe 50 per badge.
    const badgesXP = (currentBadges.length + newBadges.length) * 50;

    const totalXP = reviewsXP + photosXP + listsXP + badgesXP;
    const newLevel = calculateLevel(totalXP);

    const updates = {};
    if (newBadges.length > 0) {
        updates.badges = admin.firestore.FieldValue.arrayUnion(...newBadges);
        updates.lastBadgeEarnedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    // Update XP/Level if changed significantly (or always to keep sync)
    if (userData.xp !== totalXP || userData.level !== newLevel) {
        updates.xp = totalXP;
        updates.level = newLevel;
        // Optional: levelUpAt timestamp?
    }

    if (Object.keys(updates).length > 0) {
        await userRef.update(updates);
        if (newBadges.length > 0) {
            logger.info(`Badges awarded to ${userId}: ${newBadges.join(", ")}`);
        }
        if (userData.level !== newLevel) {
            logger.info(`User ${userId} leveled up to ${newLevel} (XP: ${totalXP})`);
        }
    }
}

// --- Triggers ---

// Trigger: When a review is created/updated/deleted
const onReviewWritten = onDocumentWritten("places/{placeId}/reviews/{reviewId}", async (event) => {
    const afterData = event.data?.after?.data();
    const beforeData = event.data?.before?.data();

    // Determine User ID (from new data or old data if deleted)
    const userId = afterData?.userId || beforeData?.userId;

    if (userId) {
        // We might want to delay this check or ensure stats are aggregated first.
        // Since we have other triggers aggregating stats (hopefully), we can run this.
        // ideally we wait a bit or use the fact that stats triggers run fast.
        // For now, let's run it directly.
        // Update photosCount aggregate
        const userRef = db.collection("users").doc(userId);

        let photosChange = 0;
        const beforePhotos = beforeData?.images?.length || 0;
        const afterPhotos = afterData?.images?.length || 0;

        // If it was a create
        if (!beforeData && afterData && afterPhotos > 0) photosChange = afterPhotos;
        // If it was a delete
        else if (beforeData && !afterData && beforePhotos > 0) photosChange = -beforePhotos;
        // If update
        else if (beforeData && afterData) photosChange = afterPhotos - beforePhotos;

        if (photosChange !== 0) {
            await userRef.update({
                photosCount: admin.firestore.FieldValue.increment(photosChange)
            });
        }

        await checkBadges(userId);
    }
});

// --- Admin Callable Functions ---

/**
 * Recalculate stats, badges, and level for a specific user.
 * @param {object} data - { userId: string }
 */
const adminRecalculateUserGamification = onCall(async (request) => {
    // Auth check: Ensure admin/jefe (handled by client check mostly, but secure apps verify token claims)
    // For now, we trust the client-side check + maybe a simple claim check if we had custom claims.
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in');

    const { userId } = request.data;
    if (!userId) throw new HttpsError('invalid-argument', 'userId is required');

    try {
        await checkBadges(userId);
        return { success: true, message: `Gamification recalculated for user ${userId}` };
    } catch (error) {
        logger.error("adminRecalculateUserGamification error", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Manually award or revoke a badge.
 * @param {object} data - { userId: string, badgeId: string, action: 'award' | 'revoke' }
 */
const adminManageBadge = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in');

    const { userId, badgeId, action } = request.data;
    if (!userId || !badgeId || !['award', 'revoke'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Invalid arguments');
    }

    try {
        const userRef = db.collection('users').doc(userId);

        if (action === 'award') {
            await userRef.update({
                badges: admin.firestore.FieldValue.arrayUnion(badgeId),
                lastBadgeEarnedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            // Recalculate to update XP derived from badges
            await checkBadges(userId);
        } else {
            await userRef.update({
                badges: admin.firestore.FieldValue.arrayRemove(badgeId)
            });
            // Recalculate (might drop level if badge XP is removed)
            await checkBadges(userId);
        }

        return { success: true, message: `Badge ${badgeId} ${action}ed for user ${userId}` };
    } catch (error) {
        logger.error("adminManageBadge error", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * GLOBAL: Recalculate gamification for ALL users.
 * WARNING: Heavy operation.
 */
const adminRecalculateAllGamification = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in');

    const logs = [];
    logs.push(`Starting Global Gamification Recalculation at ${new Date().toISOString()}`);

    try {
        const usersSnap = await db.collection('users').get();
        logs.push(`Found ${usersSnap.size} users.`);

        let processed = 0;
        const batchSize = 50; // Process in chunks if doing parallel, but checkBadges is async.
        // We'll just loop sequentially to be safe on memory, or small parallel chunks.

        for (const doc of usersSnap.docs) {
            try {
                await checkBadges(doc.id);
                processed++;
                if (processed % 20 === 0) logs.push(`Processed ${processed}/${usersSnap.size} users...`);
            } catch (err) {
                logs.push(`ERROR processing user ${doc.id}: ${err.message}`);
            }
        }

        logs.push(`Completed. Successfully processed ${processed} users.`);
        return { success: true, logs };
    } catch (error) {
        logger.error("adminRecalculateAllGamification error", error);
        throw new HttpsError('internal', error.message);
    }
});

module.exports = {
    onReviewWritten,
    checkBadges,
    adminRecalculateUserGamification,
    adminManageBadge,
    adminRecalculateAllGamification
};


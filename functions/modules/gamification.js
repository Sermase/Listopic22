const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { sendNotification } = require("./notifications");

const db = getFirestore();
const DEFAULT_BADGE_XP_REWARD = 50;

function normalizeUserTypes(rawUserType) {
    if (Array.isArray(rawUserType)) {
        return rawUserType
            .filter((entry) => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
    }
    if (typeof rawUserType === "string") {
        const normalized = rawUserType.trim();
        return normalized ? [normalized] : [];
    }
    return [];
}

async function assertJefeAccess(uid, permissionMessage = "No tienes permiso para ejecutar esta operacion.") {
    const userDoc = await db.collection("users").doc(uid).get();
    const userTypes = normalizeUserTypes(userDoc.data()?.userType);
    if (!userDoc.exists || !userTypes.includes("jefe")) {
        throw new HttpsError("permission-denied", permissionMessage);
    }
}

function safeNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeBadgeIds(rawBadges) {
    if (!Array.isArray(rawBadges)) return [];
    return rawBadges
        .map((entry) => {
            if (typeof entry === "string") return entry.trim();
            if (entry && typeof entry === "object" && typeof entry.id === "string") {
                return entry.id.trim();
            }
            return "";
        })
        .filter((badgeId) => badgeId.length > 0);
}

function calculateLevel(xp) {
    if (!xp || xp < 0) return 1;
    return Math.floor(Math.sqrt(xp / 50)) + 1;
}

function getBadgeThreshold(badge) {
    const threshold = safeNumber(badge?.threshold);
    return threshold > 0 ? threshold : 0;
}

function getBadgeXpReward(badge) {
    const xpReward = safeNumber(badge?.xpReward);
    return xpReward > 0 ? xpReward : DEFAULT_BADGE_XP_REWARD;
}

function getListsCount(userData) {
    const explicitListCount = safeNumber(userData?.listCount);
    if (explicitListCount > 0) return explicitListCount;

    const legacyListsCount = safeNumber(userData?.listsCount);
    if (legacyListsCount > 0) return legacyListsCount;

    return safeNumber(userData?.publicListsCount) + safeNumber(userData?.privateListsCount);
}

function countReviewPhotos(reviewData) {
    if (!reviewData || typeof reviewData !== "object") return 0;

    if (Array.isArray(reviewData.photos)) {
        const count = reviewData.photos.filter((photo) => typeof photo === "string" && photo.trim().length > 0).length;
        if (count > 0) return count;
    }

    if (Array.isArray(reviewData.images)) {
        const count = reviewData.images.filter((photo) => typeof photo === "string" && photo.trim().length > 0).length;
        if (count > 0) return count;
    }

    return normalizeString(reviewData.photoUrl) ? 1 : 0;
}

async function countReviewedPlaces(userId) {
    const reviewsSnapshot = await db.collectionGroup("reviews").where("userId", "==", userId).get();
    const uniquePlaceIds = new Set();

    reviewsSnapshot.forEach((docSnap) => {
        const pathSegments = docSnap.ref.path.split("/");
        const isCanonicalListReviewPath =
            pathSegments.length === 4 &&
            pathSegments[0] === "lists" &&
            pathSegments[2] === "reviews";

        if (!isCanonicalListReviewPath) return;

        const reviewData = docSnap.data() || {};
        const placeId = normalizeString(reviewData.placeId);
        if (placeId) {
            uniquePlaceIds.add(placeId);
        }
    });

    return uniquePlaceIds.size;
}

async function buildGamificationMetrics(userId, userData, badgeDefinitions) {
    const needsPlaceCount = badgeDefinitions.some((badge) => badge.type === "place_count");
    const storedReviewedPlacesCount = safeNumber(userData?.reviewedPlacesCount);

    const reviewedPlacesCount = needsPlaceCount || storedReviewedPlacesCount <= 0
        ? await countReviewedPlaces(userId)
        : storedReviewedPlacesCount;

    return {
        reviewsCount: safeNumber(userData?.reviewsCount),
        photosCount: safeNumber(userData?.photosCount),
        listsCount: getListsCount(userData),
        followersCount: safeNumber(userData?.followersCount),
        followingCount: safeNumber(userData?.followingUsersCount) || safeNumber(userData?.followingCount),
        reviewedPlacesCount,
    };
}

function isBadgeEarned(badge, context) {
    const threshold = getBadgeThreshold(badge);
    const { metrics, level } = context;

    switch (badge.type) {
        case "review_count":
            return metrics.reviewsCount >= threshold;
        case "photo_count":
            return metrics.photosCount >= threshold;
        case "place_count":
            return metrics.reviewedPlacesCount >= threshold;
        case "lists_count":
            return metrics.listsCount >= threshold;
        case "followers_count":
            return metrics.followersCount >= threshold;
        case "following_count":
            return metrics.followingCount >= threshold;
        case "level_reached":
            return level >= threshold;
        default:
            break;
    }

    if (badge.id === "PIONERO") {
        return metrics.reviewsCount >= Math.max(1, threshold || 1);
    }

    if (badge.id === "PHOTOGRAPHER") {
        return metrics.photosCount >= Math.max(1, threshold || 10);
    }

    return false;
}

function calculateXp(metrics, earnedBadgeIds, badgeDefinitionsById) {
    const reviewsXP = metrics.reviewsCount * 10;
    const photosXP = metrics.photosCount * 5;
    const listsXP = metrics.listsCount * 20;
    const badgesXP = earnedBadgeIds.reduce((total, badgeId) => {
        return total + getBadgeXpReward(badgeDefinitionsById.get(badgeId));
    }, 0);

    return reviewsXP + photosXP + listsXP + badgesXP;
}

function resolveGamificationState(currentBadges, badgeDefinitions, metrics) {
    const badgeDefinitionsById = new Map(badgeDefinitions.map((badge) => [badge.id, badge]));
    const earnedBadgeIds = new Set(currentBadges);

    let iterations = 0;
    let changed = true;

    while (changed && iterations < 5) {
        iterations += 1;
        changed = false;

        const provisionalXp = calculateXp(metrics, Array.from(earnedBadgeIds), badgeDefinitionsById);
        const provisionalLevel = calculateLevel(provisionalXp);

        for (const badge of badgeDefinitions) {
            if (earnedBadgeIds.has(badge.id)) continue;
            if (isBadgeEarned(badge, { metrics, level: provisionalLevel, xp: provisionalXp })) {
                earnedBadgeIds.add(badge.id);
                changed = true;
            }
        }
    }

    const finalBadgeIds = Array.from(earnedBadgeIds);
    const totalXP = calculateXp(metrics, finalBadgeIds, badgeDefinitionsById);
    const level = calculateLevel(totalXP);
    const newBadges = finalBadgeIds.filter((badgeId) => !currentBadges.includes(badgeId));

    return {
        totalXP,
        level,
        badgeDefinitionsById,
        finalBadgeIds,
        newBadges,
    };
}

async function notifyGamificationChanges(userId, previousLevel, nextLevel, newBadges, badgeDefinitionsById, totalXP) {
    const tasks = [];

    if (nextLevel > previousLevel) {
        tasks.push(
            sendNotification(
                userId,
                "level_up",
                {
                    level: nextLevel,
                    xp: totalXP,
                    message: `Subiste al nivel ${nextLevel}.`,
                    link: `/profile/${userId}`,
                },
                { notificationId: `level_up_${nextLevel}` },
            ),
        );
    }

    newBadges.forEach((badgeId) => {
        const badge = badgeDefinitionsById.get(badgeId);
        const badgeName = normalizeString(badge?.name) || badgeId;
        tasks.push(
            sendNotification(
                userId,
                "badge_earned",
                {
                    badgeId,
                    badgeName,
                    badgeImageUrl: normalizeString(badge?.imageUrl) || null,
                    message: `Has conseguido la medalla ${badgeName}.`,
                    link: `/profile/${userId}`,
                },
                { notificationId: `badge_earned_${badgeId}` },
            ),
        );
    });

    if (tasks.length > 0) {
        await Promise.all(tasks);
    }
}

async function checkBadges(userId) {
    if (!userId) return null;

    const userRef = db.collection("users").doc(userId);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) return null;

    const userData = userSnapshot.data() || {};
    const currentBadges = normalizeBadgeIds(userData.badges);

    const badgesSnapshot = await db.collection("badges").where("active", "==", true).get();
    const badgeDefinitions = badgesSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    const metrics = await buildGamificationMetrics(userId, userData, badgeDefinitions);
    const resolvedState = resolveGamificationState(currentBadges, badgeDefinitions, metrics);

    const previousLevel = safeNumber(userData.level) || calculateLevel(safeNumber(userData.xp));
    const updates = {};

    if (metrics.reviewedPlacesCount !== safeNumber(userData.reviewedPlacesCount)) {
        updates.reviewedPlacesCount = metrics.reviewedPlacesCount;
    }

    if (resolvedState.newBadges.length > 0) {
        updates.badges = admin.firestore.FieldValue.arrayUnion(...resolvedState.newBadges);
        updates.lastBadgeEarnedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    if (safeNumber(userData.xp) !== resolvedState.totalXP || previousLevel !== resolvedState.level) {
        updates.xp = resolvedState.totalXP;
        updates.level = resolvedState.level;
        if (resolvedState.level > previousLevel) {
            updates.lastLevelUpAt = admin.firestore.FieldValue.serverTimestamp();
        }
    }

    const shouldPersist = Object.keys(updates).length > 0;
    if (shouldPersist) {
        await userRef.set(updates, { merge: true });
    }

    if (resolvedState.newBadges.length > 0 || resolvedState.level > previousLevel) {
        await notifyGamificationChanges(
            userId,
            previousLevel,
            resolvedState.level,
            resolvedState.newBadges,
            resolvedState.badgeDefinitionsById,
            resolvedState.totalXP,
        );
    }

    if (resolvedState.newBadges.length > 0) {
        logger.info(`Badges awarded to ${userId}: ${resolvedState.newBadges.join(", ")}`);
    }
    if (resolvedState.level > previousLevel) {
        logger.info(`User ${userId} leveled up to ${resolvedState.level} (XP: ${resolvedState.totalXP})`);
    }

    return {
        xp: resolvedState.totalXP,
        level: resolvedState.level,
        newBadges: resolvedState.newBadges,
        reviewedPlacesCount: metrics.reviewedPlacesCount,
    };
}

const onReviewWritten = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
    const afterData = event.data?.after?.data();
    const beforeData = event.data?.before?.data();
    const userId = normalizeString(afterData?.userId || beforeData?.userId);

    if (!userId) return null;

    const photosChange = countReviewPhotos(afterData) - countReviewPhotos(beforeData);
    if (photosChange !== 0) {
        await db.collection("users").doc(userId).set({
            photosCount: admin.firestore.FieldValue.increment(photosChange),
        }, { merge: true });
    }

    await checkBadges(userId);
    return null;
});

const onListWritten = onDocumentWritten("lists/{listId}", async (event) => {
    const beforeUserId = normalizeString(event.data?.before?.data()?.userId);
    const afterUserId = normalizeString(event.data?.after?.data()?.userId);
    const affectedUserIds = Array.from(new Set([beforeUserId, afterUserId].filter(Boolean)));

    if (affectedUserIds.length === 0) return null;

    await Promise.all(affectedUserIds.map((uid) => checkBadges(uid)));
    return null;
});

const onUserFollowingWritten = onDocumentWritten("users/{uid}/following/{targetUserId}", async (event) => {
    const followerId = normalizeString(event.params.uid);
    const targetUserId = normalizeString(event.params.targetUserId);
    const affectedUserIds = Array.from(new Set([followerId, targetUserId].filter(Boolean)));

    if (affectedUserIds.length === 0) return null;

    await Promise.all(affectedUserIds.map((uid) => checkBadges(uid)));
    return null;
});

const adminRecalculateUserGamification = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in");
    await assertJefeAccess(request.auth.uid);

    const { userId } = request.data;
    if (!userId) throw new HttpsError("invalid-argument", "userId is required");

    try {
        await checkBadges(userId);
        return { success: true, message: `Gamification recalculated for user ${userId}` };
    } catch (error) {
        logger.error("adminRecalculateUserGamification error", error);
        throw new HttpsError("internal", error.message);
    }
});

const adminManageBadge = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in");
    await assertJefeAccess(request.auth.uid);

    const { userId, badgeId, action } = request.data;
    if (!userId || !badgeId || !["award", "revoke"].includes(action)) {
        throw new HttpsError("invalid-argument", "Invalid arguments");
    }

    try {
        const userRef = db.collection("users").doc(userId);

        if (action === "award") {
            await userRef.set({
                badges: admin.firestore.FieldValue.arrayUnion(badgeId),
                lastBadgeEarnedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            await checkBadges(userId);
        } else {
            await userRef.update({
                badges: admin.firestore.FieldValue.arrayRemove(badgeId),
            });
            await checkBadges(userId);
        }

        return { success: true, message: `Badge ${badgeId} ${action}ed for user ${userId}` };
    } catch (error) {
        logger.error("adminManageBadge error", error);
        throw new HttpsError("internal", error.message);
    }
});

const adminRecalculateAllGamification = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in");
    await assertJefeAccess(request.auth.uid);

    const logs = [];
    logs.push(`Starting Global Gamification Recalculation at ${new Date().toISOString()}`);

    try {
        const usersSnap = await db.collection("users").get();
        logs.push(`Found ${usersSnap.size} users.`);

        let processed = 0;

        for (const docSnap of usersSnap.docs) {
            try {
                await checkBadges(docSnap.id);
                processed += 1;
                if (processed % 20 === 0) logs.push(`Processed ${processed}/${usersSnap.size} users...`);
            } catch (err) {
                logs.push(`ERROR processing user ${docSnap.id}: ${err.message}`);
            }
        }

        logs.push(`Completed. Successfully processed ${processed} users.`);
        return { success: true, logs };
    } catch (error) {
        logger.error("adminRecalculateAllGamification error", error);
        throw new HttpsError("internal", error.message);
    }
});

const adminResetUserGamification = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in");
    await assertJefeAccess(request.auth.uid);

    const { userId } = request.data;
    if (!userId) throw new HttpsError("invalid-argument", "userId is required");

    try {
        await db.collection("users").doc(userId).update({
            xp: 0,
            level: 1,
            badges: [],
            lastBadgeEarnedAt: null,
            lastLevelUpAt: null,
        });
        return { success: true, message: `Gamification reset for user ${userId}` };
    } catch (error) {
        logger.error("adminResetUserGamification error", error);
        throw new HttpsError("internal", error.message);
    }
});

const adminResetAllGamification = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in");
    await assertJefeAccess(request.auth.uid);

    const logs = [];
    logs.push(`Starting Global Gamification RESET at ${new Date().toISOString()}`);

    try {
        const usersSnap = await db.collection("users").get();
        logs.push(`Found ${usersSnap.size} users.`);

        let processed = 0;
        let batch = db.batch();
        let batchCount = 0;

        for (const docSnap of usersSnap.docs) {
            const userRef = db.collection("users").doc(docSnap.id);
            batch.update(userRef, {
                xp: 0,
                level: 1,
                badges: [],
                lastBadgeEarnedAt: null,
                lastLevelUpAt: null,
            });
            batchCount += 1;
            processed += 1;

            if (batchCount >= 400) {
                await batch.commit();
                logs.push(`Reset batch of ${batchCount} users...`);
                batchCount = 0;
                batch = db.batch();
            }
        }

        if (batchCount > 0) {
            await batch.commit();
            logs.push(`Reset final batch of ${batchCount} users.`);
        }

        logs.push(`Completed. Reset ${processed} users.`);
        return { success: true, logs };
    } catch (error) {
        logger.error("adminResetAllGamification error", error);
        throw new HttpsError("internal", error.message);
    }
});

module.exports = {
    onReviewWritten,
    onListWritten,
    onUserFollowingWritten,
    checkBadges,
    adminRecalculateUserGamification,
    adminManageBadge,
    adminRecalculateAllGamification,
    adminResetUserGamification,
    adminResetAllGamification,
};

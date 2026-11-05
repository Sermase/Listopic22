const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("./https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { sendNotification } = require("./notifications");
const { userReviewDocs } = require("./lib/user-reviews");
const { writeAuditLog } = require("./lib/auth");
const { tallyUserStats, counterUpdates, changedCounters, SHADOW_COUNTERS } = require("./lib/user-stats");
const { syncCheckableBadges } = require("./surprises");

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
    // Sin el índice reviews.userId (grupo de colecciones) recorre todo; ver lib/user-reviews.
    const reviewsSnapshot = await userReviewDocs(db, "userId", userId);
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

async function buildGamificationMetrics(userId, userData, badgeDefinitions, knownPlacesCount) {
    const needsPlaceCount = badgeDefinitions.some((badge) => badge.type === "place_count");
    const storedReviewedPlacesCount = safeNumber(userData?.reviewedPlacesCount);

    let reviewedPlacesCount = storedReviewedPlacesCount;
    if (typeof knownPlacesCount === "number") reviewedPlacesCount = knownPlacesCount;
    else if (needsPlaceCount || storedReviewedPlacesCount <= 0) reviewedPlacesCount = await countReviewedPlaces(userId);

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
    // Una medalla apagada (o sin ficha) se queda guardada pero oculta: no suma XP.
    const badgesXP = earnedBadgeIds.reduce((total, badgeId) => {
        const badge = badgeDefinitionsById.get(badgeId);
        return total + (badge ? getBadgeXpReward(badge) : 0);
    }, 0);

    return reviewsXP + photosXP + listsXP + badgesXP;
}

// Medallas que se ganan con un contador: se repasan siempre y se quitan si ya no se
// cumplen (se borró la valoración o se subió el umbral en Developer).
const COUNTED_TYPES = new Set(["review_count", "photo_count", "place_count", "lists_count", "followers_count", "following_count", "level_reached"]);
// Copias de una versión antigua (Pionero, Crítico de Barrio, Una Más y Me Voy, Foto o Prueba).
const RETIRED_BADGES = new Set(["CRITIC_BRONZE", "CRITIC_SILVER", "CRITIC_GOLD", "PHOTOGRAPHER"]);

// knownBadgeIds: todas las fichas de `badges` (también las apagadas). Una medalla cuya ficha
// ya no existe no se puede ver ni ganar: se quita.
function keptBadges(currentBadges, badgeDefinitionsById, metrics, knownBadgeIds) {
    const typeOf = (id) => badgeDefinitionsById.get(id)?.type;
    const counted = (id) => COUNTED_TYPES.has(typeOf(id));
    const exists = (id) => !knownBadgeIds || knownBadgeIds.size === 0 || knownBadgeIds.has(id);
    const kept = currentBadges.filter((id) => !RETIRED_BADGES.has(id) && exists(id)
        && (!counted(id) || typeOf(id) === "level_reached" || isBadgeEarned(badgeDefinitionsById.get(id), { metrics, level: 0 })));
    const level = calculateLevel(calculateXp(metrics, kept.filter((id) => typeOf(id) !== "level_reached"), badgeDefinitionsById));
    return kept.filter((id) => typeOf(id) !== "level_reached" || isBadgeEarned(badgeDefinitionsById.get(id), { metrics, level }));
}

function resolveGamificationState(currentBadges, badgeDefinitions, metrics, knownBadgeIds) {
    const badgeDefinitionsById = new Map(badgeDefinitions.map((badge) => [badge.id, badge]));
    const earnedBadgeIds = new Set(keptBadges(currentBadges, badgeDefinitionsById, metrics, knownBadgeIds));

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
    const lostBadges = currentBadges.filter((badgeId) => !earnedBadgeIds.has(badgeId));

    return {
        totalXP,
        level,
        badgeDefinitionsById,
        finalBadgeIds,
        newBadges,
        lostBadges,
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

/** Fichas de medallas: las activas (las que se ganan) y los ids de todas (también apagadas). */
async function loadBadgeDefinitions() {
    const snapshot = await db.collection("badges").get();
    const all = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    return { active: all.filter((badge) => badge.active === true), knownIds: new Set(all.map((badge) => badge.id)) };
}

/**
 * Qué quitar y qué poner en users.badges. arrayRemove solo quita valores idénticos: las
 * entradas antiguas en forma de objeto ({ id, ... }) o con espacios no se iban con
 * arrayRemove("ID") y la medalla se quedaba para siempre. Se quitan tal cual están
 * guardadas y, si la medalla sigue, se vuelve a poner como texto limpio.
 */
function badgeWritePlan(rawBadges, lostBadges, newBadges) {
    const raw = Array.isArray(rawBadges) ? rawBadges : [];
    const lost = new Set(lostBadges);
    const cleanCount = new Map();
    raw.forEach((entry) => {
        if (typeof entry === "string" && entry && entry === entry.trim()) cleanCount.set(entry, (cleanCount.get(entry) || 0) + 1);
    });
    const remove = [];
    const removedText = new Set();
    const readd = new Set();
    const removeEntry = (entry) => {
        if (typeof entry === "string") {
            if (removedText.has(entry)) return;
            removedText.add(entry);
        }
        remove.push(entry);
    };
    raw.forEach((entry) => {
        const [id] = normalizeBadgeIds([entry]);
        if (!id || lost.has(id)) {
            removeEntry(entry);
            return;
        }
        const clean = typeof entry === "string" && entry === id;
        if (!clean || cleanCount.get(id) > 1) {
            removeEntry(entry);
            readd.add(id);
        }
    });
    const add = Array.from(new Set([...newBadges, ...readd]));
    return { remove, add };
}

async function checkBadges(userId, options = {}) {
    if (!userId) return null;

    const userRef = db.collection("users").doc(userId);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) return null;

    const userData = userSnapshot.data() || {};
    const currentBadges = normalizeBadgeIds(userData.badges);

    const definitions = options.definitions || await loadBadgeDefinitions();
    const badgeDefinitions = definitions.active;
    const metrics = await buildGamificationMetrics(userId, userData, badgeDefinitions, options.reviewedPlacesCount);
    const resolvedState = resolveGamificationState(currentBadges, badgeDefinitions, metrics, definitions.knownIds);
    const plan = badgeWritePlan(userData.badges, resolvedState.lostBadges, resolvedState.newBadges);

    const previousLevel = safeNumber(userData.level) || calculateLevel(safeNumber(userData.xp));
    const updates = {};

    if (metrics.reviewedPlacesCount !== safeNumber(userData.reviewedPlacesCount)) {
        updates.reviewedPlacesCount = metrics.reviewedPlacesCount;
    }

    if (plan.add.length > 0) {
        updates.badges = FieldValue.arrayUnion(...plan.add);
    }
    if (resolvedState.newBadges.length > 0) {
        updates.lastBadgeEarnedAt = FieldValue.serverTimestamp();
        // Cuándo se ganó cada una (la ficha de la medalla lo enseña); set con merge mezcla el mapa.
        updates.badgeDates = Object.fromEntries(resolvedState.newBadges.map((id) => [id, FieldValue.serverTimestamp()]));
    }

    if (safeNumber(userData.xp) !== resolvedState.totalXP || previousLevel !== resolvedState.level) {
        updates.xp = resolvedState.totalXP;
        updates.level = resolvedState.level;
        if (resolvedState.level > previousLevel) {
            updates.lastLevelUpAt = FieldValue.serverTimestamp();
        }
    }

    // Quitar y añadir van en dos escrituras (no caben en el mismo campo a la vez) y nunca
    // se reescribe la lista entera: así no se pisa una medalla dada a la vez desde otra función.
    const batch = db.batch();
    let writes = 0;
    if (plan.remove.length > 0) {
        batch.update(userRef, {
            badges: FieldValue.arrayRemove(...plan.remove),
            ...Object.fromEntries(resolvedState.lostBadges.map((id) => [`badgeDates.${id}`, FieldValue.delete()])),
        });
        writes += 1;
    }
    if (Object.keys(updates).length > 0) {
        batch.set(userRef, updates, { merge: true });
        writes += 1;
    }
    if (writes > 0) await batch.commit();

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
        previousLevel,
        newBadges: resolvedState.newBadges,
        lostBadges: resolvedState.lostBadges,
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
            photosCount: FieldValue.increment(photosChange),
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
                badges: FieldValue.arrayUnion(badgeId),
                lastBadgeEarnedAt: FieldValue.serverTimestamp(),
                badgeDates: { [badgeId]: FieldValue.serverTimestamp() },
            }, { merge: true });
            await checkBadges(userId);
        } else {
            await userRef.update({
                badges: FieldValue.arrayRemove(badgeId),
                [`badgeDates.${badgeId}`]: FieldValue.delete(),
            });
            await checkBadges(userId);
        }

        return { success: true, message: `Badge ${badgeId} ${action}ed for user ${userId}` };
    } catch (error) {
        logger.error("adminManageBadge error", error);
        throw new HttpsError("internal", error.message);
    }
});

const RECOUNT_PAGE = 500;

/** Todas las valoraciones (solo los campos que cuentan), por páginas. */
async function scanReviewsForStats() {
    const entries = [];
    let lastDoc = null;
    for (;;) {
        let query = db.collectionGroup("reviews").select("userId", "authorId", "placeId", "photos", "images", "photoUrl").limit(RECOUNT_PAGE);
        if (lastDoc) query = query.startAfter(lastDoc);
        const snap = await query.get();
        if (snap.empty) break;
        snap.docs.forEach((docSnap) => entries.push({ path: docSnap.ref.path, data: docSnap.data() }));
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < RECOUNT_PAGE) break;
    }
    return entries;
}

async function countDocs(collectionRef) {
    const snap = await collectionRef.count().get();
    return safeNumber(snap.data().count);
}

const personName = (data, uid) => normalizeString(data?.username) || normalizeString(data?.displayName) || uid;

/**
 * «Recalcular TODO» (Developer): cuenta de nuevo, desde las valoraciones, listas y
 * seguidores de verdad, lo que miran las medallas; repasa las secretas y de temas que se
 * pueden comprobar; y deja a cada persona solo con las que cumple hoy. Antes se fiaba de
 * los contadores guardados y, si estaban inflados, nadie perdía nada.
 */
const adminRecalculateAllGamification = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in");
    await assertJefeAccess(request.auth.uid);

    const logs = [];
    logs.push(`Recalculando medallas (${new Date().toISOString()})`);

    try {
        // 1) Secretas y de temas comprobables (lo mismo que el repaso de madrugada).
        const secret = await syncCheckableBadges();
        logs.push(`Secretas y de temas: ${secret.given} dadas, ${secret.taken} quitadas.`);

        // 2) Contadores desde cero.
        const [reviews, listsSnap, usersSnap, definitions] = await Promise.all([
            scanReviewsForStats(),
            db.collection("lists").select("userId", "isPublic").get(),
            db.collection("users").get(),
            loadBadgeDefinitions(),
        ]);
        const stats = tallyUserStats(reviews, listsSnap.docs.map((docSnap) => ({ data: docSnap.data() })));
        logs.push(`${usersSnap.size} personas, ${reviews.length} valoraciones y ${listsSnap.size} listas.`);

        // 3) Cada persona: contadores corregidos y medallas que cumple.
        let processed = 0;
        let fixedCounters = 0;
        let removed = 0;
        let added = 0;
        for (const docSnap of usersSnap.docs) {
            const uid = docSnap.id;
            const data = docSnap.data() || {};
            try {
                const [followersCount, followingCount] = await Promise.all([
                    countDocs(docSnap.ref.collection("followers")),
                    countDocs(docSnap.ref.collection("following")),
                ]);
                const updates = counterUpdates(stats.get(uid), followersCount, followingCount);
                const changes = changedCounters(data, updates);
                if (changes.length > 0) {
                    await docSnap.ref.set({
                        ...updates,
                        ...Object.fromEntries(SHADOW_COUNTERS.map((key) => [key, FieldValue.delete()])),
                        lastStatsRecalc: FieldValue.serverTimestamp(),
                    }, { merge: true });
                    fixedCounters += 1;
                }

                const result = await checkBadges(uid, { definitions, reviewedPlacesCount: updates.reviewedPlacesCount });
                processed += 1;
                if (!result) continue;
                removed += result.lostBadges.length;
                added += result.newBadges.length;
                if (result.lostBadges.length > 0 || result.newBadges.length > 0) {
                    const parts = [];
                    if (result.lostBadges.length > 0) parts.push(`quitadas ${result.lostBadges.length} (${result.lostBadges.join(", ")})`);
                    if (result.newBadges.length > 0) parts.push(`nuevas ${result.newBadges.length} (${result.newBadges.join(", ")})`);
                    if (result.level !== result.previousLevel) parts.push(`nivel ${result.previousLevel} → ${result.level}`);
                    const counts = changes
                        .filter((change) => ["reviewsCount", "photosCount", "publicListsCount", "privateListsCount", "followersCount", "followingCount", "listCount"].includes(change.key))
                        .map((change) => `${change.key} ${change.before ?? "—"} → ${change.after ?? "—"}`);
                    if (counts.length > 0) parts.push(`recuento: ${counts.join(", ")}`);
                    logs.push(`${personName(data, uid)}: ${parts.join("; ")}`);
                }
            } catch (err) {
                logs.push(`ERROR con ${personName(data, uid)}: ${err.message}`);
            }
        }

        const summary = { processed, fixedCounters, removed, added, secretGiven: secret.given, secretTaken: secret.taken };
        await writeAuditLog(request.auth.uid, "adminRecalculateAllGamification", summary);
        logs.push(`Hecho: ${processed} personas, ${fixedCounters} con contadores corregidos, ${removed} medallas quitadas y ${added} dadas.`);
        return { success: true, logs, ...summary };
    } catch (error) {
        logger.error("adminRecalculateAllGamification error", error);
        throw new HttpsError("internal", error.message);
    }
});

// eslint-disable-next-line no-unused-vars -- archivada: fuera de exports, no se despliega
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

// eslint-disable-next-line no-unused-vars -- archivada: fuera de exports, no se despliega
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
    resolveGamificationState,
    badgeWritePlan,
    adminRecalculateUserGamification,
    adminManageBadge,
    adminRecalculateAllGamification,
    // adminResetUserGamification: archivada (no se despliega) — borra XP e insignias y ninguna pantalla la usa.
    // adminResetAllGamification: archivada (no se despliega) — borra XP e insignias y ninguna pantalla la usa.
};

'use strict';

const { getFirestore, FieldPath } = require('firebase-admin/firestore');

const { compareElementsByRank, reviewScoreForList } = require('./lib/scoring');
const { elementKey, isBotUserType, normalizeItemName, placeClosedStatus, placeGeoFields } = require('./lib/list-elements');
const { filterPublicReviews } = require('./lib/list-visibility');

// Perezoso: aggregateGroups se prueba sin inicializar Firebase.
const db = {
    collection: (...args) => getFirestore().collection(...args),
    getAll: (...refs) => getFirestore().getAll(...refs)
};

function normalizeForObjectId(value) {
    if (!value) {
        return 'na';
    }
    return value
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'na';
}

function isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

async function fetchPlacesByIds(ids) {
    const map = new Map();
    if (!ids || ids.length === 0) {
        return map;
    }
    for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10);
        const snapshot = await db
            .collection('places')
            .where(FieldPath.documentId(), 'in', chunk)
            .get();
        snapshot.forEach(doc => {
            map.set(doc.id, doc.data());
        });
    }
    return map;
}

/** Autores bot según su perfil público (lo mismo que mira la web). */
async function fetchBotAuthorIds(reviews) {
    const authorIds = Array.from(new Set(reviews.map(r => r.userId || r.authorId).filter(Boolean)));
    const bots = new Set();
    for (let i = 0; i < authorIds.length; i += 100) {
        const refs = authorIds.slice(i, i + 100).map(uid => db.collection('publicProfiles').doc(uid));
        const snaps = await db.getAll(...refs);
        snaps.forEach(snap => {
            if (snap.exists && isBotUserType(snap.data().userType)) {
                bots.add(snap.id);
            }
        });
    }
    return bots;
}

async function fetchRootReviewsByField(field, value) {
    if (!value) {
        return [];
    }
    const snapshot = await db.collection('reviews').where(field, '==', value).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function fetchReviewsForList(listId, listData, listRef) {
    const isSublist = !!listData?.parentListId;
    const reviewMap = new Map();

    const addReviews = (reviews, fallbackListId) => {
        if (!Array.isArray(reviews) || reviews.length === 0) {
            return;
        }
        reviews.forEach((review) => {
            if (!review || !review.id) {
                return;
            }
            const resolvedListId = typeof review.listId === 'string' && review.listId.trim()
                ? review.listId.trim()
                : fallbackListId;
            reviewMap.set(review.id, {
                ...review,
                listId: resolvedListId || review.listId || null
            });
        });
    };

    if (isSublist) {
        const [rootBySublistId, rootByListId] = await Promise.all([
            fetchRootReviewsByField('sublistId', listId),
            fetchRootReviewsByField('listId', listId)
        ]);
        addReviews(rootBySublistId, listData?.parentListId || listId);
        addReviews(rootByListId, listData?.parentListId || listId);

        if (listData?.parentListId) {
            const parentNestedSnapshot = await db
                .collection('lists')
                .doc(listData.parentListId)
                .collection('reviews')
                .where('sublistId', '==', listId)
                .get();
            addReviews(parentNestedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), listData.parentListId);
        }

        const ownNestedSnapshot = await listRef.collection('reviews').get();
        addReviews(ownNestedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), listId);
    } else {
        const [rootByListId, rootByParentListId, nestedSnapshot] = await Promise.all([
            fetchRootReviewsByField('listId', listId),
            fetchRootReviewsByField('parentListId', listId),
            listRef.collection('reviews').get()
        ]);

        addReviews(rootByListId, listId);
        addReviews(rootByParentListId, listId);
        addReviews(nestedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), listId);
    }

    return Array.from(reviewMap.values());
}

function extractGeoloc(placeData) {
    if (!placeData) {
        return null;
    }
    const location = placeData.location || placeData.coordinates;
    if (location && isNumber(location.latitude) && isNumber(location.longitude)) {
        return { lat: location.latitude, lng: location.longitude };
    }
    return null;
}

function aggregateGroupTags(collectedTags, itemCount) {
    if (!Array.isArray(collectedTags) || collectedTags.length === 0) {
        return [];
    }
    const counts = {};
    collectedTags.forEach(tag => {
        if (typeof tag === 'string' && tag.trim()) {
            const key = tag.trim();
            counts[key] = (counts[key] || 0) + 1;
        }
    });
    const minimum = Math.max(1, Math.ceil(itemCount / 2));
    return Object.entries(counts)
        .filter(([, count]) => count >= minimum)
        .map(([tag]) => tag)
        .sort();
}

function normalizeUserTypes(userType) {
    if (Array.isArray(userType)) {
        return userType.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim());
    }
    if (typeof userType === 'string' && userType.trim()) {
        return [userType.trim()];
    }
    return [];
}

function uniqueTags(values) {
    return Array.from(new Set(
        (Array.isArray(values) ? values : [])
            .filter(tag => typeof tag === 'string' && tag.trim())
            .map(tag => tag.trim())
    )).sort();
}

/**
 * Agrupa y puntúa las valoraciones de una Lista (sin acceso a Firestore), con
 * las mismas reglas que la página de la Lista (lib/listElements.ts):
 * - clave: sitio + nombre normalizado (lib/list-elements.js);
 * - las valoraciones de bots no cuentan en nota, nº ni puesto; un elemento
 *   solo de bots queda marcado `botOnly` (Buscar lo oculta por defecto, como
 *   la Lista mientras no se pide ver los bots) y puntúa con las suyas;
 * - una valoración sin nota no cuenta;
 * - orden total: compareElementsByRank (posición con 4 decimales, nº de
 *   valoraciones y clave). `listRank` es el puesto en toda la Lista.
 * Las valoraciones llegan ya filtradas por visibilidad (Algolia: solo públicas).
 * @returns {Array<object>} grupos ordenados por puesto.
 */
function aggregateGroups(listId, listData, reviews, placeMap, botAuthorIds = new Set()) {
    const groups = new Map();

    for (const review of reviews) {
        const { score } = reviewScoreForList(review, listData);
        if (score === null) {
            continue;
        }
        const placeInfo = review.placeId ? placeMap.get(review.placeId) : null;
        const establishmentName = (placeInfo && typeof placeInfo.name === 'string' && placeInfo.name.trim())
            ? placeInfo.name.trim()
            : (typeof review.establishmentName === 'string' && review.establishmentName.trim()
                ? review.establishmentName.trim()
                : 'Lugar desconocido');
        const itemName = typeof review.itemName === 'string' ? review.itemName.trim() : '';
        const key = elementKey(review.placeId || null, itemName);
        const author = review.userId || review.authorId || null;
        const isBot = Boolean(author && botAuthorIds.has(author));

        let group = groups.get(key);
        if (!group) {
            const geo = placeGeoFields(placeInfo);
            const closedStatus = placeClosedStatus(placeInfo);
            group = {
                listId,
                key,
                establishmentName,
                itemName,
                placeId: review.placeId || null,
                counted: { human: [], bot: [] },
                authorUserTypes: new Set(),
                reviewIds: [],
                thumbnailUrl: null,
                placeThumbnailUrl: placeInfo ? (placeInfo.userPhotoUrl || placeInfo.mainImageUrl || null) : null,
                googleMapsUrl: placeInfo && placeInfo.googleMapsUrl ? placeInfo.googleMapsUrl : null,
                // Misma zona que la Lista (la ciudad cae a la «locality» de Google).
                placeCity: geo.city || null,
                placeProvince: geo.province || null,
                placeRegion: geo.region || null,
                placeCountry: geo.country || null,
                placeAddress: placeInfo && (placeInfo.address || placeInfo.formatted_address) ? (placeInfo.address || placeInfo.formatted_address) : null,
                placeClosedStatus: typeof closedStatus === 'string' ? closedStatus : null,
                placeGoogleBusinessStatus: placeInfo && typeof placeInfo.googleBusinessStatus === 'string' ? placeInfo.googleBusinessStatus : null,
                placeBusinessStatus: placeInfo && typeof placeInfo.businessStatus === 'string' ? placeInfo.businessStatus : null,
                placeAccessibilityOptions: placeInfo ? (placeInfo.accessibilityOptions || placeInfo.accessibility || null) : null,
                placePetOptions: placeInfo ? (placeInfo.businessPetOptions || placeInfo.petOptions || placeInfo.pets || null) : null,
                geoloc: extractGeoloc(placeInfo),
                thumbnailMaxLikes: -1 // Track max likes for thumbnail selection
            };
            groups.set(key, group);
        }

        group.counted[isBot ? 'bot' : 'human'].push({ review, score });

        // Thumbnail Logic: Pick image with most likes
        if (review.photoUrl) {
            const currentRecLikes = (review.reactionCounts && review.reactionCounts.like) || review.likes || 0;
            if (!group.thumbnailUrl || currentRecLikes > group.thumbnailMaxLikes) {
                group.thumbnailUrl = review.photoUrl;
                group.thumbnailMaxLikes = currentRecLikes;
            }
        }
        // Faceta «Tipo de usuario»: todas las valoraciones públicas (el filtro «Bots» de Buscar).
        normalizeUserTypes(review.authorUserType).forEach(type => group.authorUserTypes.add(type));
        if (isBot) {
            group.authorUserTypes.add('bot');
        }
        group.reviewIds.push(review.id);
    }

    const elements = Array.from(groups.values()).map(group => {
        const botOnly = group.counted.human.length === 0;
        const counted = botOnly ? group.counted.bot : group.counted.human;
        const itemCount = counted.length;
        const average = counted.reduce((sum, entry) => sum + entry.score, 0) / itemCount;

        const criteriaTotals = {};
        const criteriaCounts = {};
        const allTags = [];
        counted.forEach(({ review }) => {
            if (review.scores && typeof review.scores === 'object') {
                Object.entries(review.scores).forEach(([criterion, value]) => {
                    if (typeof value === 'number' && Number.isFinite(value)) {
                        criteriaTotals[criterion] = (criteriaTotals[criterion] || 0) + value;
                        criteriaCounts[criterion] = (criteriaCounts[criterion] || 0) + 1;
                    }
                });
            }
            if (Array.isArray(review.userTags)) {
                allTags.push(...review.userTags.filter(tag => typeof tag === 'string'));
            }
            if (Array.isArray(review.tags)) {
                allTags.push(...review.tags.filter(tag => typeof tag === 'string'));
            }
        });
        const avgScores = {};
        Object.entries(criteriaTotals).forEach(([criterion, total]) => {
            avgScores[criterion] = Number((total / criteriaCounts[criterion]).toFixed(1));
        });

        const { counted: _counted, authorUserTypes, thumbnailMaxLikes: _likes, key, ...rest } = group;
        return {
            ...rest,
            key,
            botOnly,
            itemCount,
            // Sin redondear: con esta se ordena (rankingScore). La que se ve, a 1 decimal.
            average: Number(average.toFixed(4)),
            avgGeneralScore: Number(average.toFixed(1)),
            avgScores,
            groupTags: aggregateGroupTags(allTags, itemCount),
            authorUserType: Array.from(authorUserTypes).sort(),
            thumbnailUrl: group.thumbnailUrl || group.placeThumbnailUrl || null,
            itemTags: uniqueTags(allTags),
            objectSlug: `${normalizeForObjectId(group.placeId || group.establishmentName)}__${normalizeForObjectId(normalizeItemName(group.itemName) || 'general')}`
        };
    });

    // Primero los elementos con valoraciones de personas (los que ve la Lista), luego los de solo bots.
    const byRank = (a, b) => compareElementsByRank(
        { id: a.key, average: a.average, count: a.itemCount },
        { id: b.key, average: b.average, count: b.itemCount }
    );
    const ranked = [
        ...elements.filter((e) => !e.botOnly).sort(byRank),
        ...elements.filter((e) => e.botOnly).sort(byRank),
    ];
    ranked.forEach((element, index) => { element.listRank = index + 1; });
    return ranked;
}

/**
 * @param {string} listId
 * @param {{ publicOnly?: boolean }} [options] publicOnly: para Algolia (índice público).
 */
async function buildGroupedItemsForList(listId, { publicOnly = false } = {}) {
    if (!listId) {
        throw new Error('listId is required');
    }

    const listRef = db.collection('lists').doc(listId);
    const listSnap = await listRef.get();
    const listData = listSnap.exists ? { id: listSnap.id, ...listSnap.data() } : null;
    const fetched = await fetchReviewsForList(listId, listData, listRef);
    const reviews = publicOnly ? filterPublicReviews(fetched) : fetched;

    if (reviews.length === 0) {
        return {
            listId,
            listData,
            groupedReviews: [],
            reviews
        };
    }

    const placeIds = Array.from(new Set(reviews.map(r => r.placeId).filter(Boolean)));
    const [placeMap, botAuthorIds] = await Promise.all([
        fetchPlacesByIds(placeIds),
        fetchBotAuthorIds(reviews)
    ]);
    const groupedReviews = aggregateGroups(listId, listData, reviews, placeMap, botAuthorIds);

    return {
        listId,
        listData,
        groupedReviews,
        reviews
    };
}

module.exports = {
    buildGroupedItemsForList,
    aggregateGroups
};

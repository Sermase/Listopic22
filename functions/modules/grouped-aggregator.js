'use strict';

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

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
            .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
            .get();
        snapshot.forEach(doc => {
            map.set(doc.id, doc.data());
        });
    }
    return map;
}

async function fetchRootReviewsByField(field, value) {
    if (!value) {
        return null;
    }
    return db.collection('reviews').where(field, '==', value).get();
}

async function fetchReviewsForList(listId, listData, listRef) {
    const isSublist = !!listData?.parentListId;

    if (isSublist) {
        const bySublistId = await fetchRootReviewsByField('sublistId', listId);
        if (bySublistId && !bySublistId.empty) {
            return bySublistId;
        }

        // Fallback for docs that may have been persisted with listId = sublistId.
        const byListId = await fetchRootReviewsByField('listId', listId);
        if (byListId && !byListId.empty) {
            return byListId;
        }
    } else {
        const byListId = await fetchRootReviewsByField('listId', listId);
        if (byListId && !byListId.empty) {
            return byListId;
        }

        // Fallback for docs that only have parentListId.
        const byParentListId = await fetchRootReviewsByField('parentListId', listId);
        if (byParentListId && !byParentListId.empty) {
            return byParentListId;
        }
    }

    // Legacy fallback: old reviews path under the list subcollection.
    return listRef.collection('reviews').get();
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

function buildGroupKey(establishmentName, itemName) {
    return `${establishmentName || 'na'}|${itemName || ''}`.toLowerCase();
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

async function buildGroupedItemsForList(listId) {
    if (!listId) {
        throw new Error('listId is required');
    }

    const listRef = db.collection('lists').doc(listId);
    const listSnap = await listRef.get();
    const listData = listSnap.exists ? { id: listSnap.id, ...listSnap.data() } : null;
    const reviewsSnap = await fetchReviewsForList(listId, listData, listRef);
    const reviews = [];
    reviewsSnap.forEach(doc => {
        reviews.push({ id: doc.id, ...doc.data() });
    });

    if (reviews.length === 0) {
        return {
            listId,
            listData,
            groupedReviews: [],
            reviews
        };
    }

    const placeIds = Array.from(new Set(reviews.map(r => r.placeId).filter(Boolean)));
    const placeMap = await fetchPlacesByIds(placeIds);

    const groups = new Map();

    for (const review of reviews) {
        const placeInfo = review.placeId ? placeMap.get(review.placeId) : null;
        const establishmentName = (placeInfo && typeof placeInfo.name === 'string' && placeInfo.name.trim())
            ? placeInfo.name.trim()
            : (typeof review.establishmentName === 'string' && review.establishmentName.trim()
                ? review.establishmentName.trim()
                : 'Lugar desconocido');
        const itemName = typeof review.itemName === 'string' ? review.itemName.trim() : '';
        const key = buildGroupKey(establishmentName, itemName);

        let group = groups.get(key);
        if (!group) {
            const geoloc = extractGeoloc(placeInfo);
            group = {
                listId,
                groupKey: key,
                establishmentName,
                itemName,
                placeId: review.placeId || null,
                itemCount: 0,
                totalGeneralScore: 0,
                allTags: [],
                criteriaTotals: {},
                criteriaCounts: {},
                reviewIds: [],
                thumbnailUrl: null,
                placeThumbnailUrl: placeInfo && placeInfo.mainImageUrl ? placeInfo.mainImageUrl : null,
                googleMapsUrl: placeInfo && placeInfo.googleMapsUrl ? placeInfo.googleMapsUrl : null,
                placeCity: placeInfo && typeof placeInfo.city === 'string' ? placeInfo.city : null,
                placeProvince: placeInfo && typeof placeInfo.province === 'string' ? placeInfo.province : (placeInfo && typeof placeInfo.region === 'string' ? placeInfo.region : null),
                placeCountry: placeInfo && typeof placeInfo.country === 'string' ? placeInfo.country : null,
                placeAddress: placeInfo && (placeInfo.address || placeInfo.formatted_address) ? (placeInfo.address || placeInfo.formatted_address) : null,
                geoloc,
                thumbnailMaxLikes: -1 // Track max likes for thumbnail selection
            };
            groups.set(key, group);
        }

        group.itemCount += 1;
        if (typeof review.overallRating === 'number') {
            group.totalGeneralScore += review.overallRating;
        }

        // Thumbnail Logic: Pick image with most likes
        if (review.photoUrl) {
            const currentRecLikes = (review.reactionCounts && review.reactionCounts.like) || review.likes || 0;
            if (!group.thumbnailUrl || currentRecLikes > group.thumbnailMaxLikes) {
                group.thumbnailUrl = review.photoUrl;
                group.thumbnailMaxLikes = currentRecLikes;
            }
        }
        if (Array.isArray(review.userTags)) {
            group.allTags.push(...review.userTags.filter(tag => typeof tag === 'string'));
        }
        if (review.scores && typeof review.scores === 'object') {
            Object.entries(review.scores).forEach(([criterion, score]) => {
                if (typeof score === 'number') {
                    group.criteriaTotals[criterion] = (group.criteriaTotals[criterion] || 0) + score;
                    group.criteriaCounts[criterion] = (group.criteriaCounts[criterion] || 0) + 1;
                }
            });
        }
        group.reviewIds.push(review.id);
    }

    const groupedReviews = Array.from(groups.values()).map(group => {
        const avgGeneralScore = group.itemCount > 0
            ? Number((group.totalGeneralScore / group.itemCount).toFixed(1))
            : 0;

        const avgScores = {};
        Object.entries(group.criteriaTotals).forEach(([criterion, total]) => {
            const count = group.criteriaCounts[criterion] || 0;
            if (count > 0) {
                avgScores[criterion] = Number((total / count).toFixed(1));
            }
        });

        const groupTags = aggregateGroupTags(group.allTags, group.itemCount);
        const objectSlug = `${normalizeForObjectId(group.establishmentName)}__${normalizeForObjectId(group.itemName || 'general')}`;

        return {
            listId: group.listId,
            establishmentName: group.establishmentName,
            itemName: group.itemName,
            placeId: group.placeId,
            itemCount: group.itemCount,
            avgGeneralScore,
            avgScores,
            groupTags,
            thumbnailUrl: group.thumbnailUrl || group.placeThumbnailUrl || null,
            googleMapsUrl: group.googleMapsUrl,
            placeCity: group.placeCity,
            placeProvince: group.placeProvince,
            placeCountry: group.placeCountry,
            placeAddress: group.placeAddress,
            geoloc: group.geoloc,
            reviewIds: group.reviewIds,
            objectSlug
        };
    });

    groupedReviews.sort((a, b) => (b.avgGeneralScore || 0) - (a.avgGeneralScore || 0));

    return {
        listId,
        listData,
        groupedReviews,
        reviews
    };
}

module.exports = {
    buildGroupedItemsForList
};

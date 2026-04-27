'use strict';

const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted, onDocumentWritten } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const algoliasearch = require("algoliasearch");
const { buildGroupedItemsForList } = require("./grouped-aggregator");

const ADMIN_CALL_OPTIONS = { cors: true, timeoutSeconds: 540, memory: "1GiB" };

let algoliaClient = null;
const indices = {};
const ensuredSettings = new Set();
const categoryCache = new Map();

function getIndex(indexName) {
    if (!algoliaClient) {
        const appId = process.env.ALGOLIA_APP_ID;
        const apiKey = process.env.ALGOLIA_API_KEY;
        if (!appId || !apiKey) {
            logger.warn("Algolia: environment variables not configured. Module inactive.");
            return null;
        }
        try {
            algoliaClient = algoliasearch(appId, apiKey);
            logger.info("Algolia client initialised on first use.");
        } catch (error) {
            logger.error("Algolia: unable to initialise client.", error);
            algoliaClient = null;
            return null;
        }
    }

    if (!indices[indexName]) {
        indices[indexName] = algoliaClient.initIndex(indexName);
    }
    return indices[indexName];
}

const COLLECTION_CONFIGS = {
    lists: {
        collection: "lists",
        indexName: "lists",
        transform: transformListRecord,
        resolveObjectId: (docId) => docId
    },
    places: {
        collection: "places",
        indexName: "places",
        transform: transformPlaceRecord,
        resolveObjectId: (docId) => docId
    },
    users: {
        collection: "users",
        indexName: "users",
        transform: transformUserRecord,
        resolveObjectId: (docId) => docId
    }
};

const INDEX_SETTINGS = {
    lists: {
        searchableAttributes: ["unordered(name)", "unordered(description)", "unordered(availableTags)", "unordered(categoryName)", "unordered(categoryAliases)", "unordered(categoryId)"],
        attributesForFaceting: ["filterOnly(categoryId)", "categoryName", "availableTags", "ownerId"],
        replicas: ["lists_by_followers", "lists_by_reviews"],
        customRanking: ["desc(reviewCount)", "desc(followersCount)", "desc(updatedAtTimestamp)"],
        numericAttributesForFiltering: ["reviewCount", "followersCount"]
    },
    places: {
        searchableAttributes: ["unordered(name)", "unordered(address)", "unordered(city)", "unordered(types)"],
        attributesForFaceting: ["filterOnly(city)", "filterOnly(province)", "serviceOptions", "accessibilityOptions", "types", "priceLevel"],
        replicas: ["places_by_rating", "places_by_reviews", "places_by_distance"],
        customRanking: ["desc(averageRating)", "desc(reviewsCount)"],
        numericAttributesForFiltering: ["averageRating", "reviewsCount"]
    },
    users: {
        searchableAttributes: ["unordered(username)", "unordered(bio)"],
        attributesForFaceting: ["userType", "residence", "badges"],
        replicas: ["users_by_followers", "users_by_reviews"],
        customRanking: ["desc(followersCount)", "desc(reviewsCount)"],
        numericAttributesForFiltering: ["followersCount", "reviewsCount"]
    },
    grouped_items: {
        searchableAttributes: ["unordered(itemName)", "unordered(establishmentName)", "unordered(listName)", "unordered(groupTags)"],
        attributesForFaceting: ["filterOnly(listId)", "listName", "listCategoryId", "filterOnly(listAvailableTags)", "groupTags", "placeCity", "placeProvince", "authorUserType"],
        replicas: ["grouped_items_by_score", "grouped_items_by_reviews"],
        customRanking: ["desc(avgGeneralScore)", "desc(reviewCount)"],
        numericAttributesForFiltering: ["avgGeneralScore", "reviewCount"]
    }
};

const REPLICA_SETTINGS = {
    lists_by_followers: { customRanking: ["desc(followersCount)", "desc(reviewCount)", "desc(updatedAtTimestamp)"] },
    lists_by_reviews: { customRanking: ["desc(reviewCount)", "desc(followersCount)", "desc(updatedAtTimestamp)"] },
    places_by_rating: { customRanking: ["desc(averageRating)", "desc(reviewsCount)"] },
    places_by_reviews: { customRanking: ["desc(reviewsCount)", "desc(averageRating)"] },
    places_by_distance: { customRanking: ["desc(reviewsCount)", "desc(averageRating)"] },
    users_by_followers: { customRanking: ["desc(followersCount)", "desc(reviewsCount)"] },
    users_by_reviews: { customRanking: ["desc(reviewsCount)", "desc(followersCount)"] },
    grouped_items_by_score: { customRanking: ["desc(avgGeneralScore)", "desc(reviewCount)"] },
    grouped_items_by_reviews: { customRanking: ["desc(reviewCount)", "desc(avgGeneralScore)"] }
};

async function getIndexWithSettings(indexName) {
    const index = getIndex(indexName);
    if (!index) {
        return null;
    }
    await ensureIndexSettings(indexName, index);
    return index;
}

async function ensureIndexSettings(indexName, index) {
    if (ensuredSettings.has(indexName)) {
        return;
    }
    const settings = INDEX_SETTINGS[indexName];
    if (!settings) {
        ensuredSettings.add(indexName);
        return;
    }
    try {
        await index.setSettings(settings);
        if (Array.isArray(settings.replicas)) {
            await Promise.all(settings.replicas.map(async (replicaName) => {
                const replicaIndex = getIndex(replicaName);
                const replicaSettings = REPLICA_SETTINGS[replicaName];
                if (replicaIndex && replicaSettings) {
                    await replicaIndex.setSettings(replicaSettings);
                }
            }));
        }
        ensuredSettings.add(indexName);
    } catch (error) {
        logger.error(`Algolia: failed to apply settings for ${indexName}`, error);
        throw new HttpsError("internal", `No se pudieron aplicar los settings de Algolia para ${indexName}: ${error.message || String(error)}`);
    }
}

function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function trueObjectKeys(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [];
    }
    return Object.entries(value)
        .filter(([, enabled]) => enabled === true)
        .map(([key]) => key);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(values) {
    return Array.from(new Set(values.filter(isNonEmptyString).map((value) => value.trim())));
}

function normalizeImageUrl(value) {
    if (!isNonEmptyString(value)) {
        return null;
    }
    const url = value.trim();
    if (url.startsWith("data:")) {
        return null;
    }
    if (!/^https?:\/\//i.test(url)) {
        return null;
    }
    return url.length <= 2048 ? url : null;
}

function firstImageUrl(...values) {
    for (const value of values) {
        const url = normalizeImageUrl(value);
        if (url) {
            return url;
        }
    }
    return null;
}

async function resolveCategoryMetadata(categoryId, listData = {}) {
    const inlineNames = uniqueStrings([
        listData.categoryName,
        listData.categoryLabel,
        listData.categoryTitle,
        typeof listData.category === "string" && listData.category !== categoryId ? listData.category : null
    ]);

    if (!isNonEmptyString(categoryId)) {
        return {
            categoryName: inlineNames[0] || null,
            categoryAliases: inlineNames
        };
    }

    const cleanCategoryId = categoryId.trim();
    if (!categoryCache.has(cleanCategoryId)) {
        categoryCache.set(cleanCategoryId, admin.firestore().collection("categories").doc(cleanCategoryId).get()
            .then((snap) => {
                if (!snap.exists) {
                    return { categoryName: null, categoryAliases: [cleanCategoryId] };
                }
                const data = snap.data() || {};
                const names = uniqueStrings([
                    data.name,
                    data.label,
                    data.title,
                    data.description
                ]);
                return {
                    categoryName: names[0] || cleanCategoryId,
                    categoryAliases: uniqueStrings([cleanCategoryId, ...names])
                };
            })
            .catch((error) => {
                logger.warn(`Algolia: unable to resolve category ${cleanCategoryId}`, error);
                return { categoryName: cleanCategoryId, categoryAliases: [cleanCategoryId] };
            }));
    }

    const metadata = await categoryCache.get(cleanCategoryId);
    const aliases = uniqueStrings([cleanCategoryId, ...(metadata.categoryAliases || []), ...inlineNames]);
    return {
        categoryName: inlineNames[0] || metadata.categoryName || cleanCategoryId,
        categoryAliases: aliases
    };
}

function toDate(value) {
    if (!value) {
        return null;
    }
    if (typeof value.toDate === "function") {
        try {
            return value.toDate();
        } catch (_error) {
            return null;
        }
    }
    if (value instanceof Date) {
        return value;
    }
    return null;
}

function toIsoString(value) {
    const date = toDate(value);
    return date ? date.toISOString() : null;
}

function toUnixSeconds(value) {
    const date = toDate(value);
    return date ? Math.floor(date.getTime() / 1000) : null;
}

function compactRecord(record) {
    const result = {};
    for (const [key, value] of Object.entries(record)) {
        if (value === undefined || value === null) {
            continue;
        }
        if (Array.isArray(value)) {
            result[key] = value.filter((item) => item !== undefined && item !== null && item !== "");
            continue;
        }
        result[key] = value;
    }
    return result;
}

function extractTrueKeys(obj) {
    if (!obj || typeof obj !== "object") {
        return [];
    }
    return Object.entries(obj)
        .filter(([, value]) => value === true || value === "true")
        .map(([key]) => key);
}

function extractGeolocFromData(data) {
    if (!data || typeof data !== "object") {
        return null;
    }
    const source = data.location || data.coordinates || data.geopoint || null;
    if (!source) {
        return null;
    }
    const lat = source.lat ?? source.latitude;
    const lng = source.lng ?? source.longitude;
    if (isNumber(lat) && isNumber(lng)) {
        return { lat: Number(lat), lng: Number(lng) };
    }
    return null;
}

function buildFilterEquality(field, value) {
    const text = String(value);
    const needsQuotes = /[^A-Za-z0-9_-]/.test(text);
    const escaped = text.replace(/"/g, '\\"');
    return needsQuotes ? `${field}:"${escaped}"` : `${field}:${escaped}`;
}

function normalizeTagArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(isNonEmptyString)
        .map((tag) => tag.trim())
        .sort();
}

function areArraysEqual(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    for (let i = 0; i < left.length; i += 1) {
        if (left[i] !== right[i]) {
            return false;
        }
    }
    return true;
}

function normalizeListPublic(value) {
    return value === false ? false : true;
}

function normalizeString(value) {
    return isNonEmptyString(value) ? value.trim() : "";
}

function resolveGroupedListOwnerName(data) {
    const ownerName = [
        data?.authorName,
        data?.ownerName,
        data?.ownerDisplayName,
        data?.userDisplayName
    ].find((value) => isNonEmptyString(value));
    return ownerName ? ownerName.trim() : "";
}

function hasGroupedListMetadataChanged(beforeData, afterData) {
    if (!beforeData || !afterData) {
        return true;
    }
    if (normalizeString(beforeData.name) !== normalizeString(afterData.name)) {
        return true;
    }
    if ((beforeData.categoryId || null) !== (afterData.categoryId || null)) {
        return true;
    }
    if ((beforeData.userId || null) !== (afterData.userId || null)) {
        return true;
    }
    if (normalizeListPublic(beforeData.isPublic) !== normalizeListPublic(afterData.isPublic)) {
        return true;
    }
    const beforeTags = normalizeTagArray(beforeData.availableTags);
    const afterTags = normalizeTagArray(afterData.availableTags);
    if (!areArraysEqual(beforeTags, afterTags)) {
        return true;
    }
    if (resolveGroupedListOwnerName(beforeData) !== resolveGroupedListOwnerName(afterData)) {
        return true;
    }
    return false;
}

function transformPlaceRecord(data, docId) {
    if (!data) return null;
    const coverImage = firstImageUrl(data.thumbnailUrl, data.mainImageUrl, data.photoUrl, data.coverUrl, data.imageUrl);
    const record = {
        objectID: docId,
        entityType: "place",
        name: data.name || "",
        address: data.address || data.formatted_address || "",
        city: data.city || "",
        province: data.province || "",
        country: data.country || "",
        types: Array.isArray(data.types) ? data.types : [],
        serviceOptions: trueObjectKeys(data.serviceOptions),
        accessibilityOptions: trueObjectKeys(data.accessibilityOptions || data.accessibility),
        averageRating: typeof data.averageRating === "number" ? data.averageRating : 0,
        reviewsCount: typeof data.reviewsCount === "number" ? data.reviewsCount : 0,
        priceLevel: typeof data.priceLevel === "number" ? data.priceLevel : null,
        mainImageUrl: coverImage,
        thumbnailUrl: coverImage,
        _geoloc: data.location && isNumber(data.location.latitude) && isNumber(data.location.longitude)
            ? { lat: data.location.latitude, lng: data.location.longitude }
            : undefined
    };
    return compactRecord(record);
}

async function transformListRecord(data, docId) {
    if (!data || data.isPublic === false) {
        return null;
    }
    const tags = Array.isArray(data.availableTags) ? data.availableTags.filter(isNonEmptyString) : [];
    const category = await resolveCategoryMetadata(data.categoryId || null, data);
    const ownerName = [
        data.authorName,
        data.ownerName,
        data.ownerDisplayName,
        data.userDisplayName,
        data.createdByName
    ].find((value) => isNonEmptyString(value)) || null;
    const ownerUsername = [data.ownerUsername, data.userHandle, data.username].find((value) => isNonEmptyString(value)) || null;
    const coverImage = firstImageUrl(data.mainImageUrl, data.photoUrl, data.coverUrl, data.thumbnailUrl, data.imageUrl);
    const record = {
        objectID: docId,
        entityType: "list",
        name: data.name || "",
        description: data.description || "",
        summary: data.summary || "",
        categoryId: data.categoryId || null,
        categoryName: category.categoryName,
        categoryAliases: category.categoryAliases,
        availableTags: tags,
        reviewCount: typeof data.reviewCount === "number" ? data.reviewCount : 0,
        followersCount: typeof data.followersCount === "number" ? data.followersCount : 0,
        authorName: ownerName,
        authorUsername: ownerUsername,
        thumbnailUrl: coverImage,
        mainImageUrl: coverImage,
    }
    if (!record.country) {
        delete record.country;
    }
    return compactRecord(record);
}

function transformUserRecord(data, docId) {
    if (!data) {
        return null;
    }
    const userTypeArray = Array.isArray(data.userType)
        ? data.userType.filter(isNonEmptyString)
        : (isNonEmptyString(data.userType) ? [data.userType.trim()] : []);
    const badges = Array.isArray(data.badges) ? data.badges.filter(isNonEmptyString) : [];
    const displayName = data.displayName || data.name || data.username || "";
    const record = {
        objectID: docId,
        entityType: "user",
        username: data.username || "",
        displayName,
        bio: data.bio || "",
        userType: userTypeArray,
        residence: data.residence || null,
        badges,
        followersCount: typeof data.followersCount === "number" ? data.followersCount : 0,
        followingCount: typeof data.followingCount === "number" ? data.followingCount : 0,
        reviewsCount: typeof data.reviewsCount === "number" ? data.reviewsCount : 0,
        commentsCount: typeof data.commentsCount === "number" ? data.commentsCount : 0,
        createdAtISO: toIsoString(data.createdAt),
        updatedAtISO: toIsoString(data.updatedAt),
        photoUrl: normalizeImageUrl(data.photoUrl)
    };
    return compactRecord(record);
}

function mapGroupToAlgoliaRecord(listId, listData, group) {
    const slug = group.objectSlug || `${group.establishmentName || 'item'}__${group.itemName || 'general'}`;
    const objectID = `${listId}__${slug}`;
    const listTags = Array.isArray(listData?.availableTags) ? listData.availableTags.filter(isNonEmptyString) : [];
    const listOwnerName = resolveGroupedListOwnerName(listData) || null;
    const record = {
        objectID,
        entityType: "item",
        listId,
        listName: listData?.name || "",
        listCategoryId: listData?.categoryId || null,
        listAvailableTags: listTags,
        listOwnerId: listData?.userId || null,
        listOwnerName: listOwnerName || undefined,
        establishmentName: group.establishmentName,
        itemName: group.itemName,
        placeId: group.placeId || null,
        placeName: group.establishmentName,
        placeCity: group.placeCity || null,
        placeProvince: group.placeProvince || null,
        placeCountry: group.placeCountry || null,
        placeAddress: group.placeAddress || null,
        avgGeneralScore: typeof group.avgGeneralScore === "number" ? group.avgGeneralScore : 0,
        avgScores: group.avgScores || {},
        reviewCount: typeof group.itemCount === "number" ? group.itemCount : 0,
        itemCount: typeof group.itemCount === "number" ? group.itemCount : 0,
        averageRating: typeof group.avgGeneralScore === "number" ? group.avgGeneralScore : 0,
        groupTags: Array.isArray(group.groupTags) ? group.groupTags : [],
        authorUserType: Array.isArray(group.authorUserType) ? group.authorUserType : [],
        thumbnailUrl: firstImageUrl(group.thumbnailUrl, group.placeThumbnailUrl, group.mainImageUrl, group.photoUrl),
        googleMapsUrl: group.googleMapsUrl || null,
        _geoloc: group.geoloc && isNumber(group.geoloc.lat) && isNumber(group.geoloc.lng) ? { lat: group.geoloc.lat, lng: group.geoloc.lng } : undefined,
        updatedAtISO: new Date().toISOString()
    };
    if (!record.listCategoryId) {
        delete record.listCategoryId;
    }
    if (!record._geoloc) {
        delete record._geoloc;
    }
    return compactRecord(record);
}

function createCollectionHandlers(collectionKey) {
    const config = COLLECTION_CONFIGS[collectionKey];
    const path = `${config.collection}/{docId}`;
    return {
        onCreated: onDocumentCreated(path, async (event) => {
            await syncCreate(config, event.data);
        }),
        onUpdated: onDocumentUpdated(path, async (event) => {
            await syncUpdate(config, event.data.before, event.data.after);
        }),
        onDeleted: onDocumentDeleted(path, async (event) => {
            await syncDelete(config, event.data);
        })
    };
}

async function clearGroupedItemsForList(listId, indexOverride) {
    if (!listId) {
        return null;
    }
    const index = indexOverride || await getIndexWithSettings("grouped_items");
    if (!index) {
        return null;
    }
    try {
        const filter = buildFilterEquality("listId", listId);
        const deleteTask = await index.deleteBy({ filters: filter });
        if (deleteTask?.taskID) {
            await index.waitTask(deleteTask.taskID);
        }
    } catch (error) {
        logger.error(`Algolia: failed clearing grouped items for list ${listId}`, error);
    }
    return null;
}

async function rebuildGroupedItemsForList(listId) {
    if (!listId) {
        return null;
    }
    const index = await getIndexWithSettings("grouped_items");
    if (!index) {
        return null;
    }
    try {
        const { listData, groupedReviews } = await buildGroupedItemsForList(listId);
        await clearGroupedItemsForList(listId, index);
        if (!listData || listData.isPublic === false) {
            return null;
        }
        const records = (groupedReviews || []).map((group) => mapGroupToAlgoliaRecord(listId, listData, group));
        if (records.length === 0) {
            return null;
        }
        const response = await index.saveObjects(records);
        if (response?.taskID) {
            await index.waitTask(response.taskID);
        }
    } catch (error) {
        logger.error(`Algolia: failed syncing grouped items for list ${listId}`, error);
    }
    return null;
}

async function syncCreate(config, snapshot) {
    if (!snapshot) {
        return null;
    }
    const index = await getIndexWithSettings(config.indexName);
    if (!index) {
        return null;
    }
    const data = snapshot.data();
    const record = await config.transform(data, snapshot.id);
    if (!record) {
        return null;
    }
    try {
        const response = await index.saveObject(record);
        if (response?.taskID) {
            await index.waitTask(response.taskID);
        }
    } catch (error) {
        logger.error(`Algolia: failed saving ${config.indexName}/${snapshot.id}`, error);
    }
    return null;
}

async function syncUpdate(config, beforeSnap, afterSnap) {
    if (!afterSnap) {
        return null;
    }
    const index = await getIndexWithSettings(config.indexName);
    if (!index) {
        return null;
    }
    const data = afterSnap.data();
    const record = await config.transform(data, afterSnap.id);
    if (record) {
        try {
            const response = await index.saveObject(record);
            if (response?.taskID) {
                await index.waitTask(response.taskID);
            }
        } catch (error) {
            logger.error(`Algolia: failed updating ${config.indexName}/${afterSnap.id}`, error);
        }
    } else {
        await deleteRecord(index, config, afterSnap.id, data);
    }
    return null;
}

async function syncDelete(config, snapshot) {
    if (!snapshot) {
        return null;
    }
    const index = await getIndexWithSettings(config.indexName);
    if (!index) {
        return null;
    }
    await deleteRecord(index, config, snapshot.id, snapshot.data());
    return null;
}

async function deleteRecord(index, config, docId, data) {
    const objectId = config.resolveObjectId ? config.resolveObjectId(docId, data) : (data && data.objectID) || docId;
    if (!objectId) {
        return;
    }
    try {
        const response = await index.deleteObject(objectId);
        if (response?.taskID) {
            await index.waitTask(response.taskID);
        }
    } catch (error) {
        logger.error(`Algolia: failed deleting ${config.indexName}/${objectId}`, error);
    }
}

function collectReviewListIds(data, fallbackListId) {
    const result = new Set();
    const candidates = [
        data?.listId,
        data?.parentListId,
        data?.sublistId,
        fallbackListId
    ];

    for (const value of candidates) {
        if (isNonEmptyString(value)) {
            result.add(value.trim());
        }
    }

    return Array.from(result);
}

function collectChangedReviewListIds(beforeData, afterData, fallbackListId) {
    const result = new Set();
    const beforeListIds = collectReviewListIds(beforeData, fallbackListId);
    const afterListIds = collectReviewListIds(afterData, fallbackListId);

    for (const listId of beforeListIds) {
        result.add(listId);
    }
    for (const listId of afterListIds) {
        result.add(listId);
    }

    return Array.from(result);
}

async function rebuildGroupedItemsForListIds(listIds) {
    if (!Array.isArray(listIds) || listIds.length === 0) {
        return null;
    }
    for (const listId of listIds) {
        await rebuildGroupedItemsForList(listId);
    }
    return null;
}

const { onCreated: onListCreated, onUpdated: onListUpdated, onDeleted: onListDeleted } = createCollectionHandlers("lists");
const { onCreated: onPlaceCreated, onUpdated: onPlaceUpdated, onDeleted: onPlaceDeleted } = createCollectionHandlers("places");
const { onCreated: onUserCreated, onUpdated: onUserUpdated, onDeleted: onUserDeleted } = createCollectionHandlers("users");

const syncGroupedItemsIndex = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    const listIds = collectChangedReviewListIds(beforeData, afterData, event.params.listId);
    return await rebuildGroupedItemsForListIds(listIds);
});

const syncGroupedItemsRootReviews = onDocumentWritten("reviews/{reviewId}", async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    const listIds = collectChangedReviewListIds(beforeData, afterData);
    return await rebuildGroupedItemsForListIds(listIds);
});

const syncGroupedItemsOnListUpdate = onDocumentUpdated("lists/{listId}", async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    if (!hasGroupedListMetadataChanged(beforeData, afterData)) {
        return null;
    }
    const listId = event.params.listId;
    if (afterData && afterData.isPublic === false) {
        return await clearGroupedItemsForList(listId);
    }
    return await rebuildGroupedItemsForList(listId);
});

const syncGroupedItemsOnListDelete = onDocumentDeleted("lists/{listId}", async (event) => {
    const listId = event.params.listId;
    return await clearGroupedItemsForList(listId);
});

async function backfillStandardCollection(collectionKey) {
    const config = COLLECTION_CONFIGS[collectionKey];
    const index = await getIndexWithSettings(config.indexName);
    if (!index) {
        throw new HttpsError("internal", "Algolia no esta configurado.");
    }
    const snapshot = await admin.firestore().collection(config.collection).get();
    const records = [];
    for (const doc of snapshot.docs) {
        const record = await config.transform(doc.data(), doc.id);
        if (record) {
            records.push(record);
        }
    }
    const response = await index.replaceAllObjects(records, { safe: true });
    if (response?.taskID) {
        await index.waitTask(response.taskID);
    }
    return { success: true, message: `Sincronizados ${records.length} registros de ${collectionKey}.` };
}

async function backfillGroupedItems() {
    const index = await getIndexWithSettings("grouped_items");
    if (!index) {
        throw new HttpsError("internal", "Algolia no esta configurado.");
    }
    const listSnapshot = await admin.firestore().collection("lists").get();
    const records = [];
    for (const doc of listSnapshot.docs) {
        const data = doc.data();
        if (data.isPublic === false) {
            continue;
        }
        try {
            const aggregation = await buildGroupedItemsForList(doc.id);
            if (!aggregation.listData || aggregation.listData.isPublic === false) {
                continue;
            }
            for (const group of aggregation.groupedReviews || []) {
                records.push(mapGroupToAlgoliaRecord(doc.id, aggregation.listData, group));
            }
        } catch (error) {
            logger.error(`Algolia: error aggregating grouped items for list ${doc.id}`, error);
        }
    }
    if (records.length === 0) {
        const task = await index.clearObjects();
        if (task?.taskID) {
            await index.waitTask(task.taskID);
        }
        return { success: true, message: "Indice de grouped_items limpiado (sin registros publicos)." };
    }
    const response = await index.replaceAllObjects(records, { safe: true });
    if (response?.taskID) {
        await index.waitTask(response.taskID);
    }
    return { success: true, message: `Sincronizados ${records.length} elementos agrupados.` };
}

async function configureAllIndexSettings() {
    const configured = [];
    for (const indexName of Object.keys(INDEX_SETTINGS)) {
        const index = getIndex(indexName);
        if (!index) {
            throw new HttpsError("internal", "Algolia no esta configurado.");
        }
        ensuredSettings.delete(indexName);
        await ensureIndexSettings(indexName, index);
        configured.push({
            indexName,
            replicas: INDEX_SETTINGS[indexName].replicas || []
        });
    }
    return {
        success: true,
        message: "Settings y replicas de Algolia configurados.",
        configured
    };
}

const adminBackfillAlgolia = onCall(ADMIN_CALL_OPTIONS, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Debes estar autenticado para ejecutar esta operacion.");
    }
    try {
        const uid = request.auth.uid;
        const userDoc = await admin.firestore().collection("users").doc(uid).get();
        if (!userDoc.exists) {
            throw new HttpsError("permission-denied", "No se encontro tu perfil de usuario.");
        }
        const userData = userDoc.data();
        const userTypes = Array.isArray(userData.userType) ? userData.userType : [userData.userType];
        if (!userTypes.some((type) => type === "jefe")) {
            throw new HttpsError("permission-denied", "Solo los usuarios de tipo jefe pueden ejecutar esta operacion.");
        }
        const collectionName = request.data?.collectionName;
        if (!collectionName) {
            throw new HttpsError("invalid-argument", "Debes indicar collectionName.");
        }
        if (collectionName === "__settings") {
            return await configureAllIndexSettings();
        }
        if (collectionName === "grouped_items") {
            return await backfillGroupedItems();
        }
        if (!COLLECTION_CONFIGS[collectionName]) {
            throw new HttpsError("invalid-argument", `La coleccion ${collectionName} no esta permitida.`);
        }
        return await backfillStandardCollection(collectionName);
    } catch (error) {
        if (error instanceof HttpsError) {
            throw error;
        }
        logger.error("adminBackfillAlgolia: unexpected failure", error);
        throw new HttpsError("internal", `Error sincronizando Algolia: ${error.message || String(error)}`);
    }
});

module.exports = {
    onListCreated,
    onListUpdated,
    onListDeleted,
    onPlaceCreated,
    onPlaceUpdated,
    onPlaceDeleted,
    onUserCreated,
    onUserUpdated,
    onUserDeleted,
    syncGroupedItemsIndex,
    syncGroupedItemsRootReviews,
    syncGroupedItemsOnListUpdate,
    syncGroupedItemsOnListDelete,
    adminBackfillAlgolia
};





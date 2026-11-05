'use strict';

// Páginas de ranking para Google: «Patatas bravas en Valladolid», etc.
// Mismo orden que la Lista en la app (buildGroupedItemsForList), solo con
// valoraciones públicas de personas, recortado a una ciudad.
//
//   /mejores                      índice de todos los rankings publicados
//   /mejores/{lista}/{ciudad}     top 10 de esa lista en esa ciudad
//
// Solo se publica una combinación con MIN_PLACES sitios o más: una página
// con uno o dos sitios no le sirve a nadie y Google la trata como pobre.

const { getFirestore } = require('firebase-admin/firestore');
const { buildGroupedItemsForList } = require('../grouped-aggregator');

const MIN_PLACES = 3;
const TOP = 10;
const CACHE_MS = 30 * 60 * 1000;

const slugify = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const isPublicList = (list) => list.visibility !== 'private' && (list.isPublic === true || list.visibility === 'public');

let cache = null;

/** Todas las combinaciones lista × ciudad publicables, con su top. */
async function loadRankings() {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.rankings;
    const db = getFirestore();
    const [a, b] = await Promise.all([
        db.collection('lists').where('visibility', '==', 'public').get(),
        db.collection('lists').where('isPublic', '==', true).get(),
    ]);
    const lists = new Map();
    [...a.docs, ...b.docs].forEach((doc) => {
        const data = doc.data() || {};
        if (isPublicList(data) && data.name) lists.set(doc.id, data);
    });

    // Dos listas con el mismo nombre: gana la de más valoraciones.
    const bySlug = new Map();
    lists.forEach((data, id) => {
        const slug = slugify(data.name);
        const current = bySlug.get(slug);
        if (!slug) return;
        if (!current || (Number(data.reviewCount) || 0) > (Number(current.data.reviewCount) || 0)) bySlug.set(slug, { id, data });
    });

    const rankings = [];
    for (const [listSlug, { id, data }] of bySlug) {
        const { groupedReviews } = await buildGroupedItemsForList(id, { publicOnly: true });
        const byCity = new Map();
        groupedReviews
            .filter((group) => !group.botOnly && group.placeCity && group.placeId && !/permanent/i.test(group.placeClosedStatus || ''))
            .forEach((group) => {
                const citySlug = slugify(group.placeCity);
                if (!citySlug) return;
                const entry = byCity.get(citySlug) || { city: group.placeCity, items: [] };
                entry.items.push(group);
                byCity.set(citySlug, entry);
            });
        byCity.forEach(({ city, items }, citySlug) => {
            const places = new Set(items.map((item) => item.placeId));
            if (places.size < MIN_PLACES) return;
            const reviewCount = items.reduce((sum, item) => sum + (Number(item.itemCount) || 0), 0);
            rankings.push({
                path: `/mejores/${listSlug}/${citySlug}`,
                listId: id,
                listName: String(data.name).trim(),
                listSlug,
                city,
                citySlug,
                placeCount: places.size,
                reviewCount,
                // Ya vienen en el orden de la Lista.
                top: items.slice(0, TOP).map((item) => ({
                    placeId: item.placeId,
                    placeName: item.establishmentName,
                    itemName: item.itemName || '',
                    score: item.avgGeneralScore,
                    count: item.itemCount,
                    imageUrl: [item.thumbnailUrl, item.placeThumbnailUrl].find((url) => typeof url === 'string' && url.startsWith('http')) || '',
                })),
            });
        });
    }
    rankings.sort((x, y) => (y.reviewCount - x.reviewCount) || x.path.localeCompare(y.path));
    cache = { at: Date.now(), rankings };
    return rankings;
}

module.exports = { loadRankings, slugify, MIN_PLACES };

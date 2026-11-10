'use strict';

// Resumen de puestos de una Lista pública (listRankings/{listId}).
// La ficha del sitio y la del plato leen este documento en vez de bajar la
// Lista entera. Mismo resultado que rankListElements en la web
// (frontend/src/lib/listElements.ts): sin bots, sin sitios cerrados ni platos
// retirados, misma fórmula (el orden viene de aggregateGroups).

/** Tope de elementos por documento (Firestore admite 1 MB; cada uno ocupa ~150 bytes). */
const RANKING_MAX_ELEMENTS = 5000;

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/**
 * @param {Array<object>} groupedReviews grupos de aggregateGroups, ya ordenados por puesto.
 * @returns {{ elements: Array<object>, total: number, truncated: boolean }}
 */
function buildListRanking(groupedReviews) {
  const ranked = (Array.isArray(groupedReviews) ? groupedReviews : [])
    .filter((g) => g && !g.botOnly && !g.itemUnavailable && !g.placeClosedStatus);
  const elements = ranked.slice(0, RANKING_MAX_ELEMENTS).map((g) => {
    const element = {
      id: g.key,
      placeId: text(g.placeId),
      itemName: g.itemName || g.establishmentName || '',
      average: g.average,
      count: g.itemCount,
      city: text(g.placeCity),
      province: text(g.placeProvince),
      region: text(g.placeRegion),
      country: text(g.placeCountry),
    };
    Object.keys(element).forEach((key) => element[key] === undefined && delete element[key]);
    return element;
  });
  return { elements, total: ranked.length, truncated: ranked.length > RANKING_MAX_ELEMENTS };
}

module.exports = { buildListRanking, RANKING_MAX_ELEMENTS };

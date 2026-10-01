// functions/modules/lib/algolia-sync.js
/**
 * Reindexa sin índice temporal. `replaceAllObjects` crea `<índice>_tmp_*`; con el
 * límite de 20 índices del plan gratuito falla y deja esos restos (había 6
 * `lists_tmp_*`). Aquí: se guardan todos los registros y después se borran los
 * que ya no existen. El índice nunca queda vacío.
 */
async function syncAllObjects(index, records) {
  if (records.length > 0) {
    await index.saveObjects(records).wait();
  }
  const keep = new Set(records.map((record) => record.objectID));
  const stale = [];
  await index.browseObjects({
    query: '',
    attributesToRetrieve: ['objectID'],
    batch: (hits) => hits.forEach((hit) => { if (!keep.has(hit.objectID)) stale.push(hit.objectID); }),
  });
  if (stale.length > 0) {
    await index.deleteObjects(stale).wait();
  }
  return { saved: records.length, deleted: stale.length };
}

module.exports = { syncAllObjects };

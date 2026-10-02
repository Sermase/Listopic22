// Algolia simulado en memoria para el E2E y el reindexado en emulador.
// Escritura: lo que usa functions/modules/algolia.js (cliente v4).
// Lectura: lo que usa la web (cliente v5: /1/indexes/*/queries).
// Ordena con el customRanking de cada índice o réplica, como Algolia, y
// entiende los filtros que usa la app (facetas, NOT, OR, paréntesis, números).
// Nunca habla con el Algolia real.

import http from 'node:http';

const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function createAlgoliaMock() {
  const indices = new Map(); // nombre → { records: Map, settings }
  let taskId = 1;

  const index = (name) => {
    if (!indices.has(name)) indices.set(name, { records: new Map(), settings: {} });
    return indices.get(name);
  };
  const primaryOf = (name) => {
    for (const [primary, data] of indices) {
      if ((data.settings.replicas || []).includes(name)) return primary;
    }
    return null;
  };
  // Una réplica comparte los registros de su principal y tiene sus propios ajustes.
  const view = (name) => {
    const primary = primaryOf(name);
    const own = index(name);
    if (!primary) return { records: own.records, settings: own.settings };
    const base = index(primary);
    return { records: base.records, settings: { ...base.settings, ...own.settings } };
  };

  // --- Filtros ---------------------------------------------------------------
  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const c = input[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '(' || c === ')') { tokens.push(c); i++; continue; }
      if (c === '"') {
        let j = i + 1;
        let value = '';
        while (j < input.length && input[j] !== '"') {
          if (input[j] === '\\') j++;
          value += input[j++];
        }
        tokens.push({ quoted: value });
        i = j + 1;
        continue;
      }
      if ('<>!='.includes(c)) {
        const op = input.slice(i, i + 2);
        if (['<=', '>=', '!='].includes(op)) { tokens.push({ op }); i += 2; } else { tokens.push({ op: c }); i++; }
        continue;
      }
      if (c === ':') { tokens.push(':'); i++; continue; }
      let j = i;
      while (j < input.length && !/[\s():"<>!=]/.test(input[j])) j++;
      tokens.push(input.slice(i, j));
      i = j;
    }
    return tokens;
  }

  function parseFilters(input) {
    const tokens = tokenize(input);
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const word = (t) => (typeof t === 'object' && t && 'quoted' in t ? t.quoted : t);
    const parseOr = () => {
      const parts = [parseAnd()];
      while (peek() === 'OR') { next(); parts.push(parseAnd()); }
      return parts.length === 1 ? parts[0] : (r) => parts.some((p) => p(r));
    };
    const parseAnd = () => {
      const parts = [parseUnary()];
      while (peek() === 'AND') { next(); parts.push(parseUnary()); }
      return parts.length === 1 ? parts[0] : (r) => parts.every((p) => p(r));
    };
    const parseUnary = () => {
      if (peek() === 'NOT') { next(); const inner = parseUnary(); return (r) => !inner(r); }
      if (peek() === '(') { next(); const inner = parseOr(); next(); return inner; }
      const attr = word(next());
      const t = next();
      if (t === ':') {
        const value = word(next());
        if (peek() === 'TO') { next(); const hi = Number(word(next())); const lo = Number(value); return (r) => values(r, attr).some((v) => Number(v) >= lo && Number(v) <= hi); }
        return (r) => values(r, attr).some((v) => facetEquals(v, value));
      }
      const op = t.op;
      const n = Number(word(next()));
      const cmp = { '<': (a) => a < n, '<=': (a) => a <= n, '=': (a) => a === n, '!=': (a) => a !== n, '>=': (a) => a >= n, '>': (a) => a > n }[op];
      return (r) => values(r, attr).some((v) => typeof v === 'number' && cmp(v));
    };
    return input.trim() ? parseOr() : () => true;
  }

  const get = (record, path) => path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), record);
  const values = (record, attr) => {
    const v = get(record, attr);
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : [v];
  };
  const facetEquals = (actual, expected) => {
    if (typeof actual === 'boolean') return String(actual) === String(expected).toLowerCase();
    if (typeof actual === 'number') return actual === Number(expected);
    return fold(actual) === fold(expected);
  };

  function facetFiltersPredicate(facetFilters) {
    if (!facetFilters) return () => true;
    const list = typeof facetFilters === 'string' ? JSON.parse(facetFilters) : facetFilters;
    const one = (f) => {
      const negative = f.startsWith('-');
      const raw = negative ? f.slice(1) : f;
      const sep = raw.indexOf(':');
      const attr = raw.slice(0, sep);
      const value = raw.slice(sep + 1);
      return (r) => values(r, attr).some((v) => facetEquals(v, value)) !== negative;
    };
    const groups = list.map((g) => (Array.isArray(g) ? g.map(one) : [one(g)]));
    return (r) => groups.every((g) => g.some((p) => p(r)));
  }

  function numericFiltersPredicate(numericFilters) {
    if (!numericFilters) return () => true;
    const list = typeof numericFilters === 'string' ? JSON.parse(numericFilters) : numericFilters;
    const flat = list.flatMap((g) => (Array.isArray(g) ? [`(${g.join(' OR ')})`] : [g]));
    return parseFilters(flat.join(' AND '));
  }

  // --- Búsqueda --------------------------------------------------------------
  const searchableAttrs = (settings, record) => (settings.searchableAttributes || Object.keys(record))
    .map((a) => a.replace(/^unordered\((.*)\)$/, '$1'));

  function matchesQuery(record, settings, query) {
    const words = fold(query).split(/[^a-z0-9]+/).filter(Boolean);
    if (words.length === 0) return true;
    const haystack = searchableAttrs(settings, record)
      .flatMap((a) => values(record, a))
      .filter((v) => typeof v === 'string')
      .flatMap((v) => fold(v).split(/[^a-z0-9]+/));
    return words.every((w) => haystack.some((h) => h.startsWith(w)));
  }

  const distance = (a, b) => {
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  };

  function parseParams(request) {
    const params = { ...request };
    if (typeof request.params === 'string') {
      for (const [k, v] of new URLSearchParams(request.params)) {
        try { params[k] = JSON.parse(v); } catch { params[k] = v; }
      }
    }
    return params;
  }

  function search(indexName, request) {
    const p = parseParams(request);
    const { records, settings } = view(indexName);
    const filter = parseFilters(String(p.filters || ''));
    const facetFilter = facetFiltersPredicate(p.facetFilters);
    const numericFilter = numericFiltersPredicate(p.numericFilters);
    const query = String(p.query || '');
    let center = null;
    if (p.aroundLatLng) {
      const [lat, lng] = String(p.aroundLatLng).split(',').map(Number);
      center = { lat, lng };
    }
    const radius = p.aroundRadius === 'all' || p.aroundRadius === undefined ? Infinity : Number(p.aroundRadius);
    const precision = Number(p.aroundPrecision) || 10;

    const matched = [];
    for (const record of records.values()) {
      if (!matchesQuery(record, settings, query)) continue;
      if (!filter(record) || !facetFilter(record) || !numericFilter(record)) continue;
      let geoBucket = 0;
      if (center) {
        const g = record._geoloc;
        if (!g) continue;
        const d = distance(center, g);
        if (d > radius) continue;
        geoBucket = Math.floor(d / precision);
      }
      matched.push({ record, geoBucket });
    }

    const custom = (settings.customRanking || []).map((c) => {
      const m = /^(asc|desc)\((.*)\)$/.exec(c);
      return { dir: m[1] === 'asc' ? 1 : -1, attr: m[2] };
    });
    matched.sort((a, b) => {
      if (a.geoBucket !== b.geoBucket) return a.geoBucket - b.geoBucket;
      for (const { dir, attr } of custom) {
        const av = get(a.record, attr);
        const bv = get(b.record, attr);
        if (av === bv) continue;
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        return (av < bv ? -1 : 1) * dir;
      }
      return a.record.objectID < b.record.objectID ? -1 : 1;
    });

    const facets = {};
    const wanted = p.facets === undefined ? [] : (Array.isArray(p.facets) ? p.facets : [p.facets]);
    const facetAttrs = wanted.includes('*')
      ? (settings.attributesForFaceting || []).map((a) => a.replace(/^(searchable|filterOnly)\((.*)\)$/, '$2'))
      : wanted;
    for (const attr of facetAttrs) {
      const counts = {};
      for (const { record } of matched) {
        for (const v of values(record, attr)) counts[String(v)] = (counts[String(v)] || 0) + 1;
      }
      facets[attr] = counts;
    }

    const hitsPerPage = p.hitsPerPage === undefined ? 20 : Number(p.hitsPerPage);
    const page = Number(p.page || 0);
    const slice = matched.slice(page * hitsPerPage, (page + 1) * hitsPerPage).map(({ record }) => {
      const keep = Array.isArray(p.attributesToRetrieve) && !p.attributesToRetrieve.includes('*')
        ? Object.fromEntries(Object.entries(record).filter(([k]) => p.attributesToRetrieve.includes(k) || k === 'objectID'))
        : { ...record };
      const highlight = {};
      for (const [k, v] of Object.entries(keep)) {
        if (typeof v === 'string') highlight[k] = { value: v, matchLevel: 'none', matchedWords: [] };
      }
      return { ...keep, _highlightResult: highlight };
    });
    return {
      hits: slice,
      nbHits: matched.length,
      page,
      nbPages: hitsPerPage > 0 ? Math.ceil(matched.length / hitsPerPage) : 0,
      hitsPerPage,
      facets,
      exhaustiveFacetsCount: true,
      exhaustiveNbHits: true,
      processingTimeMS: 1,
      query,
      params: typeof request.params === 'string' ? request.params : '',
      index: indexName,
    };
  }

  // --- Escritura -------------------------------------------------------------
  const task = () => ({ taskID: taskId++, updatedAt: new Date().toISOString() });

  function applyBatch(indexName, requests) {
    const target = index(indexName).records;
    const objectIDs = [];
    for (const { action, body } of requests) {
      const id = body && body.objectID;
      objectIDs.push(id);
      if (action === 'addObject' || action === 'updateObject') target.set(id, { ...body });
      else if (action === 'partialUpdateObject') target.set(id, { ...(target.get(id) || { objectID: id }), ...body });
      else if (action === 'partialUpdateObjectNoCreate') { if (target.has(id)) target.set(id, { ...target.get(id), ...body }); }
      else if (action === 'deleteObject') target.delete(id);
      else if (action === 'clear') target.clear();
    }
    return { ...task(), objectIDs };
  }

  function handle(method, path, body) {
    const parts = path.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent); // 1, indexes, …
    if (parts[0] !== '1') return [404, { message: 'not found' }];
    if (parts[1] === 'indexes' && parts.length === 2 && method === 'GET') {
      return [200, { items: [...indices.keys()].map((name) => ({ name, entries: index(name).records.size })) }];
    }
    if (parts[1] !== 'indexes') return [404, { message: 'not found' }];
    const name = parts[2];
    const rest = parts.slice(3);
    if (name === '*' && rest[0] === 'queries') {
      return [200, { results: (body.requests || []).map((r) => search(r.indexName, r)) }];
    }
    if (name === '*' && rest[0] === 'objects') {
      return [200, { results: (body.requests || []).map((r) => index(r.indexName).records.get(r.objectID) || null) }];
    }
    if (name === '*' && rest[0] === 'batch') {
      const byIndex = new Map();
      (body.requests || []).forEach((r) => byIndex.set(r.indexName, [...(byIndex.get(r.indexName) || []), r]));
      for (const [n, reqs] of byIndex) applyBatch(n, reqs);
      return [200, task()];
    }
    if (rest.length === 0 && method === 'DELETE') { indices.delete(name); return [200, task()]; }
    if (rest[0] === 'settings') {
      if (method === 'GET') return [200, index(name).settings];
      index(name).settings = { ...index(name).settings, ...body };
      return [200, task()];
    }
    if (rest[0] === 'task') return [200, { status: 'published', pendingTask: false }];
    if (rest[0] === 'batch') return [200, applyBatch(name, body.requests || [])];
    if (rest[0] === 'clear') { index(name).records.clear(); return [200, task()]; }
    if (rest[0] === 'deleteByQuery') {
      const { filters = '' } = parseParams(body);
      const predicate = parseFilters(String(filters));
      for (const [id, record] of index(name).records) if (predicate(record)) index(name).records.delete(id);
      return [200, task()];
    }
    if (rest[0] === 'query') return [200, search(name, body)];
    if (rest[0] === 'browse') {
      const result = search(name, { ...parseParams(body), hitsPerPage: 100000 });
      return [200, { ...result, cursor: undefined }];
    }
    if (rest[0] === 'facets') return [200, { facetHits: [], exhaustiveFacetsCount: true, processingTimeMS: 1 }];
    if (rest.length === 1) {
      const id = rest[0];
      if (method === 'GET') { const r = index(name).records.get(id); return r ? [200, r] : [404, { message: 'ObjectID does not exist' }]; }
      if (method === 'PUT') { index(name).records.set(id, { ...body, objectID: id }); return [200, { ...task(), objectID: id }]; }
      if (method === 'DELETE') { index(name).records.delete(id); return [200, task()]; }
    }
    if (rest.length === 2 && rest[1] === 'partial') {
      const id = rest[0];
      index(name).records.set(id, { ...(index(name).records.get(id) || { objectID: id }), ...body });
      return [200, { ...task(), objectID: id }];
    }
    if (rest.length === 0 && method === 'POST') {
      const id = body.objectID || `auto-${taskId}`;
      index(name).records.set(id, { ...body, objectID: id });
      return [201, { ...task(), objectID: id }];
    }
    return [404, { message: `no simulado: ${method} ${path}` }];
  }

  return { handle, search, indices, view };
}

/** Servidor HTTP del simulador. Devuelve { server, mock, url }. */
export function startAlgoliaMock({ port = 7700, host = '127.0.0.1' } = {}) {
  const mock = createAlgoliaMock();
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
      let status = 500;
      let payload = { message: 'error' };
      try { [status, payload] = mock.handle(req.method, req.url, body); } catch (error) { payload = { message: String(error && error.message) }; }
      res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve({ server, mock, url: `http://${host}:${port}` })));
}

// node e2e/mock-algolia.mjs → arranca en 127.0.0.1:7700 (o ALGOLIA_MOCK_PORT).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { url } = await startAlgoliaMock({ port: Number(process.env.ALGOLIA_MOCK_PORT || 7700) });
  console.log(`Algolia simulado en ${url}`);
}

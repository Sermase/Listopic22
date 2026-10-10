// functions/test/helpers/fake-firestore.js
//
// Firestore en memoria, lo justo para probar Cloud Functions sin emulador:
// collection/doc/get/set(merge)/update/add/delete, where (==, <, <=, >, >=,
// in, array-contains), limit, orderBy, startAfter, batch y runTransaction
// (los resultados de una consulta traen docs, size, empty y forEach). Entiende los
// FieldValue de firebase-admin (serverTimestamp, delete, arrayUnion,
// arrayRemove, increment).
//
// Igual que Firestore:
// - un filtro de rango ordena por ese campo y después por id;
// - igualdad + rango sobre campos distintos necesita índice compuesto.
//   Con `{ compositeIndexes: false }` esa consulta falla con el código 9
//   (FAILED_PRECONDITION), como cuando el índice no existe o se está creando.
//
// Los serverTimestamp() se guardan como SERVER_TIMESTAMP (isServerTimestamp).

const SERVER_TIMESTAMP = Object.freeze({ __serverTimestamp: true });
const isServerTimestamp = (value) => Boolean(value) && value.__serverTimestamp === true;

const transformName = (value) => (value && typeof value === 'object' && value.constructor ? value.constructor.name : '');
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const clone = (value) => {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
};

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Aplica un valor (con posibles FieldValue) sobre el actual. undefined = borrar.
function resolveValue(current, value) {
  switch (transformName(value)) {
    case 'ServerTimestampTransform': return SERVER_TIMESTAMP;
    case 'DeleteTransform': return undefined;
    case 'ArrayUnionTransform': {
      const base = Array.isArray(current) ? [...current] : [];
      value.elements.forEach((el) => { if (!base.some((item) => sameValue(item, el))) base.push(el); });
      return base;
    }
    case 'ArrayRemoveTransform': {
      const base = Array.isArray(current) ? current : [];
      return base.filter((item) => !value.elements.some((el) => sameValue(item, el)));
    }
    case 'NumericIncrementTransform': return (typeof current === 'number' ? current : 0) + value.operand;
    default:
      if (isPlainObject(value)) {
        const out = {};
        Object.entries(value).forEach(([k, v]) => {
          const next = resolveValue(undefined, v);
          if (next !== undefined) out[k] = next;
        });
        return out;
      }
      return clone(value);
  }
}

function mergeInto(target, patch) {
  Object.entries(patch).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeInto(target[key], value);
      return;
    }
    const next = resolveValue(target[key], value);
    if (next === undefined) delete target[key];
    else target[key] = next;
  });
  return target;
}

function setPath(target, path, value) {
  const parts = path.split('.');
  let node = target;
  parts.slice(0, -1).forEach((part) => {
    if (!isPlainObject(node[part])) node[part] = {};
    node = node[part];
  });
  const last = parts[parts.length - 1];
  const next = resolveValue(node[last], value);
  if (next === undefined) delete node[last];
  else node[last] = next;
}

const getPath = (data, path) => path.split('.').reduce((node, part) => (node == null ? undefined : node[part]), data);

const millisOf = (value) => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
};

// Firestore solo compara valores del mismo tipo.
function compare(a, b) {
  const ma = millisOf(a);
  const mb = millisOf(b);
  if (ma !== null && mb !== null) return ma - mb;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return null;
}

function matches(data, { field, op, value }) {
  const actual = getPath(data, field);
  switch (op) {
    case '==': return sameValue(actual, value);
    case 'in': return Array.isArray(value) && value.some((v) => sameValue(actual, v));
    case 'array-contains': return Array.isArray(actual) && actual.some((v) => sameValue(v, value));
    case '<': case '<=': case '>': case '>=': {
      if (actual === undefined) return false;
      const diff = compare(actual, value);
      if (diff === null) return false;
      return op === '<' ? diff < 0 : op === '<=' ? diff <= 0 : op === '>' ? diff > 0 : diff >= 0;
    }
    default: throw new Error(`fake-firestore: operador no soportado ${op}`);
  }
}

const RANGE_OPS = new Set(['<', '<=', '>', '>=']);

class FakeSnapshot {
  constructor(ref, data) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = data !== undefined;
    this._data = data === undefined ? undefined : clone(data);
  }

  data() { return this._data === undefined ? undefined : clone(this._data); }

  get(field) { return getPath(this._data || {}, field); }
}

class FakeQuery {
  constructor(db, collectionPath, filters = [], limitCount = null, orders = [], startAfterId = null) {
    this._db = db;
    this._collectionPath = collectionPath;
    this._filters = filters;
    this._limit = limitCount;
    this._orders = orders;
    this._startAfterId = startAfterId;
  }

  where(field, op, value) {
    return new FakeQuery(this._db, this._collectionPath, [...this._filters, { field, op, value }], this._limit, this._orders, this._startAfterId);
  }

  limit(count) { return new FakeQuery(this._db, this._collectionPath, this._filters, count, this._orders, this._startAfterId); }

  orderBy(field, direction = 'asc') {
    return new FakeQuery(this._db, this._collectionPath, this._filters, this._limit, [...this._orders, { field, direction }], this._startAfterId);
  }

  // Cursor con un snapshot de la página anterior (lo habitual al paginar).
  startAfter(snapshot) {
    return new FakeQuery(this._db, this._collectionPath, this._filters, this._limit, this._orders, snapshot.id);
  }

  async get() {
    const db = this._db;
    db.queries.push({
      collection: this._collectionPath, filters: this._filters, limit: this._limit, orders: this._orders, startAfter: this._startAfterId,
    });
    const equalityFields = new Set(this._filters.filter((f) => !RANGE_OPS.has(f.op)).map((f) => f.field));
    const rangeFields = [...new Set(this._filters.filter((f) => RANGE_OPS.has(f.op)).map((f) => f.field))];
    const needsComposite = rangeFields.some((field) => [...equalityFields].some((eq) => eq !== field));
    if (needsComposite && !db.compositeIndexes) {
      const error = new Error('9 FAILED_PRECONDITION: The query requires an index.');
      error.code = 9;
      throw error;
    }

    const orders = this._orders.length
      ? this._orders
      : rangeFields.map((field) => ({ field, direction: 'asc' }));
    let docs = db._docsIn(this._collectionPath)
      .filter(({ data }) => this._filters.every((filter) => matches(data, filter)))
      .filter(({ data }) => orders.every(({ field }) => getPath(data, field) !== undefined));
    docs.sort((a, b) => {
      for (const { field, direction } of orders) {
        const diff = compare(getPath(a.data, field), getPath(b.data, field)) || 0;
        if (diff !== 0) return direction === 'desc' ? -diff : diff;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    if (this._startAfterId !== null) {
      const index = docs.findIndex(({ id }) => id === this._startAfterId);
      if (index >= 0) docs = docs.slice(index + 1);
    }
    if (this._limit !== null) docs = docs.slice(0, this._limit);
    const snaps = docs.map(({ id, data }) => new FakeSnapshot(db.doc(`${this._collectionPath}/${id}`), data));
    const result = { docs: snaps, size: snaps.length, empty: snaps.length === 0, forEach: (fn) => snaps.forEach(fn) };
    if (db.onQuery) await db.onQuery({ collection: this._collectionPath, filters: this._filters, result });
    return result;
  }
}

class FakeCollection extends FakeQuery {
  constructor(db, path) {
    super(db, path);
    this.path = path;
    this.id = path.split('/').pop();
  }

  doc(id) { return new FakeDocRef(this._db, `${this.path}/${id || this._db.autoId()}`); }

  async add(data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

class FakeDocRef {
  constructor(db, path) {
    this._db = db;
    this.path = path;
    this.id = path.split('/').pop();
  }

  collection(name) { return new FakeCollection(this._db, `${this.path}/${name}`); }

  async get() { return new FakeSnapshot(this, this._db.store.get(this.path)); }

  async set(data, options = {}) { this._db._write('set', this, data, options); }

  async update(data) { this._db._write('update', this, data); }

  async delete() { this._db._write('delete', this); }
}

class FakeFirestore {
  constructor({ compositeIndexes = true } = {}) {
    this.store = new Map();
    this.compositeIndexes = compositeIndexes;
    this.queries = [];
    this.writes = [];
    this.onQuery = null;
    this._nextId = 1;
  }

  autoId() { return `auto${String(this._nextId++).padStart(4, '0')}`; }

  collection(path) { return new FakeCollection(this, path); }

  doc(path) { return new FakeDocRef(this, path); }

  seed(path, data) { this.store.set(path, clone(data)); return this; }

  data(path) { const value = this.store.get(path); return value === undefined ? undefined : clone(value); }

  docsIn(collectionPath) { return this._docsIn(collectionPath); }

  _docsIn(collectionPath) {
    const prefix = `${collectionPath}/`;
    return [...this.store.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data }));
  }

  _write(kind, ref, data, options = {}) {
    this.writes.push({ kind, path: ref.path, data, options });
    if (kind === 'delete') {
      this.store.delete(ref.path);
      return;
    }
    const current = this.store.get(ref.path);
    if (kind === 'update') {
      if (current === undefined) {
        const error = new Error(`5 NOT_FOUND: No document to update: ${ref.path}`);
        error.code = 5;
        throw error;
      }
      const next = clone(current);
      Object.entries(data).forEach(([key, value]) => setPath(next, key, value));
      this.store.set(ref.path, next);
      return;
    }
    if (options.merge) {
      this.store.set(ref.path, mergeInto(clone(current || {}), data));
      return;
    }
    this.store.set(ref.path, resolveValue(undefined, data));
  }

  // Escrituras en lote: se aplican todas juntas al hacer commit().
  batch() {
    const pending = [];
    const batch = {
      set: (ref, data, options = {}) => { pending.push(() => this._write('set', ref, data, options)); return batch; },
      update: (ref, data) => { pending.push(() => this._write('update', ref, data)); return batch; },
      delete: (ref) => { pending.push(() => this._write('delete', ref)); return batch; },
      commit: async () => { pending.splice(0).forEach((apply) => apply()); },
    };
    return batch;
  }

  // Lecturas primero y escrituras al final, todas juntas (como Firestore).
  async runTransaction(fn) {
    const pending = [];
    const tx = {
      get: (refOrQuery) => refOrQuery.get(),
      set: (ref, data, options = {}) => { pending.push(() => this._write('set', ref, data, options)); return tx; },
      update: (ref, data) => { pending.push(() => this._write('update', ref, data)); return tx; },
      delete: (ref) => { pending.push(() => this._write('delete', ref)); return tx; },
    };
    const result = await fn(tx);
    pending.forEach((apply) => apply());
    return result;
  }
}

module.exports = {
  FakeFirestore,
  SERVER_TIMESTAMP,
  isServerTimestamp,
};

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const QUERY_TTL = 5 * 60 * 1000;
const DOC_TTL = 10 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class QueryCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string, ttlMs = QUERY_TTL): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  invalidate(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const queryCache = new QueryCache();

// --- Doc-level cache for enrichment ---

interface DocEntry {
  data: Record<string, unknown> | null;
  timestamp: number;
}

const docCache = new Map<string, DocEntry>();

export async function getCachedDoc(
  collectionPath: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const key = `${collectionPath}/${id}`;
  const entry = docCache.get(key);
  if (entry && Date.now() - entry.timestamp < DOC_TTL) {
    return entry.data;
  }
  try {
    const snap = await getDoc(doc(db, collectionPath, id));
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
    docCache.set(key, { data, timestamp: Date.now() });
    return data;
  } catch {
    return null;
  }
}

export function invalidateDoc(collectionPath: string, id: string): void {
  docCache.delete(`${collectionPath}/${id}`);
}

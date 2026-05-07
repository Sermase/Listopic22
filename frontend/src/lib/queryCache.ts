import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const DOC_TTL = 10 * 60 * 1000;

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
  if (entry && Date.now() - entry.timestamp < DOC_TTL) return entry.data;
  try {
    const snap = await getDoc(doc(db, collectionPath, id));
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
    docCache.set(key, { data, timestamp: Date.now() });
    return data;
  } catch {
    return null;
  }
}

export async function getCachedDocs(
  collectionPath: string,
  ids: string[],
  options: { chunkSize?: number; warnLabel?: string } = {}
): Promise<Record<string, Record<string, unknown>>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const docsMap: Record<string, Record<string, unknown>> = {};
  const missingIds: string[] = [];

  for (const id of uniqueIds) {
    const key = `${collectionPath}/${id}`;
    const entry = docCache.get(key);
    if (entry && Date.now() - entry.timestamp < DOC_TTL) {
      if (entry.data) docsMap[id] = entry.data;
    } else {
      missingIds.push(id);
    }
  }

  const chunkSize = options.chunkSize ?? 10;
  for (let i = 0; i < missingIds.length; i += chunkSize) {
    const chunk = missingIds.slice(i, i + chunkSize);
    try {
      const snap = await getDocs(query(collection(db, collectionPath), where(documentId(), 'in', chunk)));
      const returnedIds = new Set<string>();
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        returnedIds.add(docSnap.id);
        docsMap[docSnap.id] = data;
        docCache.set(`${collectionPath}/${docSnap.id}`, { data, timestamp: Date.now() });
      });

      chunk.forEach((id) => {
        if (!returnedIds.has(id)) {
          docCache.set(`${collectionPath}/${id}`, { data: null, timestamp: Date.now() });
        }
      });
    } catch (error) {
      if (options.warnLabel) {
        console.warn(options.warnLabel, { collectionPath, ids: chunk, error });
      }
    }
  }

  return docsMap;
}

export function invalidateDoc(collectionPath: string, id: string): void {
  docCache.delete(`${collectionPath}/${id}`);
}

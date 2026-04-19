import { doc, getDoc } from 'firebase/firestore';
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

export function invalidateDoc(collectionPath: string, id: string): void {
  docCache.delete(`${collectionPath}/${id}`);
}

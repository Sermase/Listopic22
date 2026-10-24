import { collection, doc, getDocs, increment, query, serverTimestamp, setDoc, where, writeBatch, type Firestore } from 'firebase/firestore';

/**
 * «Quiero ir» y «Ya fui»: colecciones especiales de Guardados. Se reconocen por
 * su campo `kind` (aunque se renombren) y, en las antiguas, por el nombre.
 */
export type VisitArchiveKind = 'wantToGo' | 'visited';

export const VISIT_ARCHIVES: Record<VisitArchiveKind, { name: string; emoji: string; color: string }> = {
    wantToGo: { name: 'Quiero ir', emoji: '⭐', color: '#f59e0b' },
    visited: { name: 'Ya fui', emoji: '✅', color: '#10b981' },
};

const KINDS = Object.keys(VISIT_ARCHIVES) as VisitArchiveKind[];

/** Busca (o crea) las dos colecciones y les pone icono y color si no los tienen. */
export async function ensureVisitArchives(db: Firestore, uid: string): Promise<Record<VisitArchiveKind, string>> {
    const archivesRef = collection(db, 'users', uid, 'archives');
    const snap = await getDocs(archivesRef);
    const found: Partial<Record<VisitArchiveKind, string>> = {};
    for (const kind of KINDS) {
        const byKind = snap.docs.find((d) => d.data().kind === kind);
        const byName = snap.docs.find((d) => !d.data().kind && d.data().name === VISIT_ARCHIVES[kind].name);
        const existing = byKind || byName;
        if (existing) {
            found[kind] = existing.id;
            const data = existing.data();
            if (!data.kind || !data.emoji || !data.color) {
                await setDoc(existing.ref, {
                    kind,
                    emoji: data.emoji || VISIT_ARCHIVES[kind].emoji,
                    color: data.color || VISIT_ARCHIVES[kind].color,
                }, { merge: true });
            }
            continue;
        }
        const created = doc(archivesRef);
        await setDoc(created, { ...VISIT_ARCHIVES[kind], kind, itemCount: 0, createdAt: serverTimestamp() });
        found[kind] = created.id;
    }
    return found as Record<VisitArchiveKind, string>;
}

/**
 * Tras publicar una reseña: todo lo guardado de ese sitio en «Quiero ir» (el
 * sitio y sus platos) pasa a «Ya fui», tal cual estaba guardado.
 */
export async function moveVisitedPlace(db: Firestore, uid: string, placeId: string): Promise<number> {
    const ids = await ensureVisitArchives(db, uid);
    const fromItems = collection(db, 'users', uid, 'archives', ids.wantToGo, 'items');
    const toItems = collection(db, 'users', uid, 'archives', ids.visited, 'items');
    // Los sitios guardados desde su ficha usan el placeId como id (los antiguos sin campo placeId).
    const [byField, all] = await Promise.all([
        getDocs(query(fromItems, where('placeId', '==', placeId))),
        getDocs(fromItems),
    ]);
    const matches = new Map(byField.docs.map((d) => [d.id, d]));
    const direct = all.docs.find((d) => d.id === placeId);
    if (direct) matches.set(direct.id, direct);
    if (!matches.size) return 0;

    const existingInVisited = new Set((await getDocs(toItems)).docs.map((d) => d.id));
    const batch = writeBatch(db);
    let added = 0;
    matches.forEach((item) => {
        batch.delete(item.ref);
        if (!existingInVisited.has(item.id)) {
            batch.set(doc(toItems, item.id), { ...item.data(), savedAt: serverTimestamp() });
            added += 1;
        }
    });
    batch.update(doc(db, 'users', uid, 'archives', ids.wantToGo), { itemCount: increment(-matches.size) });
    if (added) batch.update(doc(db, 'users', uid, 'archives', ids.visited), { itemCount: increment(added) });
    await batch.commit();
    return matches.size;
}

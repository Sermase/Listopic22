import React, { useState } from 'react';
import { db } from '../../firebase';
import {
    collectionGroup, collection, query, getDocs, doc, updateDoc, getDoc,
    limit as firestoreLimit, writeBatch, where
} from 'firebase/firestore';
import { RefreshCw, Tag, AlertCircle, CheckCircle, Wrench, ChevronDown, ChevronRight, Pencil, X, Save } from 'lucide-react';

interface TagRow {
    tag: string;
    listId: string;
    listName: string;
    reviewCount: number;
}

interface RenameState {
    listId: string;
    oldTag: string;
    newValue: string;
}

interface ListTagPreview {
    listId: string;
    listName: string;
    currentTags: string[];
    tagsFromReviews: string[];
    missingTags: string[];  // in reviews but not in list
    orphanTags: string[];   // in list but not in any review
}

export const TagsManagerTab: React.FC = () => {
    const [log, setLog] = useState<string[]>([]);
    const [scanning, setScanning] = useState(false);
    const [applying, setApplying] = useState(false);
    const [previews, setPreviews] = useState<ListTagPreview[]>([]);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [done, setDone] = useState(false);

    // Tag table state
    const [tagRows, setTagRows] = useState<TagRow[]>([]);
    const [renaming, setRenaming] = useState<RenameState | null>(null);
    const [savingRename, setSavingRename] = useState(false);
    // allReviews cache para propagación de renombres
    const [reviewsCache, setReviewsCache] = useState<any[]>([]);

    const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 99)]);

    const scanTags = async () => {
        setScanning(true);
        setDone(false);
        setPreviews([]);
        setLog([]);

        try {
            // 1. Fetch all reviews
            addLog('Cargando reseñas...');
            const snap = await getDocs(query(collectionGroup(db, 'reviews'), firestoreLimit(5000)));
            addLog(`${snap.docs.length} reseñas cargadas.`);

            // 2. Group tags by listId
            const tagsByList = new Map<string, Set<string>>();
            snap.docs.forEach(d => {
                const data = d.data();
                const listId: string = data.listId || d.ref.parent.parent?.id;
                if (!listId) return;
                const tags: string[] = Array.isArray(data.tags) ? data.tags : (Array.isArray(data.userTags) ? data.userTags : []);
                if (tags.length === 0) return;
                if (!tagsByList.has(listId)) tagsByList.set(listId, new Set());
                tags.forEach(t => { if (t?.trim()) tagsByList.get(listId)!.add(t.trim()); });
            });
            addLog(`${tagsByList.size} listas con tags en reseñas.`);

            // 3. Fetch list documents to compare
            const listIds = [...tagsByList.keys()];
            const listNameMap: Record<string, string> = {};
            const listTagMap: Record<string, string[]> = {};

            const chunks: string[][] = [];
            for (let i = 0; i < listIds.length; i += 10) chunks.push(listIds.slice(i, i + 10));

            await Promise.all(chunks.map(async chunk => {
                await Promise.all(chunk.map(async listId => {
                    try {
                        const snap = await getDoc(doc(db, 'lists', listId));
                        if (snap.exists()) {
                            const data = snap.data();
                            listNameMap[listId] = data.name || listId;
                            listTagMap[listId] = Array.isArray(data.availableTags) ? data.availableTags : [];
                        } else {
                            listNameMap[listId] = `(lista eliminada: ${listId.slice(0, 8)})`;
                            listTagMap[listId] = [];
                        }
                    } catch {
                        listNameMap[listId] = listId;
                        listTagMap[listId] = [];
                    }
                }));
            }));
            addLog(`Datos de ${Object.keys(listNameMap).length} listas cargados.`);

            // 4. Build previews
            const result: ListTagPreview[] = [];
            tagsByList.forEach((reviewTags, listId) => {
                const currentTags = listTagMap[listId] || [];
                const reviewTagsArr = [...reviewTags];
                const missing = reviewTagsArr.filter(t => !currentTags.includes(t));
                const orphan = currentTags.filter(t => !reviewTags.has(t));
                if (missing.length > 0 || orphan.length > 0) {
                    result.push({
                        listId,
                        listName: listNameMap[listId] || listId,
                        currentTags,
                        tagsFromReviews: reviewTagsArr,
                        missingTags: missing,
                        orphanTags: orphan,
                    });
                }
            });

            result.sort((a, b) => b.missingTags.length - a.missingTags.length);
            setPreviews(result);

            // 5. Build tag rows (all tags across all lists, from list definitions)
            const reviewCountByListTag = new Map<string, number>();
            const allDocs = snap.docs;
            allDocs.forEach(d => {
                const data = d.data();
                const listId: string = data.listId || d.ref.parent.parent?.id;
                if (!listId) return;
                const tags: string[] = Array.isArray(data.tags) ? data.tags : (Array.isArray(data.userTags) ? data.userTags : []);
                tags.forEach(t => {
                    const key = `${listId}__${t}`;
                    reviewCountByListTag.set(key, (reviewCountByListTag.get(key) || 0) + 1);
                });
            });

            const rows: TagRow[] = [];
            Object.entries(listTagMap).forEach(([listId, tags]) => {
                tags.forEach(tag => {
                    rows.push({
                        tag,
                        listId,
                        listName: listNameMap[listId] || listId,
                        reviewCount: reviewCountByListTag.get(`${listId}__${tag}`) || 0,
                    });
                });
            });
            // Also include tags found in reviews but not yet in list
            tagsByList.forEach((reviewTags, listId) => {
                reviewTags.forEach(tag => {
                    const alreadyInList = (listTagMap[listId] || []).includes(tag);
                    if (!alreadyInList) {
                        rows.push({
                            tag,
                            listId,
                            listName: listNameMap[listId] || listId,
                            reviewCount: reviewCountByListTag.get(`${listId}__${tag}`) || 0,
                        });
                    }
                });
            });

            rows.sort((a, b) => a.listName.localeCompare(b.listName) || a.tag.localeCompare(b.tag));
            setTagRows(rows);
            setReviewsCache(allDocs.map(d => ({ id: d.id, _path: d.ref.path, ...d.data() })));

            addLog(`Análisis completo: ${result.length} listas con discrepancias. ${rows.length} tags en tabla.`);
            setDone(true);
        } catch (err: any) {
            addLog(`Error: ${err.message}`);
        } finally {
            setScanning(false);
        }
    };

    const applyRescue = async () => {
        const toFix = previews.filter(p => p.missingTags.length > 0);
        if (toFix.length === 0) return;
        if (!confirm(`¿Añadir los tags faltantes a ${toFix.length} listas?\nNo se eliminarán los tags actuales, solo se añadirán los que faltan.`)) return;

        setApplying(true);
        let fixed = 0;
        try {
            for (const p of toFix) {
                const merged = [...new Set([...p.currentTags, ...p.missingTags])];
                await updateDoc(doc(db, 'lists', p.listId), { availableTags: merged });
                fixed++;
                if (fixed % 5 === 0) addLog(`${fixed}/${toFix.length} listas actualizadas...`);
            }
            addLog(`✓ Rescate completado: ${fixed} listas actualizadas.`);
            // Refresh previews
            await scanTags();
        } catch (err: any) {
            addLog(`Error en rescate: ${err.message}`);
        } finally {
            setApplying(false);
        }
    };

    const saveRename = async () => {
        if (!renaming) return;
        const newTag = renaming.newValue.trim();
        if (!newTag || newTag === renaming.oldTag) { setRenaming(null); return; }
        if (!confirm(`¿Renombrar "${renaming.oldTag}" → "${newTag}" en la lista y en todas sus reseñas?`)) return;

        setSavingRename(true);
        try {
            // 1. Update list availableTags
            const listSnap = await getDoc(doc(db, 'lists', renaming.listId));
            if (listSnap.exists()) {
                const currentTags: string[] = listSnap.data().availableTags || [];
                const updatedTags = currentTags.map(t => t === renaming.oldTag ? newTag : t);
                await updateDoc(doc(db, 'lists', renaming.listId), { availableTags: updatedTags });
            }

            // 2. Propagate to reviews of this list from cache
            const affected = reviewsCache.filter(r => {
                const tags: string[] = Array.isArray(r.tags) ? r.tags : (Array.isArray(r.userTags) ? r.userTags : []);
                const listId = r.listId || r._path?.split('/')[1];
                return listId === renaming.listId && tags.includes(renaming.oldTag);
            });

            const BATCH_SIZE = 450;
            for (let i = 0; i < affected.length; i += BATCH_SIZE) {
                const batch = writeBatch(db);
                affected.slice(i, i + BATCH_SIZE).forEach(r => {
                    const tags: string[] = Array.isArray(r.tags) ? r.tags : (Array.isArray(r.userTags) ? r.userTags : []);
                    const newTags = tags.map(t => t === renaming.oldTag ? newTag : t);
                    batch.update(doc(db, r._path), { tags: newTags });
                });
                await batch.commit();
            }

            addLog(`✓ "${renaming.oldTag}" → "${newTag}": lista actualizada + ${affected.length} reseñas.`);
            setTagRows(prev => prev.map(row =>
                row.listId === renaming.listId && row.tag === renaming.oldTag
                    ? { ...row, tag: newTag }
                    : row
            ));
            setRenaming(null);
        } catch (err: any) {
            addLog(`Error: ${err.message}`);
        } finally {
            setSavingRename(false);
        }
    };

    const toggleExpand = (listId: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(listId) ? next.delete(listId) : next.add(listId);
            return next;
        });
    };

    const listsWithMissing = previews.filter(p => p.missingTags.length > 0);
    const listsWithOrphans = previews.filter(p => p.orphanTags.length > 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Gestión de Etiquetas</h2>
                    <p className="text-sm text-gray-400 mt-1">Auditoría y rescate de tags entre listas y reseñas</p>
                </div>
                <button
                    onClick={scanTags}
                    disabled={scanning || applying}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] disabled:opacity-50 rounded-lg text-white font-bold text-sm transition-colors"
                >
                    {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {scanning ? 'Analizando...' : 'Analizar'}
                </button>
            </div>

            {/* Summary cards */}
            {done && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="border border-amber-500/20 bg-amber-500/10 rounded-lg p-3">
                        <div className="text-2xl font-bold text-amber-400">{listsWithMissing.length}</div>
                        <div className="text-xs text-gray-400 mt-0.5">Listas con tags faltantes</div>
                    </div>
                    <div className="border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] rounded-lg p-3">
                        <div className="text-2xl font-bold text-[var(--lt-accent-2)]">{listsWithOrphans.length}</div>
                        <div className="text-xs text-gray-400 mt-0.5">Listas con tags sin uso</div>
                    </div>
                    <div className="border border-emerald-500/20 bg-emerald-500/10 rounded-lg p-3">
                        <div className="text-2xl font-bold text-emerald-400">
                            {listsWithMissing.reduce((acc, p) => acc + p.missingTags.length, 0)}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">Tags a rescatar en total</div>
                    </div>
                </div>
            )}

            {/* Rescue button */}
            {listsWithMissing.length > 0 && (
                <div className="flex items-center justify-between p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <div className="flex items-center gap-3">
                        <Wrench className="w-5 h-5 text-amber-400 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-amber-300">
                                {listsWithMissing.length} listas necesitan rescate
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                Se añadirán los tags presentes en reseñas pero ausentes en la lista. No se borrará nada.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={applyRescue}
                        disabled={applying || scanning}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-white font-bold text-sm transition-colors shrink-0"
                    >
                        {applying
                            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Rescatando...</>
                            : <><Wrench className="w-4 h-4" />Rescatar tags</>
                        }
                    </button>
                </div>
            )}

            {done && listsWithMissing.length === 0 && (
                <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm font-semibold">
                    <CheckCircle className="w-5 h-5" />
                    Todas las listas tienen sus tags sincronizados con las reseñas.
                </div>
            )}

            {/* List detail */}
            {previews.length > 0 && (
                <div className="space-y-2">
                    {previews.map(p => (
                        <div key={p.listId} className="border border-white/10 rounded-xl overflow-hidden">
                            <button
                                onClick={() => toggleExpand(p.listId)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <Tag className="w-4 h-4 text-gray-500 shrink-0" />
                                    <span className="font-semibold text-sm text-white truncate">{p.listName}</span>
                                    <div className="flex gap-1.5 shrink-0">
                                        {p.missingTags.length > 0 && (
                                            <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">
                                                +{p.missingTags.length} faltan
                                            </span>
                                        )}
                                        {p.orphanTags.length > 0 && (
                                            <span className="text-[10px] bg-[var(--lt-accent-soft)] text-[var(--lt-accent-2)] px-1.5 py-0.5 rounded font-bold">
                                                {p.orphanTags.length} sin uso
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {expanded.has(p.listId)
                                    ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                                    : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                                }
                            </button>

                            {expanded.has(p.listId) && (
                                <div className="px-4 pb-4 pt-2 space-y-3 bg-black/20">
                                    {p.missingTags.length > 0 && (
                                        <div>
                                            <p className="text-xs font-bold text-amber-400 mb-1.5">Tags en reseñas pero no en la lista (a rescatar):</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {p.missingTags.map(t => (
                                                    <span key={t} className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full text-xs border border-amber-500/20">{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {p.orphanTags.length > 0 && (
                                        <div>
                                            <p className="text-xs font-bold text-[var(--lt-accent-2)] mb-1.5">Tags en la lista pero sin uso en reseñas:</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {p.orphanTags.map(t => (
                                                    <span key={t} className="px-2 py-0.5 bg-[var(--lt-accent-soft)] text-[var(--lt-accent-2)] rounded-full text-xs border border-[var(--lt-accent-border)]">{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {p.currentTags.length > 0 && (
                                        <div>
                                            <p className="text-xs font-bold text-gray-500 mb-1.5">Tags actuales en la lista:</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {p.currentTags.map(t => (
                                                    <span key={t} className="px-2 py-0.5 bg-white/5 text-gray-400 rounded-full text-xs border border-white/10">{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {p.currentTags.length === 0 && (
                                        <div className="flex items-center gap-2 text-xs text-red-400">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            La lista no tiene ningún tag actualmente.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Tag table */}
            {tagRows.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-white">Todos los tags ({tagRows.length})</h3>
                    <div className="border border-white/10 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/10 bg-white/[0.02] text-left">
                                        <th className="px-4 py-3 text-gray-400 font-semibold">Tag</th>
                                        <th className="px-4 py-3 text-gray-400 font-semibold">Lista</th>
                                        <th className="px-4 py-3 text-gray-400 font-semibold w-20 text-right">Reseñas</th>
                                        <th className="px-4 py-3 w-10" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {tagRows.map((row, i) => {
                                        const isEditing = renaming?.listId === row.listId && renaming?.oldTag === row.tag;
                                        return (
                                            <tr key={`${row.listId}__${row.tag}__${i}`} className="hover:bg-white/[0.02] transition-colors">
                                                <td className="px-4 py-2">
                                                    {isEditing ? (
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                autoFocus
                                                                value={renaming.newValue}
                                                                onChange={e => setRenaming({ ...renaming, newValue: e.target.value })}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') saveRename();
                                                                    if (e.key === 'Escape') setRenaming(null);
                                                                }}
                                                                className="bg-[#1e253c] border border-[var(--lt-accent-border)] rounded-lg px-3 py-1.5 text-sm text-white outline-none w-40"
                                                            />
                                                            <button
                                                                onClick={saveRename}
                                                                disabled={savingRename}
                                                                className="p-1.5 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] rounded-lg text-white disabled:opacity-50"
                                                            >
                                                                {savingRename
                                                                    ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
                                                                    : <Save className="w-3.5 h-3.5" />
                                                                }
                                                            </button>
                                                            <button onClick={() => setRenaming(null)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="px-2.5 py-1 bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] rounded-full text-xs font-medium">{row.tag}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2 text-gray-400 text-xs truncate max-w-[200px]">{row.listName}</td>
                                                <td className="px-4 py-2 text-right">
                                                    <span className={`text-xs font-bold ${row.reviewCount > 0 ? 'text-gray-300' : 'text-gray-600'}`}>
                                                        {row.reviewCount}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2">
                                                    {!isEditing && (
                                                        <button
                                                            onClick={() => setRenaming({ listId: row.listId, oldTag: row.tag, newValue: row.tag })}
                                                            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors"
                                                            title="Renombrar"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Log */}
            {log.length > 0 && (
                <div className="bg-black/40 border border-white/5 rounded-xl p-4 font-mono text-xs text-gray-500 max-h-40 overflow-y-auto space-y-1">
                    {log.map((line, i) => <p key={i}>{line}</p>)}
                </div>
            )}
        </div>
    );
};

import React, { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Tags } from 'lucide-react';
import { db } from '../../firebase';
import { groupTagVariants, type TagVariantGroup } from '../../lib/tagVariants';

interface ReplaceSummary { listsMatched: number; reviewsMatched: number }

/** Sin `toTag`, la etiqueta se quita de listas, reseñas y etiquetas fijas de categoría. */
const replaceTag = async (fromTag: string, toTag: string | null, dryRun: boolean): Promise<ReplaceSummary> => {
    const fn = httpsCallable(getFunctions(undefined, 'europe-west1'), 'adminReplaceTag');
    const payload = toTag ? { fromTag, toTag } : { fromTag, remove: true };
    return (await fn({ ...payload, targets: 'lists-reviews', dryRun })).data as ReplaceSummary;
};

/**
 * 🏷️ Unificar etiquetas: busca la misma etiqueta escrita de varias formas en las
 * listas y la deja en una sola, en listas y reseñas (callable adminReplaceTag).
 * Primero se simula; luego se aplica.
 */
export const TagUnifyCard: React.FC = () => {
    const [groups, setGroups] = useState<TagVariantGroup[] | null>(null);
    const [chosen, setChosen] = useState<Record<string, string>>({});
    const [results, setResults] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [allTags, setAllTags] = useState<TagVariantGroup[]>([]);
    const [toRemove, setToRemove] = useState('');
    const [removeResult, setRemoveResult] = useState('');

    const scan = async () => {
        setBusy('scan');
        try {
            const [snap, categories] = await Promise.all([getDocs(collection(db, 'lists')), getDocs(collection(db, 'categories'))]);
            const lists = snap.docs.map((d) => d.data());
            const found = groupTagVariants(lists);
            setGroups(found);
            setAllTags(groupTagVariants([...lists, ...categories.docs.map((d) => ({ availableTags: d.data()['fixed-tags'] }))], true));
            setRemoveResult('');
            setChosen(Object.fromEntries(found.map((g) => [g.key, g.variants[0].tag])));
            setResults({});
        } finally {
            setBusy(null);
        }
    };

    const run = async (group: TagVariantGroup, dryRun: boolean) => {
        const target = chosen[group.key];
        setBusy(group.key);
        try {
            let lists = 0;
            let reviews = 0;
            for (const variant of group.variants.filter((v) => v.tag !== target)) {
                const summary = await replaceTag(variant.tag, target, dryRun);
                lists += summary.listsMatched;
                reviews += summary.reviewsMatched;
            }
            setResults((prev) => ({
                ...prev,
                [group.key]: `${dryRun ? 'Cambiaría' : 'Cambiado'}: ${lists} listas y ${reviews} reseñas.`,
            }));
            if (!dryRun) await scan();
        } catch (error) {
            setResults((prev) => ({ ...prev, [group.key]: `Error: ${error instanceof Error ? error.message : String(error)}` }));
        } finally {
            setBusy(null);
        }
    };

    const removeGroup = allTags.find((g) => g.key === toRemove);

    const runRemove = async (dryRun: boolean) => {
        if (!removeGroup) return;
        setBusy('remove');
        try {
            let lists = 0;
            let reviews = 0;
            for (const variant of removeGroup.variants) {
                const summary = await replaceTag(variant.tag, null, dryRun);
                lists += summary.listsMatched;
                reviews += summary.reviewsMatched;
            }
            setRemoveResult(`${dryRun ? 'Quitaría' : 'Quitada'}: ${lists} listas y ${reviews} reseñas (y de las fijas de categoría).`);
            if (!dryRun) {
                await scan();
                setToRemove('');
            }
        } catch (error) {
            setRemoveResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Tags className="w-5 h-5 text-[var(--lt-accent-2)]" /> Unificar etiquetas
            </h3>
            <p className="text-gray-400 mb-4 text-sm">La misma etiqueta escrita de varias formas («🚫🌾 Sin gluten», «🚫 🌾 Sin gluten»…). Elige la buena, simula y aplica: cambia listas y reseñas.</p>
            <button type="button" onClick={scan} disabled={busy !== null} className="px-4 py-2 bg-[var(--lt-accent)] disabled:opacity-50 text-white text-sm font-bold rounded-lg">
                {busy === 'scan' ? 'Buscando…' : 'Buscar etiquetas'}
            </button>
            {groups && groups.length === 0 && <p className="mt-4 text-sm text-emerald-300">Todo en orden: no hay etiquetas repetidas.</p>}
            <div className="mt-4 space-y-3">
                {groups?.map((group) => (
                    <div key={group.key} className="rounded-xl border border-white/10 p-3">
                        <div className="space-y-1">
                            {group.variants.map((variant) => (
                                <label key={variant.tag} className="flex items-center gap-2 text-sm text-white">
                                    <input type="radio" name={group.key} checked={chosen[group.key] === variant.tag} onChange={() => setChosen((prev) => ({ ...prev, [group.key]: variant.tag }))} />
                                    <span>«{variant.tag}»</span>
                                    <span className="text-xs text-gray-400">{variant.lists} {variant.lists === 1 ? 'lista' : 'listas'}</span>
                                </label>
                            ))}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => run(group, true)} disabled={busy !== null} className="px-3 py-1.5 rounded-lg border border-white/15 text-xs font-bold text-white disabled:opacity-50">Simular</button>
                            <button type="button" onClick={() => run(group, false)} disabled={busy !== null || !results[group.key]?.startsWith('Cambiaría')} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-xs font-bold text-white disabled:opacity-40">Aplicar</button>
                            {busy === group.key && <span className="text-xs text-gray-400">Trabajando…</span>}
                            {results[group.key] && <span className="text-xs text-gray-300">{results[group.key]}</span>}
                        </div>
                    </div>
                ))}
            </div>
            {allTags.length > 0 && (
                <div className="mt-5 border-t border-white/10 pt-4">
                    <h4 className="text-sm font-bold text-white mb-1">Quitar una etiqueta del todo</h4>
                    <p className="text-gray-400 mb-2 text-xs">De todas las listas, reseñas y etiquetas fijas de categoría, en todas sus formas.</p>
                    <select value={toRemove} onChange={(e) => { setToRemove(e.target.value); setRemoveResult(''); }} className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white">
                        <option value="">Elige etiqueta…</option>
                        {allTags.map((g) => (
                            <option key={g.key} value={g.key}>{g.variants.map((v) => v.tag).join(' · ')} ({g.variants.reduce((n, v) => n + v.lists, 0)})</option>
                        ))}
                    </select>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => runRemove(true)} disabled={busy !== null || !removeGroup} className="px-3 py-1.5 rounded-lg border border-white/15 text-xs font-bold text-white disabled:opacity-50">Simular</button>
                        <button type="button" onClick={() => runRemove(false)} disabled={busy !== null || !removeResult.startsWith('Quitaría')} className="px-3 py-1.5 rounded-lg bg-rose-600 text-xs font-bold text-white disabled:opacity-40">Quitar</button>
                        {busy === 'remove' && <span className="text-xs text-gray-400">Trabajando…</span>}
                        {removeResult && <span className="text-xs text-gray-300">{removeResult}</span>}
                    </div>
                </div>
            )}
        </div>
    );
};

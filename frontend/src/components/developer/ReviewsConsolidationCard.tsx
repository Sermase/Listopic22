import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { Database, RefreshCw, Search, ArrowDownToLine, Calculator } from 'lucide-react';

interface ConsolidationPageResult {
    dryRun: boolean;
    processed: number;
    migrated: number;
    alreadyNested: number;
    orphans: number;
    orphanSamples: { reviewId: string; reason: string }[];
    lastDocId: string | null;
    done: boolean;
}

interface RecountResult {
    scannedReviews: number;
    listsUpdated: number;
    usersUpdated: number;
    placesUpdated: number;
}

/**
 * Herramienta de consolidación de reseñas: migra la colección raíz legacy
 * reviews/ hacia la canónica lists/{listId}/reviews. Ver docs/REVIEWS-MIGRATION.md.
 */
export const ReviewsConsolidationCard: React.FC = () => {
    const [busy, setBusy] = useState(false);
    const [log, setLog] = useState<string[]>([]);

    const appendLog = (message: string) => {
        setLog(prev => [`${new Date().toLocaleTimeString()} — ${message}`, ...prev].slice(0, 200));
    };

    const handleCountRoot = async () => {
        setBusy(true);
        try {
            const countFn = httpsCallable(functions, 'adminCountRootReviews');
            const res = await countFn({});
            const data = res.data as { rootReviews: number };
            appendLog(`📊 Reseñas en la colección raíz reviews/: ${data.rootReviews}`);
        } catch (e) {
            appendLog(`❌ Error al contar: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setBusy(false);
        }
    };

    const runConsolidation = async (dryRun: boolean) => {
        if (!dryRun && !window.confirm(
            'Vas a MIGRAR las reseñas de la colección raíz reviews/ a lists/{listId}/reviews.\n\n' +
            'Los documentos raíz se BORRAN tras copiarse (con sus reactions/comments).\n' +
            'Al terminar, ejecuta "Recontar contadores" para sanear reviewCount/reviewsCount.\n\n¿Continuar?'
        )) return;

        setBusy(true);
        const totals = { processed: 0, migrated: 0, alreadyNested: 0, orphans: 0 };
        let cursor: string | null = null;
        let pages = 0;

        appendLog(dryRun ? '🔍 Auditoría (dry run) iniciada…' : '🚀 Migración iniciada…');
        try {
            const consolidateFn = httpsCallable(functions, 'adminConsolidateRootReviews');
            for (;;) {
                const res = await consolidateFn({ dryRun, pageSize: 50, startAfterId: cursor || undefined });
                const page = res.data as ConsolidationPageResult;
                pages += 1;
                totals.processed += page.processed;
                totals.migrated += page.migrated;
                totals.alreadyNested += page.alreadyNested;
                totals.orphans += page.orphans;
                appendLog(`Página ${pages}: procesadas ${page.processed} · ${dryRun ? 'migrables' : 'migradas'} ${page.migrated} · duplicadas ${page.alreadyNested} · huérfanas ${page.orphans}`);
                page.orphanSamples?.forEach(sample => appendLog(`   ⚠️ Huérfana ${sample.reviewId}: ${sample.reason}`));

                if (page.done) break;
                cursor = page.lastDocId;
                // En migración real los docs se borran, así que la primera página
                // siempre "avanza"; el cursor solo hace falta por las huérfanas.
                if (dryRun && !cursor) break;
            }
            appendLog(`✅ ${dryRun ? 'Auditoría' : 'Migración'} completada: ${totals.processed} procesadas, ${totals.migrated} ${dryRun ? 'migrables' : 'migradas'}, ${totals.alreadyNested} duplicadas limpiadas, ${totals.orphans} huérfanas.`);
            if (!dryRun && totals.migrated + totals.alreadyNested > 0) {
                appendLog('👉 Ejecuta ahora "Recontar contadores" para sanear los agregados.');
            }
        } catch (e) {
            appendLog(`❌ Error: ${e instanceof Error ? e.message : String(e)} (puedes relanzar; la operación es reanudable)`);
        } finally {
            setBusy(false);
        }
    };

    const handleRecount = async () => {
        if (!window.confirm('Recontar reviewCount (listas), reviewsCount/photosCount (usuarios) y reviewsCount/averageRating (lugares) desde las reseñas reales. ¿Continuar?')) return;
        setBusy(true);
        appendLog('🧮 Recuento de contadores iniciado (puede tardar)…');
        try {
            const recountFn = httpsCallable(functions, 'adminRecountReviewCounters', { timeout: 540000 });
            const res = await recountFn({});
            const data = res.data as RecountResult;
            appendLog(`✅ Recuento completado: ${data.scannedReviews} reseñas → ${data.listsUpdated} listas, ${data.usersUpdated} usuarios y ${data.placesUpdated} lugares actualizados.`);
        } catch (e) {
            appendLog(`❌ Error en recuento: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Database className="w-5 h-5 text-violet-400" /> Consolidación de reseñas (root → listas)
            </h3>
            <p className="text-gray-400 mb-4 text-sm">
                Migra las reseñas legacy de la colección raíz <code className="text-violet-300 bg-black/30 px-1 rounded">reviews/</code> a
                la canónica <code className="text-violet-300 bg-black/30 px-1 rounded">lists/{'{listId}'}/reviews</code> conservando el mismo ID
                y moviendo reactions/comments. Flujo: <strong>1)</strong> Auditar · <strong>2)</strong> Migrar · <strong>3)</strong> Recontar contadores.
                Detalles en <code className="text-violet-300 bg-black/30 px-1 rounded">docs/REVIEWS-MIGRATION.md</code>.
            </p>
            <div className="flex gap-3 flex-wrap">
                <button
                    onClick={handleCountRoot}
                    disabled={busy}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                >
                    {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                    Contar root
                </button>
                <button
                    onClick={() => runConsolidation(true)}
                    disabled={busy}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                >
                    {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    1 · Auditar (dry run)
                </button>
                <button
                    onClick={() => runConsolidation(false)}
                    disabled={busy}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                >
                    {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                    2 · Migrar
                </button>
                <button
                    onClick={handleRecount}
                    disabled={busy}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                >
                    {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                    3 · Recontar contadores
                </button>
            </div>
            {log.length > 0 && (
                <div className="mt-4 bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-xs max-h-64 overflow-y-auto">
                    {log.map((entry, i) => (
                        <div key={i} className="text-gray-300 py-0.5">{entry}</div>
                    ))}
                </div>
            )}
        </div>
    );
};

import React, { useEffect, useState } from 'react';
import { getDownloadURL, getMetadata, listAll, ref } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { DatabaseBackup, Download, Loader2, RefreshCw } from 'lucide-react';
import { functions, storage } from '../../firebase';

interface BackupFile {
    path: string;
    name: string;
    sizeBytes: number;
    createdAt: string | null;
}

interface ExportResult {
    ok: boolean;
    path: string;
    docCount: number;
    sizeBytes: number;
}

const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
};

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return fallback;
};

export const BackupsTab: React.FC = () => {
    const [backups, setBackups] = useState<BackupFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const listing = await listAll(ref(storage, 'backups'));
            const rows = await Promise.all(listing.items.map(async (item) => {
                const meta = await getMetadata(item).catch(() => null);
                return {
                    path: item.fullPath,
                    name: item.name,
                    sizeBytes: meta?.size ? Number(meta.size) : 0,
                    createdAt: meta?.timeCreated || null,
                } satisfies BackupFile;
            }));
            rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            setBackups(rows);
        } catch (error) {
            console.error('BackupsTab: list failed', error);
            setMessage({ type: 'error', text: 'No se pudieron listar las copias. ¿Están desplegadas las reglas de Storage?' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const createBackup = async () => {
        setCreating(true);
        setMessage(null);
        try {
            const callable = httpsCallable<unknown, ExportResult>(functions, 'adminExportFirestoreBackup');
            const result = await callable({});
            setMessage({
                type: 'success',
                text: `Copia creada: ${result.data.docCount} documentos, ${formatBytes(result.data.sizeBytes)}.`,
            });
            await load();
        } catch (error) {
            console.error('BackupsTab: export failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo crear la copia de seguridad.') });
        } finally {
            setCreating(false);
        }
    };

    const download = async (backup: BackupFile) => {
        setDownloadingPath(backup.path);
        try {
            const url = await getDownloadURL(ref(storage, backup.path));
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = backup.name;
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        } catch (error) {
            console.error('BackupsTab: download failed', error);
            setMessage({ type: 'error', text: 'No se pudo descargar la copia.' });
        } finally {
            setDownloadingPath(null);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-5">
            <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <DatabaseBackup className="w-6 h-6 text-emerald-300" />
                            Copias de seguridad
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm text-gray-400">
                            Exporta toda la base de datos (documentos y subcolecciones) a un JSON en Storage
                            (<code className="text-xs">backups/</code>, legible solo por jefes) y descárgalo.
                            No incluye las imágenes de Storage ni las cuentas de Auth.
                        </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        <button
                            onClick={load}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Actualizar
                        </button>
                        <button
                            onClick={createBackup}
                            disabled={creating}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />}
                            {creating ? 'Creando copia...' : 'Crear copia ahora'}
                        </button>
                    </div>
                </div>

                {message && (
                    <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                        message.type === 'success'
                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                            : 'border-red-500/25 bg-red-500/10 text-red-200'
                    }`}>
                        {message.text}
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                <h3 className="text-lg font-bold text-white">Copias disponibles ({backups.length})</h3>
                {loading ? (
                    <div className="py-8 text-center text-sm text-gray-400">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                        Cargando...
                    </div>
                ) : backups.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/15 px-4 py-6 text-center text-sm text-gray-500">
                        Aún no hay copias. Crea la primera con el botón de arriba.
                    </p>
                ) : (
                    <div className="mt-4 space-y-2">
                        {backups.map((backup) => (
                            <div key={backup.path} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 px-4 py-3">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-mono text-sm text-white">{backup.name}</p>
                                    <p className="text-xs text-gray-500">
                                        {backup.createdAt ? new Date(backup.createdAt).toLocaleString('es-ES') : 'Fecha desconocida'}
                                        {backup.sizeBytes ? ` · ${formatBytes(backup.sizeBytes)}` : ''}
                                    </p>
                                </div>
                                <button
                                    onClick={() => download(backup)}
                                    disabled={downloadingPath === backup.path}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50"
                                >
                                    {downloadingPath === backup.path ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                    Descargar
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

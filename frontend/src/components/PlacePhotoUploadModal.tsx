import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { FirebaseError } from 'firebase/app';
import type { User } from 'firebase/auth';
import { Camera, ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { db, storage } from '../firebase';
import { PhotoEditorModal, type ProcessedPhoto } from './PhotoEditorModal';



const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function getUploadErrorMessage(error: unknown): string {
    if (error instanceof FirebaseError) {
        if (error.code === 'storage/unauthorized') {
            return 'No tienes permisos para subir fotos. Revisa permisos de la app y vuelve a iniciar sesión.';
        }
        if (error.code === 'storage/retry-limit-exceeded' || error.code === 'storage/canceled') {
            return 'La subida se interrumpió. Comprueba tu conexión e inténtalo de nuevo.';
        }
        if (error.code === 'storage/quota-exceeded') {
            return 'No hay espacio disponible para guardar más fotos ahora mismo. Inténtalo más tarde.';
        }
        if (error.code === 'permission-denied') {
            return 'No tienes permisos para guardar la foto del lugar.';
        }
    }

    return 'No se pudieron subir las fotos. Revisa permisos o inténtalo de nuevo.';
}

interface PlacePhotoUploadModalProps {
    isOpen: boolean;
    placeId: string;
    placeName: string;
    user: User | null;
    onClose: () => void;
    onUploaded: () => void;
}

export const PlacePhotoUploadModal: React.FC<PlacePhotoUploadModalProps> = ({
    isOpen,
    placeId,
    placeName,
    user,
    onClose,
    onUploaded,
}) => {
    const [selectedFilesForEditor, setSelectedFilesForEditor] = useState<File[]>([]);
    const [isPhotoEditorOpen, setIsPhotoEditorOpen] = useState(false);
    const [processedPhotos, setProcessedPhotos] = useState<ProcessedPhoto[]>([]);
    const [captions, setCaptions] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const oversizedCount = useMemo(() => processedPhotos.filter(photo => photo.blob.size > MAX_UPLOAD_BYTES).length, [processedPhotos]);

    if (!isOpen) return null;

    const resetAndClose = () => {
        if (uploading) return;
        setSelectedFilesForEditor([]);
        setProcessedPhotos([]);
        setCaptions([]);
        setError(null);
        onClose();
    };

    const resetState = () => {
        setSelectedFilesForEditor([]);
        setProcessedPhotos([]);
        setCaptions([]);
        setError(null);
    };

    const openEditorWithFiles = (files: File[]) => {
        if (files.length === 0) return;
        setSelectedFilesForEditor(files.slice(0, 3));
        setIsPhotoEditorOpen(true);
    };

    const handleUpload = async () => {
        if (!user) {
            setError('Inicia sesión para subir fotos del lugar.');
            return;
        }
        if (processedPhotos.length === 0) {
            setError('Añade al menos una foto.');
            return;
        }

        if (oversizedCount > 0) {
            setError(oversizedCount === 1
                ? 'Una foto supera el tamaño máximo de 10 MB. Reencuádra la imagen o usa otra más ligera.'
                : 'Hay fotos que superan el tamaño máximo de 10 MB. Reencuádralas o usa imágenes más ligeras.');
            return;
        }

        setUploading(true);
        setError(null);
        try {
            let firstUrl = '';
            for (let i = 0; i < processedPhotos.length; i++) {
                const photo = processedPhotos[i];
                const fileName = `${Date.now()}-${i}.jpg`;
                const storagePath = `places/${placeId}/${user.uid}/${fileName}`;
                const storageRef = ref(storage, storagePath);
                const snapshot = await uploadBytes(storageRef, photo.blob, { contentType: 'image/jpeg' });
                const url = await getDownloadURL(snapshot.ref);
                if (!firstUrl) firstUrl = url;

                await addDoc(collection(db, 'places', placeId, 'photos'), {
                    url,
                    caption: captions[i]?.trim() || '',
                    storagePath,
                    placeId,
                    placeName,
                    userId: user.uid,
                    userName: user.displayName || user.email || 'Usuario',
                    userPhoto: user.photoURL || '',
                    source: 'user_upload',
                    createdAt: serverTimestamp(),
                });
            }

            if (firstUrl) {
                await setDoc(doc(db, 'places', placeId), {
                    userPhotoUrl: firstUrl,
                    lastUserPhotoAt: serverTimestamp(),
                }, { merge: true });
            }

            onUploaded();
            resetState();
            onClose();
        } catch (err) {
            console.error('Place photo upload failed', err);
            setError(getUploadErrorMessage(err));
        } finally {
            setUploading(false);
        }
    };

    return createPortal(
        <>
            <div className="fixed inset-0 z-[9998] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-6">
                <div className="w-full sm:max-w-xl max-h-[92dvh] bg-[var(--lt-bg)] border border-white/10 sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4 bg-[var(--lt-card-strong)]">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-2xl bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] flex items-center justify-center shrink-0">
                                <Camera className="w-5 h-5 text-[var(--lt-accent)]" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-lg font-bold text-white leading-tight">Fotos del lugar</h2>
                                <p className="text-xs text-gray-500 truncate">{placeName}</p>
                            </div>
                        </div>
                        <button onClick={resetAndClose} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-5 overflow-y-auto subtle-scrollbar space-y-4">
                        {processedPhotos.length > 0 ? (
                            <div className="space-y-4">
                                {processedPhotos.map((photo, index) => (
                                    <div key={index} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                                        <div className="aspect-[4/3] bg-gray-900">
                                            <img src={photo.dataUrl} alt="" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="p-3 space-y-2">
                                            <input
                                                value={captions[index] || ''}
                                                maxLength={120}
                                                onChange={(event) => {
                                                    const next = [...captions];
                                                    next[index] = event.target.value;
                                                    setCaptions(next);
                                                }}
                                                placeholder="Pie de foto opcional"
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[var(--lt-accent-border)]"
                                            />
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] text-gray-600">{captions[index]?.length || 0}/120</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setProcessedPhotos(prev => prev.filter((_, i) => i !== index));
                                                        setCaptions(prev => prev.filter((_, i) => i !== index));
                                                    }}
                                                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                    Quitar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedFilesForEditor(processedPhotos.map((photo, index) => new File([photo.blob], `place-photo-${index}.jpg`, { type: 'image/jpeg' })));
                                        setIsPhotoEditorOpen(true);
                                    }}
                                    className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-sm font-semibold transition-colors"
                                >
                                    Reencuadrar fotos
                                </button>
                            </div>
                        ) : (
                            <div
                                className="h-48 rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] hover:bg-[var(--lt-accent-soft)] hover:border-[var(--lt-accent-border)] transition-colors flex flex-col items-center justify-center cursor-pointer text-center p-5"
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    openEditorWithFiles(Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/')));
                                }}
                                onClick={() => document.getElementById('place-photo-upload')?.click()}
                            >
                                <ImagePlus className="w-9 h-9 text-[var(--lt-accent)] mb-3" />
                                <p className="text-sm font-bold text-white">Sube fotos reales del sitio</p>
                                <p className="text-xs text-gray-500 mt-1">Hasta 3 fotos por subida, con pie de foto opcional.</p>
                                <input
                                    id="place-photo-upload"
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    multiple
                                    onChange={(event) => {
                                        openEditorWithFiles(Array.from(event.target.files || []));
                                        event.target.value = '';
                                    }}
                                />
                            </div>
                        )}

                        {error && (
                            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-white/10 bg-[var(--lt-bg-deep)] flex gap-3">
                        <button
                            type="button"
                            disabled={uploading}
                            onClick={resetAndClose}
                            className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            disabled={uploading || processedPhotos.length === 0}
                            onClick={handleUpload}
                            className="flex-1 py-3 rounded-xl bg-[var(--lt-accent)] text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Subir fotos
                        </button>
                    </div>
                </div>
            </div>

            {isPhotoEditorOpen && (
                <PhotoEditorModal
                    initialFiles={selectedFilesForEditor}
                    onClose={() => setIsPhotoEditorOpen(false)}
                    onConfirm={(photos) => {
                        setProcessedPhotos(photos);
                        setCaptions(prev => photos.map((_, index) => prev[index] || ''));
                        setIsPhotoEditorOpen(false);
                    }}
                />
            )}
        </>,
        document.body
    );
};

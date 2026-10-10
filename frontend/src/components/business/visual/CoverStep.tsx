/**
 * Paso 📸 Portada (`heroImageUrl`): subir una foto (recorte 16:9), elegir una
 * de las fotos del local o pegar un enlace que se comprueba antes de usarlo.
 * Sin portada, la ficha usa la foto actual del local.
 */
import React, { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Modal } from '../../ui/Modal';
import { PhotoEditorModal } from '../../PhotoEditorModal';
import { Skeleton } from '../../Skeleton';
import { EmptyState, TextField, kit } from '../kit';
import { ActionChip, TipsLine } from './visualParts';
import { BAD_IMAGE_LINK, COVER_TIPS, normalizeImageUrl } from './visualMeta';
import { fetchImageFile, probeImage } from './coverMedia';
import type { ShowcasePhoto } from './usePlaceShowcase';

export interface CoverStepProps {
    value: string;
    onChange: (url: string) => void;
    /** Sube la foto ya recortada (la pestaña se encarga y pone la URL). */
    onUpload: (blob: Blob, source: File) => void;
    uploading: boolean;
    uploadError: string | null;
    /** La portada actual no carga. */
    broken: boolean;
    onImageError: (url: string) => void;
    /** Original de una foto subida en esta visita (para reencuadrar sin descargarla). */
    getSourceFile: (url: string) => File | undefined;
    photos: ShowcasePhoto[];
    photosLoading: boolean;
    photosFailed: boolean;
    /** La foto que enseña la ficha sin portada (para «↩️ Usar la foto actual del local»). */
    placePhotoUrl?: string;
    /** Para «Empezar por la portada»: recibe el foco. */
    startRef?: React.Ref<HTMLButtonElement>;
}

const firstImage = (files: FileList | File[] | null | undefined): File | null => (
    Array.from(files || []).find((file) => file.type.startsWith('image/')) ?? null
);

export const CoverStep: React.FC<CoverStepProps> = ({
    value,
    onChange,
    onUpload,
    uploading,
    uploadError,
    broken,
    onImageError,
    getSourceFile,
    photos,
    photosLoading,
    photosFailed,
    placePhotoUrl,
    startRef,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const checkRef = useRef(0);
    const [editorFile, setEditorFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [reframing, setReframing] = useState(false);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkText, setLinkText] = useState('');
    const [linkError, setLinkError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);

    const openPicker = () => fileInputRef.current?.click();

    const takeFiles = (files: FileList | File[] | null | undefined) => {
        const file = firstImage(files);
        if (!file) {
            setLocalError('Elige un archivo de imagen (JPG, PNG…) 🖼️');
            return;
        }
        setLocalError(null);
        setEditorFile(file);
    };

    const reframe = async () => {
        setLocalError(null);
        const source = getSourceFile(value);
        if (source) {
            setEditorFile(source);
            return;
        }
        setReframing(true);
        try {
            setEditorFile(await fetchImageFile(value));
        } catch {
            setLocalError('No podemos reencuadrar esta foto aquí. Súbela otra vez para recortarla.');
        } finally {
            setReframing(false);
        }
    };

    const checkLink = async () => {
        const text = linkText.trim();
        if (!text) {
            setLinkError(null);
            return;
        }
        const normalized = normalizeImageUrl(text);
        if ('error' in normalized) {
            setLinkError(normalized.error);
            return;
        }
        const request = ++checkRef.current;
        setChecking(true);
        setLinkError(null);
        const ok = normalized.url === value || await probeImage(normalized.url);
        if (request !== checkRef.current) return;
        setChecking(false);
        if (!ok) {
            setLinkError(BAD_IMAGE_LINK);
            return;
        }
        onChange(normalized.url);
        setLinkText('');
        setLinkOpen(false);
    };

    const pickPhoto = (photo: ShowcasePhoto) => {
        onChange(photo.url);
        setLocalError(null);
        setGalleryOpen(false);
    };

    const error = localError || uploadError;

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
                onChange={(event) => {
                    takeFiles(event.target.files);
                    event.target.value = '';
                }}
            />

            {value ? (
                <div className="space-y-3">
                    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-bg-deep)]">
                        {broken ? (
                            <div className="grid h-full place-items-center p-4 text-center text-sm font-semibold text-[var(--lt-warning)]">
                                <span><span aria-hidden="true" className="mb-1 block text-3xl">🖼️</span>No podemos cargar tu portada</span>
                            </div>
                        ) : (
                            <img
                                key={value}
                                src={value}
                                alt="Tu portada"
                                className="h-full w-full object-cover"
                                onError={() => onImageError(value)}
                            />
                        )}
                        {uploading && <UploadingOverlay />}
                    </div>
                    {broken && (
                        <p role="alert" className="text-sm font-semibold text-[var(--lt-warning)]">
                            ⚠️ Esta foto no se puede ver. Cámbiala o quítala para usar la foto del local.
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <ActionChip emoji="✂️" label="Reencuadrar" onClick={() => void reframe()} busy={reframing} disabled={uploading || broken} />
                        <ActionChip emoji="🔄" label="Cambiar" onClick={openPicker} disabled={uploading} />
                        <ActionChip emoji="🗑️" label="Quitar" onClick={() => onChange('')} disabled={uploading} />
                    </div>
                    <p className={kit.help}>Sin portada se ve la foto actual del local.</p>
                </div>
            ) : (
                <button
                    ref={startRef}
                    type="button"
                    onClick={openPicker}
                    disabled={uploading}
                    onDragOver={(event) => {
                        event.preventDefault();
                        setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(event) => {
                        event.preventDefault();
                        setDragOver(false);
                        takeFiles(event.dataTransfer?.files);
                    }}
                    className={cn(
                        'relative grid aspect-video w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed px-4 text-center transition-colors',
                        kit.focus,
                        dragOver
                            ? 'border-[var(--lt-accent)] bg-[var(--lt-accent-soft)]'
                            : 'border-[var(--lt-accent-border)] bg-[var(--lt-glass)] hover:bg-[var(--lt-accent-soft)]',
                    )}
                >
                    <span className="space-y-1.5">
                        <span aria-hidden="true" className="block text-4xl leading-none">🖼️</span>
                        <span className="block text-base font-bold text-[var(--lt-text)]">Arrastra una foto o toca para elegirla</span>
                        <span className="block text-sm text-[var(--lt-text-muted)]">Mejor en horizontal · mínimo 1600 px</span>
                    </span>
                    {uploading && <UploadingOverlay />}
                </button>
            )}

            {error && <p role="alert" className="text-sm font-semibold text-[var(--lt-danger)]">{error}</p>}

            <div className="flex flex-wrap gap-2">
                <ActionChip emoji="🖼️" label="Elegir de las fotos del local" onClick={() => setGalleryOpen(true)} disabled={uploading} />
                <ActionChip
                    emoji="🔗"
                    label="Pegar un enlace"
                    pressed={linkOpen}
                    onClick={() => {
                        setLinkOpen((open) => !open);
                        setLinkError(null);
                    }}
                    disabled={uploading}
                />
                {value && placePhotoUrl && placePhotoUrl !== value && (
                    <ActionChip
                        emoji="↩️"
                        label="Usar la foto actual del local"
                        onClick={() => {
                            setLocalError(null);
                            onChange('');
                        }}
                        disabled={uploading}
                    />
                )}
            </div>

            {linkOpen && (
                <div className="flex flex-wrap items-start gap-2">
                    <TextField
                        className="min-w-0 flex-1 basis-60"
                        label="Enlace de la foto"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        placeholder="https://…"
                        value={linkText}
                        onChange={(text) => {
                            setLinkText(text);
                            if (linkError) setLinkError(null);
                        }}
                        onBlur={() => void checkLink()}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void checkLink();
                            }
                        }}
                        error={linkError ?? undefined}
                        hint={checking ? 'Comprobando la foto…' : 'Pega el enlace de una foto (JPG, PNG o WebP).'}
                    />
                    <button
                        type="button"
                        onClick={() => void checkLink()}
                        disabled={checking || !linkText.trim()}
                        className={cn(
                            'mt-7 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                            kit.focus,
                            kit.idle,
                        )}
                    >
                        {checking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        Usar enlace
                    </button>
                </div>
            )}

            <TipsLine tips={COVER_TIPS} />

            <Modal isOpen={galleryOpen} onClose={() => setGalleryOpen(false)} title="🖼️ Fotos del local" size="lg">
                <div className="p-4">
                    {photosLoading ? (
                        <div aria-hidden="true" className="grid grid-cols-3 gap-2">
                            {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="aspect-square w-full rounded-xl" />)}
                        </div>
                    ) : photos.length === 0 ? (
                        <EmptyState
                            emoji={photosFailed ? '😕' : '📷'}
                            title={photosFailed ? 'No hemos podido cargar las fotos del local' : 'Aún no hay fotos del local'}
                            text={photosFailed ? 'Inténtalo de nuevo en un rato o sube tu portada.' : 'Sube tu portada desde tu móvil o tu ordenador.'}
                            size="sm"
                            as="p"
                        />
                    ) : (
                        <ul className="grid grid-cols-3 gap-2">
                            {photos.map((photo, index) => {
                                const current = photo.url === value;
                                return (
                                    <li key={photo.id}>
                                        <button
                                            type="button"
                                            aria-pressed={current}
                                            aria-label={photo.caption ? `Usar «${photo.caption}» de portada` : `Usar la foto ${index + 1} de portada`}
                                            onClick={() => pickPhoto(photo)}
                                            className={cn(
                                                'relative block aspect-square w-full overflow-hidden rounded-xl border-2 transition',
                                                kit.focus,
                                                current ? 'border-[var(--lt-accent)]' : 'border-transparent hover:border-[var(--lt-accent-border)]',
                                            )}
                                        >
                                            <img src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                                            {current && (
                                                <span aria-hidden="true" className={cn(kit.checkBubble, 'absolute right-1.5 top-1.5')}>✓</span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </Modal>

            {editorFile && (
                <PhotoEditorModal
                    initialFiles={[editorFile]}
                    lockedAspect="16:9"
                    maxPhotos={1}
                    title="Encuadra tu portada"
                    confirmLabel="Usar esta foto"
                    onClose={() => setEditorFile(null)}
                    onConfirm={(processed) => {
                        const source = editorFile;
                        setEditorFile(null);
                        if (processed[0]) onUpload(processed[0].blob, source);
                    }}
                />
            )}
        </>
    );
};

const UploadingOverlay: React.FC = () => (
    <span role="status" className="absolute inset-0 grid place-items-center bg-[var(--lt-card-strong)]/85 text-sm font-bold text-[var(--lt-text)] backdrop-blur-sm">
        <span className="inline-flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--lt-accent)]" aria-hidden="true" />
            Subiendo tu portada… <span aria-hidden="true">🚀</span>
        </span>
    </span>
);

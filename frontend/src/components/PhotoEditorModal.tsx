import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Plus, X, Loader2, Star, Lock, ZoomIn } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useBackToClose } from '../hooks/useSheetDismiss';
import { useAbilityGate, useMyAbilities } from '../hooks/useAbilities';
import { MAX_FILTERS, PHOTOS_PER_FILTER, abilityMeta } from '../lib/abilities';
import { PHOTO_FILTERS, applyFilterToCanvas, filterCss, photoFilterById, type PhotoFilter } from '../lib/photoFilters';

interface SortablePhotoProps {
    p: PhotoEntry;
    i: number;
    activeIdx: number;
    setActiveIdx: (index: number) => void;
    removePhoto: (index: number) => void;
}

const SortablePhoto = ({ p, i, activeIdx, setActiveIdx, removePhoto }: SortablePhotoProps) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: p.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        border: `2px solid ${activeIdx === i ? 'var(--lt-accent)' : 'rgba(255,255,255,0.1)'}`
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}
            onClick={() => setActiveIdx(i)}
            className="relative shrink-0 w-12 h-12 rounded-xl overflow-hidden cursor-pointer touch-none transition-shadow hover:shadow-lg">
            <img src={p.src} alt="" className="w-full h-full object-cover pointer-events-none" />
            {i === 0 && <div className="absolute top-1 left-1 bg-amber-500 rounded-full p-0.5 shadow-sm"><Star className="w-2.5 h-2.5 fill-current text-white" /></div>}
            <button onPointerDown={e => { e.stopPropagation(); removePhoto(i); }}
                className="absolute top-1 right-1 rounded-full p-0.5 transition-colors z-10"
                style={{ background: 'rgba(0,0,0,0.7)' }}>
                <X className="w-2.5 h-2.5 text-white" />
            </button>
        </div>
    );
};

export interface ProcessedPhoto {
    dataUrl: string;
    blob: Blob;
    isMain: boolean;
}

interface PhotoEntry {
    id: string;
    src: string;
}

interface CropState {
    crop: { x: number; y: number };
    zoom: number;
    croppedAreaPixels: Area | null;
}

const ASPECT_OPTIONS = [
    { key: '1:1', label: '1:1', value: 1 },
    { key: '4:3', label: '4:3', value: 4 / 3 },
    { key: '3:4', label: '3:4', value: 3 / 4 },
    { key: '16:9', label: '16:9', value: 16 / 9 },
    { key: '9:16', label: '9:16', value: 9 / 16 },
] as const;

export type AspectKey = typeof ASPECT_OPTIONS[number]['key'];

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

// Recorte centrado con la proporción pedida (si no se llegó a mover el recorte).
function centeredCrop(width: number, height: number, aspect: number): Area {
    const cropWidth = Math.min(width, height * aspect);
    const cropHeight = cropWidth / aspect;
    return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}

async function applyCrop(imageSrc: string, pixelCrop: Area, maxSize = 1600, filter?: PhotoFilter): Promise<{ dataUrl: string; blob: Blob }> {
    const image = await loadImage(imageSrc);
    const scale = Math.min(1, maxSize / Math.max(pixelCrop.width, pixelCrop.height));
    const outW = Math.round(pixelCrop.width * scale);
    const outH = Math.round(pixelCrop.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    canvas.getContext('2d')!.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, outW, outH);
    applyFilterToCanvas(canvas, filter);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.82));
    return { dataUrl, blob };
}

interface PhotoEditorModalProps {
    initialFiles: File[];
    onConfirm: (photos: ProcessedPhoto[]) => void;
    onClose: () => void;
    /** Proporción fija (p. ej. '16:9' para la portada de Business Pro): oculta el selector de formato. */
    lockedAspect?: AspectKey;
    /** Fotos como máximo (3 por defecto). */
    maxPhotos?: number;
    title?: string;
    confirmLabel?: string;
}

export const PhotoEditorModal: React.FC<PhotoEditorModalProps> = ({
    initialFiles,
    onConfirm,
    onClose,
    lockedAspect,
    maxPhotos = 3,
    title = 'Editar fotos',
    confirmLabel = 'Guardar',
}) => {
    useBodyScrollLock(true);
    useBackToClose(true, onClose);
    const [photos, setPhotos] = useState<PhotoEntry[]>(() =>
        initialFiles.slice(0, maxPhotos).map((f, i) => ({ id: `p${i}-${Date.now()}`, src: URL.createObjectURL(f) }))
    );
    const [activeIdx, setActiveIdx] = useState(0);
    const [aspectKey, setAspectKey] = useState<AspectKey>(lockedAspect ?? '1:1');
    const [cropStates, setCropStates] = useState<Record<string, CropState>>({});
    const [processing, setProcessing] = useState(false);
    // Filtro elegido por foto (premio de «Ojo de Halcón»).
    const [filters, setFilters] = useState<Record<string, string>>({});
    const { filtersUnlocked, photosCount, isJefe, has } = useMyAbilities();
    const gate = useAbilityGate();
    // Sin la medalla, si el premio está encendido, se enseña cómo conseguirlo.
    const filtersTeaser = filtersUnlocked === 0 && !has('photoFilters') && gate('photoFilters', [abilityMeta('photoFilters').badge]);
    // Sin elegir, se abre en Filtros si los hay (como Instagram); los premios pueden llegar un poco después.
    const [tool, setTool] = useState<'filters' | 'crop' | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const aspect = ASPECT_OPTIONS.find(o => o.key === aspectKey)?.value ?? 1;
    const active = photos[activeIdx];
    const activeState: CropState = active
        ? (cropStates[active.id] ?? { crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null })
        : { crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null };
    const activeFilter = active ? photoFilterById(filters[active.id]) : undefined;
    const unlockedFilters = PHOTO_FILTERS.slice(0, filtersUnlocked);
    const nextFilterAt = filtersUnlocked > 0 && filtersUnlocked < MAX_FILTERS && !isJefe
        ? (Math.floor(photosCount / PHOTOS_PER_FILTER) + 1) * PHOTOS_PER_FILTER
        : null;

    const updateCropState = useCallback((id: string, patch: Partial<CropState>) => {
        setCropStates(prev => ({ ...prev, [id]: { ...(prev[id] ?? { crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null }), ...patch } }));
    }, []);

    const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []).slice(0, maxPhotos - photos.length);
        setPhotos(prev => [...prev, ...files.map((f, i) => ({ id: `p${Date.now()}-${i}`, src: URL.createObjectURL(f) }))]);
        e.target.value = '';
    };

    const removePhoto = (idx: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== idx));
        setActiveIdx(prev => Math.max(0, idx <= prev ? prev - 1 : prev));
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(KeyboardSensor)
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = photos.findIndex(i => i.id === active.id);
            const newIndex = photos.findIndex(i => i.id === over.id);

            setPhotos(items => arrayMove(items, oldIndex, newIndex));

            if (activeIdx === oldIndex) {
                setActiveIdx(newIndex);
            } else if (oldIndex < activeIdx && newIndex >= activeIdx) {
                setActiveIdx(activeIdx - 1);
            } else if (oldIndex > activeIdx && newIndex <= activeIdx) {
                setActiveIdx(activeIdx + 1);
            }
        }
    };

    const headerTouchStartY = useRef<number | null>(null);

    const handleConfirm = async () => {
        if (!photos.length) { onConfirm([]); return; }
        setProcessing(true);
        try {
            const results: ProcessedPhoto[] = [];
            for (let i = 0; i < photos.length; i++) {
                const p = photos[i];
                const img = await loadImage(p.src);
                const crop: Area = cropStates[p.id]?.croppedAreaPixels
                    ?? (lockedAspect ? centeredCrop(img.naturalWidth, img.naturalHeight, aspect) : { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight });
                results.push({ ...(await applyCrop(p.src, crop, 1600, photoFilterById(filters[p.id]))), isMain: i === 0 });
            }
            onConfirm(results);
        } finally { setProcessing(false); }
    };

    const showTabs = filtersUnlocked > 0 || filtersTeaser;
    const activeTool = showTabs ? (tool ?? 'filters') : 'crop';
    const label = 'text-[11px] font-bold leading-none';

    return createPortal(
        <div className="fixed top-0 left-0 w-full h-[100dvh] z-[10010] lt-mobile-overlay bg-black/80 backdrop-blur-md flex items-center justify-center sm:p-6 animate-slide-up-modal sm:animate-fade-in origin-bottom sm:origin-center">
            <div className="w-full h-full max-w-2xl bg-[var(--lt-bg)] sm:h-[92vh] sm:rounded-3xl shadow-2xl overflow-hidden" style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', gridTemplateColumns: 'minmax(0, 1fr)', boxShadow: '0 0 0 1px rgba(255,255,255,0.06)' }}>
                {/* Cabecera: cerrar, título y guardar (como en Instagram) */}
                <div className="flex items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.6rem)]"
                    onTouchStart={e => { headerTouchStartY.current = e.touches[0].clientY; }}
                    onTouchEnd={e => {
                        if (headerTouchStartY.current !== null && e.changedTouches[0].clientY - headerTouchStartY.current > 80) onClose();
                        headerTouchStartY.current = null;
                    }}>
                    <button onClick={onClose} disabled={processing} aria-label="Descartar"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--lt-text)] transition-colors hover:bg-white/5 active:scale-95">
                        <X className="h-6 w-6" />
                    </button>
                    <div className="min-w-0 flex-1 text-center">
                        <h2 className="truncate text-base font-black leading-tight text-[var(--lt-text)]">{title}</h2>
                        <p className="truncate text-[11px] text-[var(--lt-text-muted)]">
                            {lockedAspect ? `Formato ${lockedAspect} · arrastra y haz zoom` : photos.length > 1 ? `Foto ${activeIdx + 1} de ${photos.length}` : 'Arrastra y pellizca para encuadrar'}
                        </p>
                    </div>
                    <button onClick={handleConfirm} disabled={processing || !photos.length}
                        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-black lt-on-accent shadow-lg shadow-[var(--lt-accent-shadow)] transition-transform active:scale-95 disabled:opacity-50"
                        style={{ backgroundImage: 'var(--lt-accent-grad)' }}>
                        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
                        {confirmLabel}
                    </button>
                </div>

                {/* La foto, a todo lo que dé */}
                <div style={{ position: 'relative', overflow: 'hidden', background: '#000' }}>
                    {active ? (
                        <Cropper
                            image={active.src}
                            crop={activeState.crop}
                            zoom={activeState.zoom}
                            aspect={aspect}
                            onCropChange={c => updateCropState(active.id, { crop: c })}
                            onZoomChange={z => updateCropState(active.id, { zoom: z })}
                            onCropComplete={(_, px) => updateCropState(active.id, { croppedAreaPixels: px })}
                            style={{
                                containerStyle: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#000' },
                                cropAreaStyle: { border: '1.5px solid rgba(255,255,255,0.85)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)', borderRadius: 4 },
                                mediaStyle: activeFilter ? { filter: filterCss(activeFilter) } : undefined,
                            }}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                            Añade una foto para empezar
                        </div>
                    )}
                </div>

                {/* Herramientas */}
                <div className="bg-[var(--lt-bg-deep)] pb-[env(safe-area-inset-bottom)]" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {/* Fotos: tocar para editar, arrastrar para ordenar (la primera es la portada) */}
                    {(maxPhotos > 1 || photos.length > 1) && (
                        <div className="flex items-center gap-2 px-4 pt-3 overflow-x-auto touch-pan-x">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={photos.map(p => p.id)} strategy={horizontalListSortingStrategy}>
                                    {photos.map((p, i) => (
                                        <SortablePhoto key={p.id} p={p} i={i} activeIdx={activeIdx} setActiveIdx={setActiveIdx} removePhoto={removePhoto} />
                                    ))}
                                </SortableContext>
                            </DndContext>
                            {photos.length < maxPhotos && (
                                <button onClick={() => fileInputRef.current?.click()} aria-label="Añadir foto"
                                    className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all"
                                    style={{ border: '2px dashed rgba(255,255,255,0.2)' }}>
                                    <Plus className="w-5 h-5 text-gray-500" />
                                </button>
                            )}
                        </div>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" multiple={maxPhotos > 1} className="hidden" onChange={addFiles} />

                    <div className="min-h-[124px] px-4 py-3">
                        {activeTool === 'filters' && active && filtersUnlocked > 0 && (
                            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 touch-pan-x" role="radiogroup" aria-label="Filtro de la foto">
                                {[undefined, ...unlockedFilters].map((f) => {
                                    const selected = (activeFilter?.id ?? null) === (f?.id ?? null);
                                    return (
                                        <button key={f?.id ?? 'none'} type="button" role="radio" aria-checked={selected} aria-label={f ? f.name : 'Original'}
                                            onClick={() => setFilters(prev => ({ ...prev, [active.id]: f?.id ?? '' }))}
                                            className="shrink-0 flex flex-col items-center gap-2 w-[76px]">
                                            <span className={`${label} truncate max-w-full ${selected ? 'text-[var(--lt-text)]' : 'text-[var(--lt-text-muted)]'}`}>
                                                {f ? f.name : 'Original'}
                                            </span>
                                            <span className={`block h-[76px] w-[76px] overflow-hidden rounded-2xl transition-all ${selected ? 'ring-2 ring-[var(--lt-accent)] ring-offset-2 ring-offset-[var(--lt-bg-deep)]' : ''}`}>
                                                <img src={active.src} alt="" className="h-full w-full object-cover" style={{ filter: filterCss(f) }} />
                                            </span>
                                        </button>
                                    );
                                })}
                                {nextFilterAt && (
                                    <span className="shrink-0 flex flex-col items-center gap-2 w-[76px] opacity-70" title={`Otro filtro a las ${nextFilterAt} fotos`}>
                                        <span className={`${label} text-[var(--lt-text-muted)]`}>{nextFilterAt} fotos</span>
                                        <span className="grid h-[76px] w-[76px] place-items-center rounded-2xl border-2 border-dashed border-white/15">
                                            <Lock className="h-5 w-5 text-[var(--lt-text-muted)]" />
                                        </span>
                                    </span>
                                )}
                            </div>
                        )}

                        {activeTool === 'filters' && filtersTeaser && (
                            <div className="flex items-center gap-3 rounded-2xl border border-[var(--lt-border)] bg-white/[0.03] p-3">
                                <span className="text-3xl" aria-hidden="true">🦅</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-bold text-[var(--lt-text)]">Filtros con la medalla Ojo de Halcón</span>
                                    <span className="block text-xs text-[var(--lt-text-muted)]">
                                        Sube {PHOTOS_PER_FILTER} fotos y estrenas el primero ({Math.min(photosCount, PHOTOS_PER_FILTER)}/{PHOTOS_PER_FILTER}).
                                    </span>
                                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/10">
                                        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (photosCount / PHOTOS_PER_FILTER) * 100)}%`, backgroundImage: 'var(--lt-accent-grad)' }} />
                                    </span>
                                </span>
                            </div>
                        )}

                        {activeTool === 'crop' && (
                            <div className="space-y-3">
                                {!lockedAspect && (
                                    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 touch-pan-x" role="radiogroup" aria-label="Formato de la foto">
                                        {ASPECT_OPTIONS.map(opt => {
                                            const on = aspectKey === opt.key;
                                            const w = opt.value >= 1 ? 22 : Math.round(22 * opt.value);
                                            const h = opt.value >= 1 ? Math.round(22 / opt.value) : 22;
                                            return (
                                                <button key={opt.key} type="button" role="radio" aria-checked={on} onClick={() => setAspectKey(opt.key)}
                                                    className={`flex shrink-0 flex-col items-center gap-1 rounded-2xl border px-3 py-2 transition-colors ${on ? 'border-[var(--lt-accent)] bg-[var(--lt-accent-soft)]' : 'border-[var(--lt-border)] bg-white/[0.03]'}`}>
                                                    <span className="grid h-6 w-6 place-items-center">
                                                        <span className={`block rounded-[3px] border-2 ${on ? 'border-white' : 'border-[var(--lt-text-muted)]'}`} style={{ width: w, height: h }} />
                                                    </span>
                                                    <span className={`${label} ${on ? 'text-[var(--lt-text)]' : 'text-[var(--lt-text-muted)]'}`}>{opt.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {active && (
                                    <label className="flex items-center gap-3">
                                        <ZoomIn className="h-4 w-4 shrink-0 text-[var(--lt-text-muted)]" />
                                        <input type="range" min={1} max={3} step={0.01} value={activeState.zoom} aria-label="Zoom"
                                            onChange={e => updateCropState(active.id, { zoom: Number(e.target.value) })}
                                            className="h-1 w-full cursor-pointer accent-[var(--lt-accent)]" />
                                    </label>
                                )}
                            </div>
                        )}
                    </div>

                    {showTabs && (
                        <nav className="flex border-t border-white/5" aria-label="Herramientas de la foto">
                            {([['filters', 'Filtros'], ['crop', 'Recortar']] as const).map(([id, name]) => (
                                <button key={id} type="button" aria-pressed={activeTool === id} onClick={() => setTool(id)}
                                    className={`flex-1 border-t-2 py-3 text-xs font-black uppercase tracking-widest transition-colors ${activeTool === id ? 'border-[var(--lt-text)] text-[var(--lt-text)]' : 'border-transparent text-[var(--lt-text-muted)]'}`}>
                                    {name}
                                </button>
                            ))}
                        </nav>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

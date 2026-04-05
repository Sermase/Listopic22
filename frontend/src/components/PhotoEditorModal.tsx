import React, { useState, useCallback, useRef } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { ArrowLeft, ArrowRight, Star, Plus, X, Loader2 } from 'lucide-react';

export type BorderType = 'none' | 'black' | 'white' | 'listopic';

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
    { key: '1:1',  label: '1:1',  value: 1 },
    { key: '4:3',  label: '4:3',  value: 4 / 3 },
    { key: '3:4',  label: '3:4',  value: 3 / 4 },
    { key: '16:9', label: '16:9', value: 16 / 9 },
    { key: '9:16', label: '9:16', value: 9 / 16 },
] as const;

type AspectKey = typeof ASPECT_OPTIONS[number]['key'];

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

async function applyCropAndBorder(
    imageSrc: string,
    pixelCrop: Area,
    border: BorderType,
    maxSize = 1920
): Promise<{ dataUrl: string; blob: Blob }> {
    const image = await loadImage(imageSrc);
    const scale = Math.min(1, maxSize / Math.max(pixelCrop.width, pixelCrop.height));
    const outW = Math.round(pixelCrop.width * scale);
    const outH = Math.round(pixelCrop.height * scale);
    const pad = border !== 'none' ? Math.round(Math.min(outW, outH) * 0.05) : 0;
    const cW = outW + pad * 2;
    const cH = outH + pad * 2;

    const canvas = document.createElement('canvas');
    canvas.width = cW;
    canvas.height = cH;
    const ctx = canvas.getContext('2d')!;

    if (border === 'black') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cW, cH);
    } else if (border === 'white') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cW, cH);
    } else if (border === 'listopic') {
        const grad = ctx.createLinearGradient(0, cH, cW, 0);
        grad.addColorStop(0, '#06b6d4');
        grad.addColorStop(0.5, '#2563eb');
        grad.addColorStop(1, '#4f46e5');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cW, cH);
    }

    ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, pad, pad, outW, outH);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.88));
    return { dataUrl, blob };
}

interface PhotoEditorModalProps {
    initialFiles: File[];
    onConfirm: (photos: ProcessedPhoto[]) => void;
    onPublish: (photos: ProcessedPhoto[]) => void;
    onClose: () => void;
}

export const PhotoEditorModal: React.FC<PhotoEditorModalProps> = ({
    initialFiles,
    onConfirm,
    onPublish,
    onClose,
}) => {
    const [photos, setPhotos] = useState<PhotoEntry[]>(() =>
        initialFiles.slice(0, 3).map((f, i) => ({
            id: `p${i}-${Date.now()}`,
            src: URL.createObjectURL(f),
        }))
    );
    const [activeIdx, setActiveIdx] = useState(0);
    const [aspectKey, setAspectKey] = useState<AspectKey>('1:1');
    const [border, setBorder] = useState<BorderType>('none');
    const [cropStates, setCropStates] = useState<Record<string, CropState>>({});
    const [processing, setProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const aspect = ASPECT_OPTIONS.find(o => o.key === aspectKey)?.value ?? 1;
    const active = photos[activeIdx];
    const activeState: CropState = active
        ? (cropStates[active.id] ?? { crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null })
        : { crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null };

    const updateCropState = useCallback((id: string, patch: Partial<CropState>) => {
        setCropStates(prev => ({
            ...prev,
            [id]: { ...(prev[id] ?? { crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null }), ...patch },
        }));
    }, []);

    const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const remaining = 3 - photos.length;
        const newEntries: PhotoEntry[] = files.slice(0, remaining).map((f, i) => ({
            id: `p${Date.now()}-${i}`,
            src: URL.createObjectURL(f),
        }));
        setPhotos(prev => [...prev, ...newEntries]);
        e.target.value = '';
    };

    const removePhoto = (idx: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== idx));
        setActiveIdx(prev => Math.max(0, idx <= prev ? prev - 1 : prev));
    };

    const swap = (a: number, b: number) => {
        setPhotos(prev => {
            const arr = [...prev];
            [arr[a], arr[b]] = [arr[b], arr[a]];
            return arr;
        });
        setActiveIdx(b);
    };

    const processAll = async (): Promise<ProcessedPhoto[]> => {
        const results: ProcessedPhoto[] = [];
        for (let i = 0; i < photos.length; i++) {
            const p = photos[i];
            const state = cropStates[p.id];
            const img = await loadImage(p.src);
            const crop: Area = state?.croppedAreaPixels ?? {
                x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight,
            };
            const result = await applyCropAndBorder(p.src, crop, border);
            results.push({ ...result, isMain: i === 0 });
        }
        return results;
    };

    const handleConfirm = async () => {
        if (!photos.length) { onConfirm([]); return; }
        setProcessing(true);
        try { onConfirm(await processAll()); } finally { setProcessing(false); }
    };

    const handlePublish = async () => {
        if (!photos.length) { onPublish([]); return; }
        setProcessing(true);
        try { onPublish(await processAll()); } finally { setProcessing(false); }
    };

    return (
        <div className="fixed inset-0 z-[300] flex flex-col bg-[#0b1021]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                <button
                    onClick={onClose}
                    className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
                >
                    <ArrowLeft className="w-4 h-4" /> Volver
                </button>
                <span className="text-white font-semibold text-sm">Editar fotos</span>
                <span className="text-gray-500 text-xs">{photos.length} / 3</span>
            </div>

            {/* Thumbnail strip */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0 overflow-x-auto">
                {photos.map((p, i) => (
                    <div
                        key={p.id}
                        onClick={() => setActiveIdx(i)}
                        className={`relative shrink-0 w-16 h-16 rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                            activeIdx === i ? 'border-indigo-500 shadow-lg shadow-indigo-500/30' : 'border-white/10 hover:border-white/30'
                        }`}
                    >
                        <img src={p.src} alt="" className="w-full h-full object-cover" />
                        {i === 0 && (
                            <div className="absolute top-1 left-1 bg-amber-500 rounded-full p-0.5 shadow">
                                <Star className="w-2.5 h-2.5 fill-current text-white" />
                            </div>
                        )}
                        <button
                            onClick={e => { e.stopPropagation(); removePhoto(i); }}
                            className="absolute top-1 right-1 bg-black/70 hover:bg-red-500 rounded-full p-0.5 transition-colors"
                        >
                            <X className="w-2.5 h-2.5 text-white" />
                        </button>
                        <div className="absolute bottom-0.5 inset-x-0.5 flex justify-between">
                            {i > 0 && (
                                <button
                                    onClick={e => { e.stopPropagation(); swap(i - 1, i); }}
                                    className="bg-black/60 hover:bg-black/90 rounded p-0.5 transition-colors"
                                >
                                    <ArrowLeft className="w-2.5 h-2.5 text-white" />
                                </button>
                            )}
                            <div className="flex-1" />
                            {i < photos.length - 1 && (
                                <button
                                    onClick={e => { e.stopPropagation(); swap(i, i + 1); }}
                                    className="bg-black/60 hover:bg-black/90 rounded p-0.5 transition-colors"
                                >
                                    <ArrowRight className="w-2.5 h-2.5 text-white" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {photos.length < 3 && (
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all"
                    >
                        <Plus className="w-5 h-5 text-gray-500" />
                    </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={addFiles} />
            </div>

            {/* Crop area */}
            <div className="flex-1 relative min-h-0">
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
                            containerStyle: { background: '#0b1021' },
                            cropAreaStyle: {
                                border: '2px solid rgba(99,102,241,0.9)',
                                boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
                            },
                        }}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                        Añade una foto para empezar
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="shrink-0 px-4 py-3 space-y-3 border-t border-white/10 bg-[#0f1628]">
                {/* Aspect ratio */}
                <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest w-14 shrink-0">Formato</span>
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                        {ASPECT_OPTIONS.map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => setAspectKey(opt.key)}
                                className={`shrink-0 px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                                    aspectKey === opt.key
                                        ? 'bg-indigo-600 border-indigo-500 text-white'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Border */}
                <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest w-14 shrink-0">Borde</span>
                    <div className="flex gap-2 items-center">
                        <button
                            onClick={() => setBorder('none')} title="Sin borde"
                            className={`w-8 h-8 rounded-lg border-2 transition-all ${border === 'none' ? 'border-indigo-400 scale-110' : 'border-white/10'}`}
                            style={{ backgroundImage: 'repeating-conic-gradient(#333 0% 25%, #1a1a1a 0% 50%)', backgroundSize: '10px 10px' }}
                        />
                        <button
                            onClick={() => setBorder('black')} title="Negro"
                            className={`w-8 h-8 rounded-lg border-2 bg-black transition-all ${border === 'black' ? 'border-indigo-400 scale-110' : 'border-white/10'}`}
                        />
                        <button
                            onClick={() => setBorder('white')} title="Blanco"
                            className={`w-8 h-8 rounded-lg border-2 bg-white transition-all ${border === 'white' ? 'border-indigo-400 scale-110' : 'border-white/10'}`}
                        />
                        <button
                            onClick={() => setBorder('listopic')} title="Listopic"
                            className={`w-8 h-8 rounded-lg border-2 transition-all ${border === 'listopic' ? 'border-indigo-400 scale-110' : 'border-white/10'}`}
                            style={{ background: 'linear-gradient(135deg, #06b6d4, #2563eb, #4f46e5)' }}
                        />
                        <span className="text-[10px] text-gray-600 ml-1">
                            {{none: 'Sin borde', black: 'Negro', white: 'Blanco', listopic: 'Listopic'}[border]}
                        </span>
                    </div>
                </div>

                <p className="text-[10px] text-gray-600 text-center">
                    Pellizca o usa la rueda para hacer zoom · Arrastra para reencuadrar
                </p>
            </div>

            {/* Footer */}
            <div className="shrink-0 flex gap-3 px-4 py-4 border-t border-white/10 bg-[#0b1021]">
                <button
                    onClick={handleConfirm}
                    disabled={processing}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold rounded-xl transition-all active:scale-95 disabled:opacity-50"
                >
                    Guardar fotos
                </button>
                <button
                    onClick={handlePublish}
                    disabled={processing}
                    className="flex-1 py-3 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white text-sm font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2"
                >
                    {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                    Publicar reseña
                </button>
            </div>
        </div>
    );
};

import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { ArrowLeft, ArrowRight, Star, Plus, X, Loader2 } from 'lucide-react';

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

type AspectKey = typeof ASPECT_OPTIONS[number]['key'];

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

async function applyCrop(imageSrc: string, pixelCrop: Area, maxSize = 1920): Promise<{ dataUrl: string; blob: Blob }> {
    const image = await loadImage(imageSrc);
    const scale = Math.min(1, maxSize / Math.max(pixelCrop.width, pixelCrop.height));
    const outW = Math.round(pixelCrop.width * scale);
    const outH = Math.round(pixelCrop.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    canvas.getContext('2d')!.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, outW, outH);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.88));
    return { dataUrl, blob };
}

interface PhotoEditorModalProps {
    initialFiles: File[];
    onConfirm: (photos: ProcessedPhoto[]) => void;
    onClose: () => void;
}

export const PhotoEditorModal: React.FC<PhotoEditorModalProps> = ({ initialFiles, onConfirm, onClose }) => {
    const [photos, setPhotos] = useState<PhotoEntry[]>(() =>
        initialFiles.slice(0, 3).map((f, i) => ({ id: `p${i}-${Date.now()}`, src: URL.createObjectURL(f) }))
    );
    const [activeIdx, setActiveIdx] = useState(0);
    const [aspectKey, setAspectKey] = useState<AspectKey>('1:1');
    const [cropStates, setCropStates] = useState<Record<string, CropState>>({});
    const [processing, setProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const aspect = ASPECT_OPTIONS.find(o => o.key === aspectKey)?.value ?? 1;
    const active = photos[activeIdx];
    const activeState: CropState = active
        ? (cropStates[active.id] ?? { crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null })
        : { crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null };

    const updateCropState = useCallback((id: string, patch: Partial<CropState>) => {
        setCropStates(prev => ({ ...prev, [id]: { ...(prev[id] ?? { crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null }), ...patch } }));
    }, []);

    const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []).slice(0, 3 - photos.length);
        setPhotos(prev => [...prev, ...files.map((f, i) => ({ id: `p${Date.now()}-${i}`, src: URL.createObjectURL(f) }))]);
        e.target.value = '';
    };

    const removePhoto = (idx: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== idx));
        setActiveIdx(prev => Math.max(0, idx <= prev ? prev - 1 : prev));
    };

    const swap = (a: number, b: number) => {
        setPhotos(prev => { const arr = [...prev];[arr[a], arr[b]] = [arr[b], arr[a]]; return arr; });
        setActiveIdx(b);
    };

    const handleConfirm = async () => {
        if (!photos.length) { onConfirm([]); return; }
        setProcessing(true);
        try {
            const results: ProcessedPhoto[] = [];
            for (let i = 0; i < photos.length; i++) {
                const p = photos[i];
                const img = await loadImage(p.src);
                const crop: Area = cropStates[p.id]?.croppedAreaPixels ?? { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
                results.push({ ...(await applyCrop(p.src, crop)), isMain: i === 0 });
            }
            onConfirm(results);
        } finally { setProcessing(false); }
    };

    return createPortal(
        <div className="fixed top-0 left-0 w-full h-[100dvh] z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center sm:p-6">
            <div className="w-full h-full max-w-2xl bg-[#0b1021] sm:rounded-2xl shadow-2xl overflow-hidden" style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', boxShadow: '0 0 0 1px rgba(255,255,255,0.06)' }}>
                {/* Fila 1: Header */}
                <div style={{ background: 'linear-gradient(135deg, #151c36 0%, #111828 100%)', position: 'relative', overflow: 'hidden' }}
                    className="flex shrink-0 items-center justify-between p-5">
                    <div style={{ position: 'absolute', top: -32, left: -32, width: 112, height: 112, borderRadius: '50%', background: 'radial-gradient(circle, #5C7CFA, transparent 70%)', opacity: 0.25, pointerEvents: 'none' }} />
                    <div className="relative flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                            style={{ background: 'linear-gradient(135deg, #5C7CFA, #9b51e0)' }}>📸</div>
                        <div>
                            <h2 className="text-base font-bold text-white leading-tight">Editar fotos</h2>
                            <p className="text-xs mt-0.5" style={{ color: 'rgba(165,180,252,0.6)' }}>{photos.length} / 3 · toca para cambiar</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl border transition-all active:scale-95"
                        style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                </div>

                {/* Fila 2: Crop — recibe 1fr, siempre entre header y footer */}
                <div style={{ position: 'relative', overflow: 'hidden', background: '#0b1021' }}>
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
                                containerStyle: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#0b1021' },
                                cropAreaStyle: { border: '2px solid rgba(99,102,241,0.9)', boxShadow: '0 0 0 9999px rgba(11,16,33,0.78)' },
                            }}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                            Añade una foto para empezar
                        </div>
                    )}
                </div>

                {/* Fila 3: Controles + botones */}
                <div style={{ background: 'linear-gradient(180deg, #0d1226 0%, #0b1021 100%)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {/* Formato */}
                    <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                        <span className="text-gray-500 uppercase tracking-widest w-14 shrink-0" style={{ fontSize: 10 }}>Formato</span>
                        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                            {ASPECT_OPTIONS.map(opt => (
                                <button key={opt.key} onClick={() => setAspectKey(opt.key)}
                                    className="shrink-0 px-3 py-1 rounded-lg text-xs font-bold border transition-all"
                                    style={{
                                        background: aspectKey === opt.key ? '#4f46e5' : 'rgba(255,255,255,0.05)',
                                        borderColor: aspectKey === opt.key ? '#6366f1' : 'rgba(255,255,255,0.1)',
                                        color: aspectKey === opt.key ? '#fff' : '#9ca3af',
                                    }}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Miniaturas */}
                    <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto">
                        {photos.map((p, i) => (
                            <div key={p.id} onClick={() => setActiveIdx(i)}
                                style={{ border: `2px solid ${activeIdx === i ? '#6366f1' : 'rgba(255,255,255,0.1)'}` }}
                                className="relative shrink-0 w-14 h-14 rounded-xl overflow-hidden cursor-pointer transition-all">
                                <img src={p.src} alt="" className="w-full h-full object-cover" />
                                {i === 0 && <div className="absolute top-1 left-1 bg-amber-500 rounded-full p-0.5"><Star className="w-2.5 h-2.5 fill-current text-white" /></div>}
                                <button onClick={e => { e.stopPropagation(); removePhoto(i); }}
                                    className="absolute top-1 right-1 rounded-full p-0.5 transition-colors"
                                    style={{ background: 'rgba(0,0,0,0.7)' }}>
                                    <X className="w-2.5 h-2.5 text-white" />
                                </button>
                                <div className="absolute bottom-0.5 inset-x-0.5 flex justify-between">
                                    {i > 0 && <button onClick={e => { e.stopPropagation(); swap(i - 1, i); }} className="rounded p-0.5" style={{ background: 'rgba(0,0,0,0.6)' }}><ArrowLeft className="w-2.5 h-2.5 text-white" /></button>}
                                    <div className="flex-1" />
                                    {i < photos.length - 1 && <button onClick={e => { e.stopPropagation(); swap(i, i + 1); }} className="rounded p-0.5" style={{ background: 'rgba(0,0,0,0.6)' }}><ArrowRight className="w-2.5 h-2.5 text-white" /></button>}
                                </div>
                            </div>
                        ))}
                        {photos.length < 3 && (
                            <button onClick={() => fileInputRef.current?.click()}
                                className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center transition-all"
                                style={{ border: '2px dashed rgba(255,255,255,0.2)' }}>
                                <Plus className="w-5 h-5 text-gray-500" />
                            </button>
                        )}
                        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={addFiles} />
                    </div>

                    {/* Botones */}
                    <div className="flex gap-3 px-4 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <button onClick={onClose} disabled={processing}
                            className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#d1d5db' }}>
                            Descartar
                        </button>
                        <button onClick={handleConfirm} disabled={processing}
                            className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                            style={{ background: '#4f46e5', color: '#fff' }}>
                            {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                            Guardar fotos
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

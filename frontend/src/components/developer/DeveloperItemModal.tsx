import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../../firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { X, Save, Image as ImageIcon, UploadCloud, AlertCircle } from 'lucide-react';

interface DeveloperItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    collectionName: string;
    item: any | null;
    onSaved: () => void;
}

export const DeveloperItemModal: React.FC<DeveloperItemModalProps> = ({
    isOpen,
    onClose,
    collectionName,
    item,
    onSaved
}) => {
    const [jsonStr, setJsonStr] = useState('{}');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Image upload state
    const [isDragging, setIsDragging] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (item) {
            setJsonStr(JSON.stringify(item, null, 2));
            setError(null);
        } else {
            setJsonStr('{}');
        }
    }, [item]);

    if (!isOpen || !item) return null;

    const handleSaveJson = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const parsed = JSON.parse(jsonStr);
            if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error("El JSON debe ser un objeto válido.");
            }
            if (!confirm(`¿Estás seguro de guardar los cambios en ${collectionName}/${item.id}?`)) {
                setIsSaving(false);
                return;
            }
            const docRef = doc(db, collectionName, item.id);
            await setDoc(docRef, parsed, { merge: true });
            onSaved();
            onClose();
        } catch (err: any) {
            console.error("Error saving doc:", err);
            setError(err.message || "Error al guardar el documento");
        } finally {
            setIsSaving(false);
        }
    };

    // --- Image Upload Logic for Lists ---

    // Simple canvas compression
    const compressImage = (file: File, maxWidth = 1000, quality = 0.8): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                let w = img.width;
                let h = img.height;
                if (w > maxWidth) {
                    h = Math.round((maxWidth / w) * h);
                    w = maxWidth;
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject('No canvas context');
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject('Error creating blob');
                }, 'image/jpeg', quality);
            };
            img.onerror = () => reject('Error loading image');
        });
    };

    const handleFileUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            setError('Formato de archivo no válido. Se requiere una imagen.');
            return;
        }
        setUploadingImage(true);
        setError(null);

        try {
            // Compress
            const compressedBlob = await compressImage(file);

            // Upload to storage
            const extension = file.type === 'image/png' ? 'png' : 'jpg';
            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const path = `list-images/${item.id}/${Date.now()}_${safeName}`;
            const storageRef = ref(storage, path);

            await uploadBytes(storageRef, compressedBlob);
            const downloadUrl = await getDownloadURL(storageRef);

            // Update Firestore doc
            const docRef = doc(db, collectionName, item.id);
            await updateDoc(docRef, { mainImageUrl: downloadUrl });

            // Update JSON editor to reflect new image
            try {
                const parsed = JSON.parse(jsonStr);
                parsed.mainImageUrl = downloadUrl;
                setJsonStr(JSON.stringify(parsed, null, 2));
                // Call onSaved so the parent list refreshes
                onSaved();
            } catch (e) {
                console.warn("Could not patch JSON string, but update succeeded");
            }

        } catch (err: any) {
            console.error('Error uploading image:', err);
            setError(`Error al subir la imagen: ${err.message}`);
        } finally {
            setUploadingImage(false);
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    };

    const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    };

    const previewUrl = item?.mainImageUrl || item?.coverImageUrl || '';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-[#151b2e] border border-white/10 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-white/10 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-white">Editar Documento</h2>
                        <div className="text-sm text-gray-400 mt-1">Colección: {collectionName} | ID: <span className="text-indigo-400 font-mono">{item.id}</span></div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 text-red-400">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <p className="text-sm">{error}</p>
                        </div>
                    )}

                    {/* Image Editor (Lists Only) */}
                    {collectionName === 'lists' && (
                        <div className="bg-black/20 border border-white/10 rounded-xl p-4">
                            <h3 className="text-sm font-bold text-gray-300 uppercase mb-4 flex items-center gap-2">
                                <ImageIcon className="w-4 h-4" /> Imagen de la Lista
                            </h3>
                            <div className="flex flex-col md:flex-row gap-6 items-start">
                                {/* Preview / Dropzone */}
                                <div
                                    onDragOver={onDragOver}
                                    onDragLeave={onDragLeave}
                                    onDrop={onDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`relative w-full md:w-64 aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center overflow-hidden cursor-pointer transition-colors bg-black/40
                                        ${isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 hover:border-white/30 hover:bg-white/5'}
                                    `}
                                >
                                    {uploadingImage ? (
                                        <div className="text-indigo-400 font-bold flex flex-col items-center gap-2">
                                            <UploadCloud className="w-8 h-8 animate-bounce" />
                                            Subiendo...
                                        </div>
                                    ) : previewUrl ? (
                                        <>
                                            <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity flex-col gap-2">
                                                <ImageIcon className="w-8 h-8 text-white" />
                                                <span className="text-white text-sm font-medium">Cambiar imagen</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-gray-500 flex flex-col items-center gap-2">
                                            <ImageIcon className="w-8 h-8" />
                                            <span className="text-sm font-medium">Arrastra o haz clic</span>
                                        </div>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={onFileSelect}
                                />
                                <div className="flex-1 space-y-2 text-sm text-gray-400">
                                    <p>Actualizará automáticamente el campo ` + "`mainImageUrl`" + ` en este documento al terminar de subir a Storage.</p>
                                    <p>URL actual: {item.mainImageUrl ? <a href={item.mainImageUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline inline-block truncate max-w-[200px] align-bottom">{item.mainImageUrl}</a> : 'Sin asignar'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* JSON Editor */}
                    <div className="bg-black/20 border border-white/10 rounded-xl p-4">
                        <label className="text-sm font-bold text-gray-300 uppercase mb-2 block">JSON Viewer / Editor</label>
                        <p className="text-xs text-gray-500 mb-4">Modifica directamente los campos base. Ten cuidado al editar estas propiedades.</p>
                        <textarea
                            value={jsonStr}
                            onChange={(e) => setJsonStr(e.target.value)}
                            className="w-full bg-[#1e253c] border border-white/10 rounded-lg p-4 text-sm font-mono text-gray-300 outline-none focus:border-indigo-500 resize-y min-h-[300px]"
                            spellCheck={false}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/10 flex justify-end gap-3 shrink-0 bg-[#0a0c10]/50">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSaveJson}
                        disabled={isSaving}
                        className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold transition-colors flex items-center gap-2"
                    >
                        {isSaving ? <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> : <Save className="w-4 h-4" />}
                        {isSaving ? 'Guardando...' : 'Guardar JSON'}
                    </button>
                </div>
            </div>
        </div>
    );
};

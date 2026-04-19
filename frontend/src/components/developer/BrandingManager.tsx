import React, { useState, useRef } from 'react';
import { useAppConfig } from '../../context/AppConfigContext';
import { db, storage } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Upload, Save, Layout, Image as ImageIcon, Type, Globe, CheckCircle, AlertCircle } from 'lucide-react';

export const BrandingManager: React.FC = () => {
    const config = useAppConfig();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Form State (initialize with current config)
    const [logoType, setLogoType] = useState<'default' | 'image'>(config.logoType);
    const [faviconType, setFaviconType] = useState<'default' | 'image'>(config.faviconType || 'default');
    const [appName, setAppName] = useState(config.appName);
    const [appDescription, setAppDescription] = useState(config.appDescription);
    const [logoPreview, setLogoPreview] = useState<string | null>(config.logoUrl || null);
    const [faviconPreview, setFaviconPreview] = useState<string | null>(config.faviconUrl || null);

    const logoInputRef = useRef<HTMLInputElement>(null);
    const faviconInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'favicon') => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];

        // Create local preview
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (type === 'logo') setLogoPreview(ev.target?.result as string);
            else {
                setFaviconPreview(ev.target?.result as string);
                setFaviconType('image'); // Auto-switch to image when uploading
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        setLoading(true);
        setMessage(null);

        try {
            let newLogoUrl = config.logoUrl;
            let newFaviconUrl = config.faviconUrl;

            // Upload Logo if changed
            if (logoInputRef.current?.files?.length) {
                const file = logoInputRef.current.files[0];
                const storageRef = ref(storage, `branding/logo_${Date.now()}.png`);
                await uploadBytes(storageRef, file);
                newLogoUrl = await getDownloadURL(storageRef);
            }

            // Upload Favicon if changed
            if (faviconInputRef.current?.files?.length) {
                const file = faviconInputRef.current.files[0];
                const storageRef = ref(storage, `branding/favicon_${Date.now()}.png`);
                await uploadBytes(storageRef, file);
                newFaviconUrl = await getDownloadURL(storageRef);
            }

            // Save Config to Firestore
            await setDoc(doc(db, 'config', 'app'), {
                logoType,
                faviconType,
                appName,
                appDescription,
                logoUrl: newLogoUrl || null,
                faviconUrl: newFaviconUrl || null,
                updatedAt: new Date()
            }, { merge: true });

            setMessage({ type: 'success', text: 'Configuración actualizada correctamente' });
        } catch (error: any) {
            console.error("Error saving branding:", error);
            setMessage({ type: 'error', text: error.message || 'Error al guardar' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <Layout className="w-6 h-6 text-pink-500" /> Gestión de Marca
            </h2>

            {/* MESSAGE ALERT */}
            {message && (
                <div className={`p-4 rounded-xl border flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                    {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    {message.text}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* --- LOGO SETTINGS --- */}
                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6 space-y-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-indigo-400" /> Logotipo Principal
                    </h3>

                    {/* Type Selection */}
                    <div className="flex gap-4 p-1 bg-black/20 rounded-lg">
                        <button
                            onClick={() => setLogoType('default')}
                            className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${logoType === 'default' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Default (CSS)
                        </button>
                        <button
                            onClick={() => setLogoType('image')}
                            className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${logoType === 'image' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Imagen Personalizada
                        </button>
                    </div>

                    {/* Preview Area */}
                    <div className="h-32 bg-black/40 rounded-xl border border-dashed border-white/10 flex items-center justify-center overflow-hidden relative group">
                        {logoType === 'default' ? (
                            <div className="flex items-center gap-3">
                                <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
                                    <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                                </div>
                                <span className="text-xl font-bold text-white tracking-tight">LISTOPIC</span>
                            </div>
                        ) : (
                            logoPreview ? (
                                <img src={logoPreview} alt="Logo Preview" className="h-full object-contain" />
                            ) : (
                                <span className="text-gray-500 text-sm">Sin imagen seleccionada</span>
                            )
                        )}

                        {/* Overlay Upload Button (Only for Image Type) */}
                        {logoType === 'image' && (
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button
                                    onClick={() => logoInputRef.current?.click()}
                                    className="px-4 py-2 bg-white text-black font-bold rounded-lg flex items-center gap-2"
                                >
                                    <Upload className="w-4 h-4" /> Cambiar
                                </button>
                            </div>
                        )}
                    </div>

                    <input
                        type="file"
                        ref={logoInputRef}
                        className="hidden"
                        accept="image/png,image/jpeg,image/svg+xml"
                        onChange={(e) => handleFileChange(e, 'logo')}
                    />

                    <p className="text-xs text-gray-500">
                        * Default usa el logo CSS animado. Imagen reemplaza todo el bloque del logo en el Navbar. Recomendado PNG transparente o SVG.
                    </p>
                </div>

                {/* --- FAVICON SETTINGS --- */}
                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6 space-y-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Globe className="w-5 h-5 text-indigo-400" /> Favicon (Navegador)
                    </h3>

                    {/* Type Selection */}
                    <div className="flex gap-4 p-1 bg-black/20 rounded-lg">
                        <button
                            onClick={() => setFaviconType('default')}
                            className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${faviconType === 'default' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Default (Logo)
                        </button>
                        <button
                            onClick={() => setFaviconType('image')}
                            className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${faviconType === 'image' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Imagen Personalizada
                        </button>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-black/40 rounded-xl border border-dashed border-white/10 flex items-center justify-center shrink-0 relative group">
                            {faviconType === 'default' ? (
                                <img src="/default_favicon.svg" className="w-10 h-10 object-contain" alt="Default Favicon" />
                            ) : (
                                faviconPreview ? (
                                    <img src={faviconPreview} className="w-10 h-10 object-contain" alt="Custom Favicon" />
                                ) : (
                                    <span className="text-gray-500 text-xs text-center px-2">Sin imagen</span>
                                )
                            )}

                            {faviconType === 'image' && (
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                                    <button
                                        onClick={() => faviconInputRef.current?.click()}
                                        className="p-2 bg-white text-black rounded-lg"
                                    >
                                        <Upload className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-gray-300 mb-2">Icono de pestaña</p>
                            <p className="text-xs text-gray-500">
                                {faviconType === 'default'
                                    ? 'Usa el logotipo degradado de la aplicación.'
                                    : 'Sube tu propia imagen (64x64px o SVG recomendado).'
                                }
                            </p>
                        </div>
                    </div>
                    <input
                        type="file"
                        ref={faviconInputRef}
                        className="hidden"
                        accept="image/png,image/x-icon,image/svg+xml,image/jpeg"
                        onChange={(e) => handleFileChange(e, 'favicon')}
                    />
                </div>

                {/* --- SEO & METADATA --- */}
                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6 space-y-6 md:col-span-2">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Type className="w-5 h-5 text-indigo-400" /> Metadatos (SEO)
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Nombre de la App</label>
                            <input
                                type="text"
                                value={appName}
                                onChange={(e) => setAppName(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                placeholder="Listopic"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Keywords (Separado por comas)</label>
                            <input
                                type="text"
                                defaultValue={config.keywords} // using default for now, could add state
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                placeholder="listas, social, app"
                                disabled // Just visual for now unless we add state
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Descripción</label>
                            <textarea
                                value={appDescription}
                                onChange={(e) => setAppDescription(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none min-h-[80px]"
                                placeholder="Descripción corta de la aplicación..."
                            />
                        </div>
                    </div>
                </div>

            </div>

            {/* Footer Actions */}
            <div className="flex justify-end pt-6 border-t border-white/5">
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
                    Guardar Cambios
                </button>
            </div>
        </div>
    );
};

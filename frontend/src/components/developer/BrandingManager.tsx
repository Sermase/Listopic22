import React, { useState, useRef } from 'react';
import { useAppConfig } from '../../context/AppConfigContext';
import { THEMES } from '../../context/ThemeContext';
import type { ThemeId } from '../../context/ThemeContext';
import { db, storage } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Upload, Save, Layout, Image as ImageIcon, Type, Globe, CheckCircle, AlertCircle, X } from 'lucide-react';

type ThemeLogoKey = `logoUrl${Capitalize<ThemeId>}`;

function themeLogoKey(id: ThemeId): ThemeLogoKey {
    return `logoUrl${id.charAt(0).toUpperCase()}${id.slice(1)}` as ThemeLogoKey;
}

export const BrandingManager: React.FC = () => {
    const config = useAppConfig();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [logoType, setLogoType] = useState<'default' | 'image'>(config.logoType);
    const [faviconType, setFaviconType] = useState<'default' | 'image'>(config.faviconType || 'default');
    const [appName, setAppName] = useState(config.appName);
    const [appDescription, setAppDescription] = useState(config.appDescription);

    // Global logo (fallback)
    const [logoPreview, setLogoPreview] = useState<string | null>(config.logoUrl || null);
    const logoInputRef = useRef<HTMLInputElement>(null);

    // Per-theme logos
    const [themePreviews, setThemePreviews] = useState<Partial<Record<ThemeId, string | null>>>({
        dark: config.logoUrlDark || null,
        light: config.logoUrlLight || null,
        warm: config.logoUrlWarm || null,
        cool: config.logoUrlCool || null,
    });
    const themeInputRefs: Record<ThemeId, React.RefObject<HTMLInputElement>> = {
        dark: useRef<HTMLInputElement>(null),
        light: useRef<HTMLInputElement>(null),
        warm: useRef<HTMLInputElement>(null),
        cool: useRef<HTMLInputElement>(null),
    };

    // Track which theme files have been selected
    const [pendingThemeFiles, setPendingThemeFiles] = useState<Partial<Record<ThemeId, File>>>({});

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'favicon' | ThemeId) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
            const url = ev.target?.result as string;
            if (type === 'logo') {
                setLogoPreview(url);
            } else if (['dark', 'light', 'warm', 'cool'].includes(type as string)) {
                const tid = type as ThemeId;
                setThemePreviews(prev => ({ ...prev, [tid]: url }));
                setPendingThemeFiles(prev => ({ ...prev, [tid]: file }));
            }
        };
        reader.readAsDataURL(file);
    };

    const [faviconPreview, setFaviconPreview] = useState<string | null>(config.faviconUrl || null);
    const faviconInputRef = useRef<HTMLInputElement>(null);
    const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
            setFaviconPreview(ev.target?.result as string);
            setFaviconType('image');
        };
        reader.readAsDataURL(file);
    };

    const handleClearThemeLogo = (tid: ThemeId) => {
        setThemePreviews(prev => ({ ...prev, [tid]: null }));
        setPendingThemeFiles(prev => {
            const next = { ...prev };
            delete next[tid];
            return next;
        });
        if (themeInputRefs[tid].current) themeInputRefs[tid].current!.value = '';
    };

    const handleSave = async () => {
        setLoading(true);
        setMessage(null);
        try {
            let newLogoUrl = config.logoUrl;
            let newFaviconUrl = config.faviconUrl;

            if (logoInputRef.current?.files?.length) {
                const file = logoInputRef.current.files[0];
                const storageRef = ref(storage, `branding/logo_${Date.now()}.png`);
                await uploadBytes(storageRef, file, { contentType: file.type || 'image/png' });
                newLogoUrl = await getDownloadURL(storageRef);
            }

            if (faviconInputRef.current?.files?.length) {
                const file = faviconInputRef.current.files[0];
                const storageRef = ref(storage, `branding/favicon_${Date.now()}.png`);
                await uploadBytes(storageRef, file, { contentType: file.type || 'image/png' });
                newFaviconUrl = await getDownloadURL(storageRef);
            }

            // Upload per-theme logos
            const themeLogoUpdates: Partial<Record<ThemeLogoKey, string | null>> = {};
            for (const theme of THEMES) {
                const key = themeLogoKey(theme.id);
                if (pendingThemeFiles[theme.id]) {
                    const file = pendingThemeFiles[theme.id]!;
                    const storageRef = ref(storage, `branding/logo_${theme.id}_${Date.now()}.png`);
                    await uploadBytes(storageRef, file, { contentType: file.type || 'image/png' });
                    themeLogoUpdates[key] = await getDownloadURL(storageRef);
                } else if (themePreviews[theme.id] === null && (config as any)[key]) {
                    // Explicitly cleared
                    themeLogoUpdates[key] = null;
                }
            }

            await setDoc(doc(db, 'config', 'app'), {
                logoType,
                faviconType,
                appName,
                appDescription,
                logoUrl: newLogoUrl || null,
                faviconUrl: newFaviconUrl || null,
                ...themeLogoUpdates,
                updatedAt: new Date(),
            }, { merge: true });

            setPendingThemeFiles({});
            setMessage({ type: 'success', text: 'Configuración actualizada correctamente' });
        } catch (error: any) {
            console.error('Error saving branding:', error);
            setMessage({ type: 'error', text: error.message || 'Error al guardar' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
            <h2 className="text-2xl font-bold text-[var(--lt-text)] mb-6 flex items-center gap-2">
                <Layout className="w-6 h-6 text-pink-500" /> Gestión de Marca
            </h2>

            {message && (
                <div className={`p-4 rounded-xl border flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                    {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    {message.text}
                </div>
            )}

            {/* --- PER-THEME LOGOS --- */}
            <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6 space-y-5">
                <h3 className="text-lg font-bold text-[var(--lt-text)] flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-[var(--lt-accent)]" /> Logos por Tema
                </h3>
                <p className="text-xs text-[var(--lt-text-muted)]">
                    Cada tema puede tener su propio logo. Si un tema no tiene logo propio, usa el logo global de abajo.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {THEMES.map((t) => {
                        const preview = themePreviews[t.id];
                        const hasPending = !!pendingThemeFiles[t.id];
                        return (
                            <div key={t.id} className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="w-3 h-3 rounded-full shrink-0"
                                        style={{ backgroundColor: t.preview.accent }}
                                    />
                                    <span className="text-xs font-bold text-[var(--lt-text)]">{t.label}</span>
                                    {hasPending && (
                                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full ml-auto">pendiente</span>
                                    )}
                                </div>

                                <div
                                    className="relative h-24 rounded-xl border border-dashed border-white/10 flex items-center justify-center overflow-hidden group cursor-pointer"
                                    style={{ backgroundColor: t.preview.bg }}
                                    onClick={() => themeInputRefs[t.id].current?.click()}
                                >
                                    {preview ? (
                                        <img src={preview} alt={`Logo ${t.label}`} className="h-12 w-full object-contain px-2" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-1 text-white/30">
                                            <Upload className="w-5 h-5" />
                                            <span className="text-[10px]">Subir</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Upload className="w-5 h-5 text-white" />
                                    </div>
                                    {preview && (
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleClearThemeLogo(t.id); }}
                                            className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors z-10"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    ref={themeInputRefs[t.id]}
                                    className="hidden"
                                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                                    onChange={(e) => handleFileChange(e, t.id)}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* --- GLOBAL LOGO FALLBACK --- */}
                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6 space-y-6">
                    <h3 className="text-lg font-bold text-[var(--lt-text)] flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-[var(--lt-accent)]" /> Logo Global (fallback)
                    </h3>

                    <div className="flex gap-4 p-1 bg-black/20 rounded-lg">
                        <button onClick={() => setLogoType('default')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${logoType === 'default' ? 'bg-[var(--lt-accent)] text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
                            Default (CSS)
                        </button>
                        <button onClick={() => setLogoType('image')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${logoType === 'image' ? 'bg-[var(--lt-accent)] text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
                            Imagen
                        </button>
                    </div>

                    <div className="h-32 bg-black/40 rounded-xl border border-dashed border-white/10 flex items-center justify-center overflow-hidden relative group">
                        {logoType === 'default' ? (
                            <div className="flex items-center gap-3">
                                <div className="relative w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ backgroundImage: 'var(--lt-brand-mark)' }}>
                                    <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                                </div>
                                <span className="text-xl font-bold text-white tracking-tight">LISTOPIC</span>
                            </div>
                        ) : (
                            logoPreview
                                ? <img src={logoPreview} alt="Logo Preview" className="h-full object-contain" />
                                : <span className="text-gray-500 text-sm">Sin imagen seleccionada</span>
                        )}
                        {logoType === 'image' && (
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button onClick={() => logoInputRef.current?.click()} className="px-4 py-2 bg-white text-black font-bold rounded-lg flex items-center gap-2">
                                    <Upload className="w-4 h-4" /> Cambiar
                                </button>
                            </div>
                        )}
                    </div>
                    <input type="file" ref={logoInputRef} className="hidden" accept="image/png,image/jpeg,image/svg+xml" onChange={(e) => handleFileChange(e, 'logo')} />
                    <p className="text-xs text-[var(--lt-text-muted)]">Se usa cuando el tema activo no tiene logo propio. PNG transparente o SVG recomendado.</p>
                </div>

                {/* --- FAVICON --- */}
                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6 space-y-6">
                    <h3 className="text-lg font-bold text-[var(--lt-text)] flex items-center gap-2">
                        <Globe className="w-5 h-5 text-[var(--lt-accent)]" /> Favicon (Navegador)
                    </h3>
                    <div className="flex gap-4 p-1 bg-black/20 rounded-lg">
                        <button onClick={() => setFaviconType('default')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${faviconType === 'default' ? 'bg-[var(--lt-accent)] text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
                            Default
                        </button>
                        <button onClick={() => setFaviconType('image')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${faviconType === 'image' ? 'bg-[var(--lt-accent)] text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
                            Personalizado
                        </button>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-black/40 rounded-xl border border-dashed border-white/10 flex items-center justify-center shrink-0 relative group">
                            {faviconType === 'default'
                                ? <img src="/default_favicon.svg" className="w-10 h-10 object-contain" alt="Default Favicon" />
                                : faviconPreview
                                    ? <img src={faviconPreview} className="w-10 h-10 object-contain" alt="Custom Favicon" />
                                    : <span className="text-gray-500 text-xs text-center px-2">Sin imagen</span>
                            }
                            {faviconType === 'image' && (
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                                    <button onClick={() => faviconInputRef.current?.click()} className="p-2 bg-white text-black rounded-lg"><Upload className="w-4 h-4" /></button>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-[var(--lt-text-muted)]">
                            {faviconType === 'default' ? 'Usa el logotipo degradado de la aplicación.' : 'Sube tu propia imagen (64×64px o SVG recomendado).'}
                        </p>
                    </div>
                    <input type="file" ref={faviconInputRef} className="hidden" accept="image/png,image/x-icon,image/svg+xml,image/jpeg" onChange={handleFaviconChange} />
                </div>

                {/* --- SEO --- */}
                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6 space-y-6 md:col-span-2">
                    <h3 className="text-lg font-bold text-[var(--lt-text)] flex items-center gap-2">
                        <Type className="w-5 h-5 text-[var(--lt-accent)]" /> Metadatos (SEO)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Nombre de la App</label>
                            <input type="text" value={appName} onChange={(e) => setAppName(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-[var(--lt-accent-border)] outline-none" placeholder="Listopic" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Keywords</label>
                            <input type="text" defaultValue={config.keywords} className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-[var(--lt-accent-border)] outline-none opacity-50" placeholder="listas, social, app" disabled />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Descripción</label>
                            <textarea value={appDescription} onChange={(e) => setAppDescription(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-[var(--lt-accent-border)] outline-none min-h-[80px]" placeholder="Descripción corta..." />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-6 border-t border-white/5">
                <button onClick={handleSave} disabled={loading} className="px-8 py-3 bg-[var(--lt-accent)] text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-50 transition-all hover:scale-105 active:scale-95" style={{ boxShadow: '0 4px 14px var(--lt-accent-shadow)' }}>
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
                    Guardar Cambios
                </button>
            </div>
        </div>
    );
};

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { collection, addDoc, serverTimestamp, getDocs, doc, getDoc, query, limit, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Save, Loader, Image as ImageIcon, X, Search, ChevronRight, UserPlus, Globe, Lock as LockIcon, Smile } from 'lucide-react';
import { TagEmojiPicker, splitTagEmoji, buildTagString } from '../components/TagEmojiPicker';
import { CriteriaBuilder, type Criterion } from '../components/CriteriaBuilder';

export const CreateSublistPage: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { parentId } = useParams<{ parentId: string }>();

    // Selection Mode State
    const [searchTerm, setSearchTerm] = useState('');
    const [mainLists, setMainLists] = useState<any[]>([]);
    const [loadingLists, setLoadingLists] = useState(false);

    // Creation Mode State
    const [parentList, setParentList] = useState<any>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [isPublicWritable, setIsPublicWritable] = useState(false);

    // Image
    const [_imageFile, setImageFile] = useState<File | null>(null); // Prefix with _ or remove if truly unused. used in handler but state never read.
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Advanced
    const [criteria, setCriteria] = useState<Criterion[]>([]);
    const [customTags, setCustomTags] = useState<string[]>([]);
    const [fixedTags, setFixedTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [tagIcon, setTagIcon] = useState('');
    const [showTagEmojiPicker, setShowTagEmojiPicker] = useState(false);

    const [loading, setLoading] = useState(false);

    // 1. Fetch Lists for Selection (if no parentId)
    useEffect(() => {
        if (!parentId) {
            const fetchLists = async () => {
                setLoadingLists(true);
                try {
                    // Fetch top lists or just recent ones to choose from
                    // Fetch lists - Relaxed query to ensure legacy lists appear
                    // orderBy('itemCount') excludes docs where that field is missing.
                    // Fetch lists - must filter by public to satisfy security rules
                    const q = query(
                        collection(db, 'lists'),
                        where('isPublic', '==', true),
                        limit(50)
                    );
                    const snapshot = await getDocs(q);
                    const docs = snapshot.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .filter((l: any) => !l.parentListId); // Only show main lists
                    setMainLists(docs);
                } catch (e) {
                    console.error("Error fetching parent lists", e);
                } finally {
                    setLoadingLists(false);
                }
            };
            fetchLists();
        }
    }, [parentId]);

    // 2. Fetch Parent List Details (if parentId)
    useEffect(() => {
        if (parentId) {
            const fetchParent = async () => {
                try {
                    const docRef = doc(db, 'lists', parentId);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setParentList({ id: docSnap.id, ...data });

                        // Prefill data
                        setName(`${data.name} (Mi Versión)`);
                        setFixedTags(data.availableTags || []);

                        // Prefill criteria
                        if (data.criteriaDefinition) {
                            const inheritedCriteria: Criterion[] = [];
                            Object.entries(data.criteriaDefinition).forEach(([key, val]: [string, any]) => {
                                if (val.type === 'slider') {
                                    inheritedCriteria.push({
                                        id: key,
                                        label: val.label,
                                        minLabel: val.labelMin,
                                        maxLabel: val.labelMax,
                                        isPonderable: val.ponderable !== false,
                                        locked: true // Inherited criteria are locked
                                    });
                                }
                            });
                            setCriteria(inheritedCriteria);
                        }
                    } else {
                        navigate('/create-sublist'); // Redirect if invalid
                    }
                } catch (e) {
                    console.error("Error fetching parent list", e);
                }
            };
            fetchParent();
        }
    }, [parentId, navigate]);

    // Image Handlers
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    // Tag Handlers
    const addTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            const val = buildTagString(tagIcon, tagInput);
            if (val && !customTags.includes(val) && !fixedTags.includes(val)) {
                setCustomTags([...customTags, val]);
            }
            setTagInput('');
            setTagIcon('');
        }
    };

    const commitAddTag = () => {
        const val = buildTagString(tagIcon, tagInput);
        if (val && !customTags.includes(val) && !fixedTags.includes(val)) {
            setCustomTags([...customTags, val]);
        }
        setTagInput('');
        setTagIcon('');
    };
    const removeTag = (tag: string) => {
        setCustomTags(customTags.filter(t => t !== tag));
    };

    // Editors/Collaborators (stored as {uid, username} — UID goes into Firestore editors[])
    const [editors, setEditors] = useState<{ uid: string; username: string }[]>([]);
    const [guestInput, setGuestInput] = useState('');
    const [guestLookupLoading, setGuestLookupLoading] = useState(false);
    const [guestLookupError, setGuestLookupError] = useState<string | null>(null);

    const resolveUsernameToUid = async (input: string): Promise<{ uid: string; username: string } | null> => {
        const trimmed = input.trim().replace(/^@/, '');
        if (!trimmed) return null;
        try {
            // Try by username field
            const snap = await getDocs(query(collection(db, 'users'), where('username', '==', trimmed), limit(1)));
            if (!snap.empty) {
                const d = snap.docs[0];
                return { uid: d.id, username: (d.data().username as string) || trimmed };
            }
            // Try case-insensitive via usernameLower
            const snap2 = await getDocs(query(collection(db, 'users'), where('usernameLower', '==', trimmed.toLowerCase()), limit(1)));
            if (!snap2.empty) {
                const d = snap2.docs[0];
                return { uid: d.id, username: (d.data().username as string) || trimmed };
            }
            return null;
        } catch {
            return null;
        }
    };

    const handleAddGuest = async (e: React.KeyboardEvent) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const val = guestInput.trim();
        if (!val) return;
        setGuestLookupError(null);
        setGuestLookupLoading(true);
        const result = await resolveUsernameToUid(val);
        setGuestLookupLoading(false);
        if (!result) {
            setGuestLookupError(`No se encontró el usuario "${val}"`);
            return;
        }
        if (result.uid === user?.uid) {
            setGuestLookupError('No puedes añadirte a ti mismo');
            return;
        }
        if (editors.some(e => e.uid === result.uid)) {
            setGuestLookupError('Este usuario ya está en la lista');
            return;
        }
        setEditors(prev => [...prev, result]);
        setGuestInput('');
    };

    const removeGuest = (uid: string) => {
        setEditors(prev => prev.filter(e => e.uid !== uid));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !parentList) return;
        setLoading(true);

        try {
            const finalPhotoUrl = imagePreview || parentList.thumbnailUrl || parentList.mainImageUrl || parentList.photoUrl || parentList.coverUrl || parentList.imageUrl || '';

            const criteriaDefinitionMap: Record<string, any> = {};
            criteria.forEach(c => {
                criteriaDefinitionMap[c.id] = {
                    type: 'slider',
                    label: c.label,
                    min: 0,
                    max: 10,
                    step: 0.5,
                    labelMin: c.minLabel,
                    labelMax: c.maxLabel,
                    ponderable: c.isPonderable
                };
            });

            const finalListTags = [...fixedTags, ...customTags];

            const newListData = {
                name,
                description,
                categoryId: parentList.categoryId,
                parentListId: parentList.id, // THE KEY LINK
                isSublist: true,

                userId: user.uid,
                isPublic, // Legacy boolean
                visibility: isPublic ? 'public' : 'private', // New explicit field
                publicAccess: isPublic && isPublicWritable ? 'writer' : 'reader', // Consistent with EditListPage
                editors: editors.map(e => e.uid), // UIDs of collaborators (checked by Firestore rules)

                authorName: user.displayName || 'Anónimo',
                photoUrl: finalPhotoUrl,
                mainImageUrl: finalPhotoUrl, // Legacy compat

                criteriaDefinition: criteriaDefinitionMap,
                availableTags: finalListTags,

                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),

                // Reset counters
                itemCount: 0,
                viewCount: 0,
                likes: 0,
                followersCount: 0,
                averageRating: 0,

                criteriaAverages: {},
                criteriaAveragesUpdatedAt: serverTimestamp(),
            };

            const docRef = await addDoc(collection(db, 'lists'), newListData);
            showToast({
                variant: 'success',
                title: 'Sublista creada',
                message: 'Sublista publicada. Ya puedes empezar el debate serio.',
            });
            navigate(`/list/${docRef.id}`);
        } catch (error) {
            console.error("Error creating sublist:", error);
            showToast({
                variant: 'error',
                title: 'No se pudo crear la sublista',
                message: 'No conseguimos guardar la sublista. Inténtalo otra vez.',
            });
        } finally {
            setLoading(false);
        }
    };

    // RENDER: Selection Mode
    if (!parentId) {
        const filtered = mainLists.filter(l => l.name?.toLowerCase().includes(searchTerm.toLowerCase()));
        return (
            <div className="min-h-screen bg-[var(--lt-bg)] text-gray-100 pt-safe-20 pb-24 px-4">
                <div className="max-w-2xl mx-auto">
                    <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </button>

                    <h1 className="text-2xl sm:text-3xl font-bold font-display text-white mb-1">Nueva Sublista</h1>
                    <p className="text-gray-400 text-sm mb-6">Elige una lista base para construir tu versión personal.</p>

                    <div className="relative mb-5">
                        <Search className="absolute left-3.5 top-3 text-gray-500 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Buscar lista..."
                            className="w-full bg-[var(--lt-card-strong)] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {loadingLists ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader className="w-7 h-7 animate-spin text-indigo-500" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16 text-gray-500 text-sm">No hay listas que coincidan</div>
                    ) : (
                        <div className="space-y-2">
                            {filtered.map(list => (
                                <button
                                    key={list.id}
                                    type="button"
                                    onClick={() => navigate(`/create-sublist/${list.id}`)}
                                    className="w-full bg-[var(--lt-card-strong)] border border-white/8 active:bg-[var(--lt-card)] hover:bg-[var(--lt-card)] hover:border-indigo-500/40 rounded-2xl p-3 flex items-center gap-3 transition-all text-left group"
                                >
                                    <div className="w-14 h-14 bg-gray-800 rounded-xl overflow-hidden shrink-0">
                                        {(list.thumbnailUrl || list.mainImageUrl || list.photoUrl || list.coverUrl || list.imageUrl)
                                            ? <img src={list.thumbnailUrl || list.mainImageUrl || list.photoUrl || list.coverUrl || list.imageUrl} alt={list.name} className="w-full h-full object-cover" />
                                            : <div className="w-full h-full flex items-center justify-center text-2xl">📋</div>
                                        }
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">{list.name}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">{list.itemCount || 0} lugares · {list.authorName || 'Anónimo'}</div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 transition-colors shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // RENDER: Creation Form
    if (!parentList) {
        return <div className="min-h-screen bg-[var(--lt-bg)] pt-safe-24 flex justify-center"><Loader className="animate-spin text-white" /></div>;
    }

    return (
        <div className="min-h-screen bg-[var(--lt-bg)] text-gray-100 pt-safe-20 pb-24 px-4">
            <div className="max-w-2xl mx-auto">

                {/* Back + parent info */}
                <div className="flex items-center gap-3 mb-6">
                    <button
                        type="button"
                        onClick={() => navigate('/create-sublist')}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    {(parentList.thumbnailUrl || parentList.mainImageUrl || parentList.photoUrl || parentList.coverUrl || parentList.imageUrl) && (
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/10 shrink-0">
                            <img src={parentList.thumbnailUrl || parentList.mainImageUrl || parentList.photoUrl || parentList.coverUrl || parentList.imageUrl} className="w-full h-full object-cover opacity-60" alt="" />
                        </div>
                    )}
                    <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Basada en</div>
                        <div className="text-sm font-semibold text-indigo-300 truncate">{parentList.name}</div>
                    </div>
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold font-display text-white mb-6">Nueva Sublista</h1>

                <form onSubmit={handleSubmit} className="space-y-4">

                    {/* Basic info */}
                    <div className="bg-[var(--lt-card-strong)] rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/5">
                        <div className="p-4">
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Nombre</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-transparent text-white text-base focus:outline-none placeholder-gray-600"
                                placeholder="Mi versión de la lista..."
                                required
                            />
                        </div>
                        <div className="p-4">
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Descripción <span className="text-gray-600 normal-case font-normal">(opcional)</span></label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-transparent text-white text-sm focus:outline-none placeholder-gray-600 resize-none min-h-[72px]"
                                placeholder="Describe tu versión..."
                            />
                        </div>
                        <div className="p-4">
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Portada <span className="text-gray-600 normal-case font-normal">(opcional)</span></label>
                            <div className="relative">
                                {imagePreview ? (
                                    <div className="relative h-36 w-full rounded-xl overflow-hidden">
                                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => { setImagePreview(null); setImageFile(null); }}
                                            className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white hover:bg-red-500 transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <label className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-white/15 hover:border-indigo-500/40 hover:bg-white/3 cursor-pointer transition-colors">
                                        <input type="file" accept="image/*" onChange={handleImageChange} className="sr-only" />
                                        <ImageIcon className="w-5 h-5 text-gray-600" />
                                        <span className="text-sm text-gray-400">Subir imagen — si no, se usa la del original</span>
                                    </label>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Criteria & tags */}
                    <div className="bg-[var(--lt-card-strong)] rounded-2xl border border-white/8 p-4 space-y-5">
                        <CriteriaBuilder criteria={criteria} onChange={setCriteria} />
                        <div className="border-t border-white/5 pt-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Etiquetas</div>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {fixedTags.map(tag => (
                                    <span key={`fixed-${tag}`} className="bg-gray-700/40 text-gray-400 px-2.5 py-1 rounded-full text-xs border border-white/5 cursor-not-allowed">
                                        {tag}
                                    </span>
                                ))}
                                {customTags.map(tag => {
                                    const { icon, label } = splitTagEmoji(tag);
                                    return (
                                        <span key={tag} className="bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5">
                                            {icon && <span>{icon}</span>}
                                            <span>{label || tag}</span>
                                            <button type="button" aria-label={`Eliminar etiqueta ${tag}`} onClick={() => removeTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                        </span>
                                    );
                                })}
                            </div>
                            <div className="relative flex gap-2">
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowTagEmojiPicker(p => !p)}
                                        className="h-full px-3 bg-[var(--lt-bg)] border border-white/10 rounded-xl text-base hover:bg-white/5 transition-colors flex items-center"
                                        aria-label="Elegir icono"
                                    >
                                        {tagIcon || <Smile className="w-4 h-4 text-gray-500" />}
                                    </button>
                                    {showTagEmojiPicker && (
                                        <TagEmojiPicker
                                            onSelect={e => { setTagIcon(e); setShowTagEmojiPicker(false); }}
                                            onClose={() => setShowTagEmojiPicker(false)}
                                        />
                                    )}
                                </div>
                                <input
                                    type="text"
                                    value={tagInput}
                                    onChange={e => setTagInput(e.target.value)}
                                    onKeyDown={addTag}
                                    placeholder="Nombre del tag y Enter..."
                                    className="flex-1 bg-[var(--lt-bg)] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                                {tagInput.trim() && (
                                    <button
                                        type="button"
                                        onClick={commitAddTag}
                                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white text-xs font-bold transition-colors"
                                    >
                                        Añadir
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Privacy */}
                    <div className="bg-[var(--lt-card-strong)] rounded-2xl border border-white/8 p-4 space-y-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Privacidad</div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setIsPublic(true)}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${isPublic
                                    ? 'bg-indigo-600/20 border-indigo-500/60 text-white'
                                    : 'bg-[var(--lt-bg)] border-white/8 text-gray-400 hover:bg-white/5'}`}
                            >
                                <Globe className={`w-5 h-5 ${isPublic ? 'text-indigo-400' : 'text-gray-500'}`} />
                                <span className="text-sm font-bold">Pública</span>
                                <span className="text-[10px] opacity-60 text-center leading-tight">Visible para todos</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsPublic(false)}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${!isPublic
                                    ? 'bg-indigo-600/20 border-indigo-500/60 text-white'
                                    : 'bg-[var(--lt-bg)] border-white/8 text-gray-400 hover:bg-white/5'}`}
                            >
                                <LockIcon className={`w-5 h-5 ${!isPublic ? 'text-indigo-400' : 'text-gray-500'}`} />
                                <span className="text-sm font-bold">Privada</span>
                                <span className="text-[10px] opacity-60 text-center leading-tight">Solo colaboradores</span>
                            </button>
                        </div>

                        {isPublic && (
                            <div className="p-3 bg-[var(--lt-bg)] rounded-xl border border-white/5 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-gray-200">Colaboración pública</div>
                                    <div className="text-xs text-gray-500 mt-0.5">Cualquier usuario puede añadir reseñas</div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={isPublicWritable}
                                        onChange={(e) => setIsPublicWritable(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>
                        )}

                        {/* Collaborators (stored as editor UIDs) */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <UserPlus className="w-4 h-4 text-gray-500" />
                                <span className="text-sm font-semibold text-gray-300">Colaboradores</span>
                                {editors.length > 0 && (
                                    <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">{editors.length}</span>
                                )}
                            </div>
                            {editors.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {editors.map(e => (
                                        <span key={e.uid} className="bg-purple-500/20 text-purple-300 px-2.5 py-1 rounded-full text-xs flex items-center gap-1">
                                            @{e.username}
                                            <button type="button" onClick={() => removeGuest(e.uid)} className="hover:text-white ml-0.5"><X className="w-3 h-3" /></button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="relative">
                                <input
                                    type="text"
                                    value={guestInput}
                                    onChange={(e) => { setGuestInput(e.target.value); setGuestLookupError(null); }}
                                    onKeyDown={handleAddGuest}
                                    placeholder="@usuario y pulsar Enter..."
                                    className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors pr-10"
                                />
                                {guestLookupLoading && (
                                    <Loader className="absolute right-3 top-3 w-4 h-4 animate-spin text-indigo-400" />
                                )}
                            </div>
                            {guestLookupError && (
                                <p className="text-xs text-red-400">{guestLookupError}</p>
                            )}
                            <p className="text-xs text-gray-600">Los colaboradores pueden ver y añadir reseñas aunque la lista sea privada.</p>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {loading ? 'Creando...' : 'Crear Sublista'}
                    </button>
                </form>
            </div>
        </div>
    );
};

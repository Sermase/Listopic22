import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, serverTimestamp, getDocs, doc, getDoc, query, limit, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Save, Loader, Image as ImageIcon, X, Search, ChevronRight } from 'lucide-react';
import { CriteriaBuilder, type Criterion } from '../components/CriteriaBuilder';

export const CreateSublistPage: React.FC = () => {
    const { user } = useAuth();
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
                                        // Mark as inherited to maybe lock them or show visually?
                                        // For now just standard
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
            const val = tagInput.trim();
            if (!customTags.includes(val) && !fixedTags.includes(val)) {
                setCustomTags([...customTags, val]);
            }
            setTagInput('');
        }
    };
    const removeTag = (tag: string) => {
        setCustomTags(customTags.filter(t => t !== tag));
    };

    // Guests State
    const [guests, setGuests] = useState<string[]>([]);
    const [guestInput, setGuestInput] = useState('');

    const handleAddGuest = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && guestInput.trim()) {
            e.preventDefault();
            const val = guestInput.trim();
            if (!guests.includes(val)) {
                setGuests([...guests, val]);
            }
            setGuestInput('');
        }
    };

    const removeGuest = (email: string) => {
        setGuests(guests.filter(g => g !== email));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !parentList) return;
        setLoading(true);

        try {
            const finalPhotoUrl = imagePreview || parentList.photoUrl || '';

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
                guests, // Array of strings (emails/usernames)

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
            navigate(`/list/${docRef.id}`);
        } catch (error) {
            console.error("Error creating sublist:", error);
            alert("Error al crear la sublista");
        } finally {
            setLoading(false);
        }
    };

    // RENDER: Selection Mode
    if (!parentId) {
        return (
            <div className="min-h-screen bg-[#0b1021] text-gray-100 pt-24 pb-20 px-4">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-3xl font-bold font-display text-white mb-2">Crear Sublista</h1>
                    <p className="text-gray-400 mb-8">Selecciona una lista base para personalizarla con tus propios lugares.</p>

                    <div className="relative mb-8">
                        <Search className="absolute left-4 top-3.5 text-gray-500 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Buscar listas principales..."
                            className="w-full bg-[#151b2e] border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {loadingLists ? (
                        <div className="text-center py-20"><Loader className="w-8 h-8 animate-spin mx-auto text-indigo-500" /></div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {mainLists.filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase())).map(list => (
                                <div key={list.id}
                                    onClick={() => navigate(`/create-sublist/${list.id}`)}
                                    className="bg-[#151b2e] border border-white/10 rounded-xl p-4 hover:border-indigo-500/50 cursor-pointer transition-all hover:translate-x-1 group flex items-center gap-4"
                                >
                                    <div className="w-16 h-16 bg-gray-800 rounded-lg overflow-hidden shrink-0">
                                        {list.photoUrl && <img src={list.photoUrl} alt={list.name} className="w-full h-full object-cover" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-white truncate">{list.name}</h3>
                                        <p className="text-xs text-gray-500 truncate">{list.itemCount} lugares • Por {list.authorName}</p>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-indigo-400" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // RENDER: Creation Form
    if (!parentList) {
        return <div className="min-h-screen bg-[#0b1021] pt-24 flex justify-center"><Loader className="animate-spin text-white" /></div>;
    }

    return (
        <div className="min-h-screen bg-[#0b1021] text-gray-100 pt-24 pb-20 px-4">
            <div className="max-w-3xl mx-auto">
                <button onClick={() => navigate('/create-sublist')} className="flex items-center text-gray-400 hover:text-white mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Volver a selección
                </button>

                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10">
                        {parentList.photoUrl && <img src={parentList.photoUrl} className="w-full h-full object-cover opacity-50" />}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold font-display text-white">Nueva Sublista</h1>
                        <p className="text-gray-400 text-sm">Basada en <span className="text-indigo-400">{parentList.name}</span></p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="bg-[#151b2e] p-6 rounded-xl border border-white/10 shadow-xl space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Nombre de tu lista</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Descripción</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 min-h-[100px]"
                                placeholder="Describe tu versión de esta lista..."
                            />
                        </div>

                        {/* Image Upload */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Portada (Opcional)</label>
                            <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center hover:bg-white/5 transition-colors relative group">
                                {imagePreview ? (
                                    <div className="relative h-48 w-full rounded-lg overflow-hidden">
                                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => { setImagePreview(null); setImageFile(null); }}
                                            className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-red-500 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                        <ImageIcon className="w-12 h-12 text-gray-600 mx-auto mb-3 group-hover:text-indigo-500 transition-colors" />
                                        <p className="text-gray-400 text-sm">Usar imagen personalizada</p>
                                        <p className="text-gray-600 text-xs mt-1">Si no subes nada, se usará la de la lista original</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#151b2e] p-6 rounded-xl border border-white/10 shadow-xl space-y-8">
                        <CriteriaBuilder criteria={criteria} onChange={setCriteria} />

                        <div className="border-t border-white/5 pt-6"></div>

                        <div>
                            <h3 className="text-lg font-bold text-white mb-2">Etiquetas (Globales + Tuyas)</h3>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {fixedTags.map(tag => (
                                    <span key={`fixed-${tag}`} className="bg-gray-700/50 text-gray-300 px-3 py-1 rounded-full text-sm flex items-center gap-1 border border-white/5 cursor-not-allowed">
                                        {tag}
                                    </span>
                                ))}
                                {customTags.map(tag => (
                                    <span key={tag} className="bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                                        {tag}
                                        <button type="button" onClick={() => removeTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                    </span>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={addTag}
                                placeholder="Añadir más tags..."
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Permission & Visibility */}
                    <div className="bg-[#151b2e] p-6 rounded-xl border border-white/10 shadow-xl space-y-6">
                        <h3 className="text-lg font-bold text-white">Privacidad y Acceso</h3>

                        {/* Visibility Toggle */}
                        <div className="flex items-center gap-4">
                            <button
                                type="button"
                                onClick={() => setIsPublic(true)}
                                className={`flex-1 p-4 rounded-xl border transition-all ${isPublic
                                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                                    : 'bg-[#0b1021] border-white/10 text-gray-400 hover:bg-white/5'}`}
                            >
                                <span className="block font-bold">Pública</span>
                                <span className="text-xs opacity-70">Visible para todos</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsPublic(false)}
                                className={`flex-1 p-4 rounded-xl border transition-all ${!isPublic
                                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                                    : 'bg-[#0b1021] border-white/10 text-gray-400 hover:bg-white/5'}`}
                            >
                                <span className="block font-bold">Privada</span>
                                <span className="text-xs opacity-70">Solo invitados</span>
                            </button>
                        </div>

                        {/* Public Write Access Toggle */}
                        {isPublic && (
                            <div className="animate-fade-in mt-4 p-4 bg-[#0b1021]/50 rounded-xl border border-white/5 flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-bold text-gray-200">Permitir Colaboración Pública</h4>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Si activas esto, cualquier usuario podrá añadir lugares a esta lista.
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isPublicWritable}
                                        onChange={(e) => setIsPublicWritable(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>
                        )}

                        {/* Guest Management (Only relevant if Private usually, but technically can have guests on public too?) 
                            The prompt implies guests for private lists mostly. */}
                        {!isPublic && (
                            <div className="animate-fade-in space-y-3">
                                <label className="block text-sm font-medium text-gray-400">Invitados (Emails o Usuarios)</label>
                                <div className="flex flex-wrap gap-2 mb-2 p-2 bg-[#0b1021] rounded-lg border border-white/10 min-h-[50px]">
                                    {guests.map(g => (
                                        <span key={g} className="bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                                            {g}
                                            <button type="button" onClick={() => removeGuest(g)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                        </span>
                                    ))}
                                    <input
                                        type="text"
                                        value={guestInput}
                                        onChange={(e) => setGuestInput(e.target.value)}
                                        onKeyDown={handleAddGuest}
                                        placeholder="Escribe y pulsa Enter..."
                                        className="bg-transparent text-white text-sm focus:outline-none min-w-[150px] flex-1"
                                    />
                                </div>
                                <p className="text-xs text-gray-500">
                                    Los invitados podrán ver la lista y añadir reseñas (si se habilita).
                                </p>
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {loading ? 'Creando Sublista...' : 'Crear Sublista'}
                    </button>
                </form>
            </div>
        </div>
    );
};

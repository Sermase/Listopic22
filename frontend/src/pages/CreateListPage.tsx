import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Save, Loader, Image as ImageIcon, X } from 'lucide-react';
import { CriteriaBuilder, type Criterion } from '../components/CriteriaBuilder';

export const CreateListPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    // State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [categoryId, setCategoryId] = useState('');
    const [categories, setCategories] = useState<any[]>([]);

    // Image
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState('');

    // Advanced
    const [criteria, setCriteria] = useState<Criterion[]>([
        { id: 'calidad', label: 'Calidad General', minLabel: 'Malo', maxLabel: 'Excelente', isPonderable: true }
    ]);
    const [customTags, setCustomTags] = useState<string[]>([]);
    const [fixedTags, setFixedTags] = useState<string[]>([]); // From category
    const [tagInput, setTagInput] = useState('');

    const [loading, setLoading] = useState(false);

    // Fetch Categories
    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const snapshot = await getDocs(collection(db, 'categories'));
                if (!snapshot.empty) {
                    setCategories(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                }
            } catch (e) {
                console.error("Error fetching categories", e);
            }
        };
        fetchCategories();
    }, []);

    // Handle Category Selection -> Prefill defaults
    useEffect(() => {
        if (!categoryId) return;
        const selectedCat = categories.find(c => c.id === categoryId);
        if (selectedCat) {
            // 1. Prefill Tags
            if (selectedCat['fixed-tags'] && Array.isArray(selectedCat['fixed-tags'])) {
                setFixedTags(selectedCat['fixed-tags']);
            }

            // 2. Prefill Criteria
            if (selectedCat.defaultCriteria) {
                const newCriteria: Criterion[] = [];
                Object.entries(selectedCat.defaultCriteria).forEach(([key, val]: [string, any]) => {
                    // Skip 'like'/'dislike' non-slider keys if present
                    if (val.type === 'slider') {
                        newCriteria.push({
                            id: key,
                            label: val.label,
                            minLabel: val.labelMin || 'Mina',
                            maxLabel: val.labelMax || 'Max',
                            isPonderable: val.ponderable !== false // default true
                        });
                    }
                });
                if (newCriteria.length > 0) {
                    setCriteria(newCriteria);
                }
            }
        }
    }, [categoryId, categories]);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);

        try {
            const finalPhotoUrl = imagePreview || imageUrl || '';

            // Transform criteria array back to Map/Object for DB
            const criteriaDefinitionMap: Record<string, any> = {};
            criteria.forEach(c => {
                criteriaDefinitionMap[c.id] = {
                    type: 'slider',
                    label: c.label,
                    min: 0,
                    max: 10,
                    step: 0.5, // Standard step
                    labelMin: c.minLabel,
                    labelMax: c.maxLabel,
                    ponderable: c.isPonderable
                };
            });

            const finalListTags = [...fixedTags, ...customTags];

            // Legacy Structure Match
            const newListData = {
                name,
                description,
                categoryId, // "comida_hmm" etc
                userId: user.uid,
                isPublic,

                // Fields expected by new UI / legacy UI
                authorName: user.displayName || 'Anónimo',
                mainImageUrl: finalPhotoUrl, // Legacy name "mainImageUrl", new might use "photoUrl" - let's save both or align
                photoUrl: finalPhotoUrl,

                criteriaDefinition: criteriaDefinitionMap,
                availableTags: finalListTags, // Combined tags
                fixedTags: fixedTags,

                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),

                // Counters
                itemCount: 0,
                groupedItemsCount: 0,
                viewCount: 0,
                likes: 0,
                followersCount: 0,
                commentsCount: 0,
                reviewCount: 0,
                averageRating: 0, // Initial average

                // New fields for schema alignment
                criteriaAverages: {},
                criteriaAveragesUpdatedAt: serverTimestamp(),
                reactions: {},
            };

            const docRef = await addDoc(collection(db, 'lists'), newListData);
            navigate(`/list/${docRef.id}`);
        } catch (error) {
            console.error("Error creating list:", error);
            alert("Error al crear la lista");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0b1021] text-gray-100 pt-24 pb-20 px-4">
            <div className="max-w-3xl mx-auto">
                <button onClick={() => navigate(-1)} className="flex items-center text-gray-400 hover:text-white mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Cancelar
                </button>

                <h1 className="text-3xl font-bold font-display text-white mb-8">Crear Nueva Lista</h1>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Info */}
                    <div className="bg-[#151b2e] p-6 rounded-xl border border-white/10 shadow-xl space-y-6">
                        <h2 className="text-xl font-bold text-white mb-4">Información Básica</h2>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Nombre de la Lista</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                                placeholder="Ej: Mejores Ramen de Madrid"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Categoría</label>
                            <select
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                                required
                            >
                                <option value="">Selecciona una categoría</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                            {categoryId && categories.find(c => c.id === categoryId)?.['fixed-tags'] && (
                                <p className="text-xs text-indigo-400 mt-2">
                                    Incluye etiquetas automáticas: {categories.find(c => c.id === categoryId)['fixed-tags'].join(', ')}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Descripción</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 min-h-[100px]"
                                placeholder="¿De qué trata esta lista?"
                            />
                        </div>

                        {/* Image Upload */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Portada de la Lista</label>
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
                                        <p className="text-gray-400 text-sm">Arrastra una imagen o haz clic para subir</p>
                                        <p className="text-gray-600 text-xs mt-1">PNG, JPG hasta 5MB</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Criteria & Tags */}
                    <div className="bg-[#151b2e] p-6 rounded-xl border border-white/10 shadow-xl space-y-8">
                        {/* Criteria Builder Component */}
                        <CriteriaBuilder criteria={criteria} onChange={setCriteria} />

                        <div className="border-t border-white/5 pt-6"></div>

                        {/* Tags */}
                        <div>
                            <h3 className="text-lg font-bold text-white mb-2">Etiquetas (Tags)</h3>
                            <p className="text-sm text-gray-400 mb-4">Ayuda a otros a filtrar tu lista (ej. #Barato, #Terraza).</p>

                            <div className="flex flex-wrap gap-2 mb-3">
                                {fixedTags.map(tag => (
                                    <span key={`fixed-${tag}`} className="bg-gray-700/50 text-gray-300 px-3 py-1 rounded-full text-sm flex items-center gap-1 border border-white/5 cursor-not-allowed">
                                        #{tag}
                                    </span>
                                ))}
                                {customTags.map(tag => (
                                    <span key={tag} className="bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                                        #{tag}
                                        <button type="button" onClick={() => removeTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                    </span>
                                ))}
                            </div>

                            <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={addTag}
                                placeholder="Escribe un tag y presiona Enter..."
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Visibility */}
                    <div className="bg-[#151b2e] p-4 rounded-xl border border-white/10 flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="isPublic"
                            checked={isPublic}
                            onChange={(e) => setIsPublic(e.target.checked)}
                            className="w-5 h-5 rounded border-gray-600 text-indigo-600 focus:ring-indigo-500 bg-[#0b1021]"
                        />
                        <label htmlFor="isPublic" className="text-sm cursor-pointer">
                            <span className="block font-medium text-white">Lista Pública</span>
                            <span className="block text-xs text-gray-500">Visible en tu perfil y resultados de búsqueda.</span>
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {loading ? 'Guardando Lista...' : 'Guardar Lista'}
                    </button>
                </form>
            </div>
        </div>
    );
};

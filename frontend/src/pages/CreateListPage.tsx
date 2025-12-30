import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Save, Loader } from 'lucide-react';

export const CreateListPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);

        try {
            const docRef = await addDoc(collection(db, 'lists'), {
                name,
                description,
                userId: user.uid,
                authorName: user.displayName || 'Anónimo',
                isPublic,
                createdAt: serverTimestamp(),
                itemCount: 0,
                viewCount: 0,
                likes: 0
            });
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
            <div className="max-w-2xl mx-auto">
                <button onClick={() => navigate(-1)} className="flex items-center text-gray-400 hover:text-white mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Cancelar
                </button>

                <h1 className="text-3xl font-bold font-display text-white mb-8">Crear Nueva Lista</h1>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="bg-[#151b2e] p-6 rounded-xl border border-white/10 shadow-xl">
                        {/* Name */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-400 mb-2">Nombre de la Lista</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-gray-600"
                                placeholder="Ej: Mejores Ramen de Madrid"
                                required
                            />
                        </div>

                        {/* Description */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-400 mb-2">Descripción (Opcional)</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-gray-600 min-h-[120px]"
                                placeholder="¿De qué trata esta lista?"
                            />
                        </div>

                        {/* Visibility */}
                        <div className="flex items-center gap-3 p-4 bg-[#0b1021] rounded-lg border border-white/5">
                            <input
                                type="checkbox"
                                id="isPublic"
                                checked={isPublic}
                                onChange={(e) => setIsPublic(e.target.checked)}
                                className="w-5 h-5 rounded border-gray-600 text-indigo-600 focus:ring-indigo-500 bg-[#151b2e]"
                            />
                            <label htmlFor="isPublic" className="text-sm">
                                <span className="block font-medium text-white">Lista Pública</span>
                                <span className="block text-xs text-gray-500">Muestra esta lista en tu perfil y en la búsqueda global.</span>
                            </label>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {loading ? 'Creando...' : 'Crear Lista'}
                    </button>
                </form>
            </div>
        </div>
    );
};

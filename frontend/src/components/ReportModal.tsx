import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { AlertTriangle, X, Send, MapPin, AlertCircle } from 'lucide-react';

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    placeId: string;
    placeName: string;
    itemName?: string; // Optional if reporting specific item
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, placeId, placeName, itemName }) => {
    const { user } = useAuth();
    const [issueType, setIssueType] = useState('place_closed');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            await addDoc(collection(db, 'reports'), {
                userId: user?.uid || 'anonymous',
                userName: user?.displayName || 'Anónimo',
                placeId,
                placeName,
                itemName: itemName || null,
                issueType, // place_closed, item_missing, inappropriate
                description,
                status: 'pending', // pending, resolved, rejected
                createdAt: serverTimestamp()
            });
            alert("Reporte enviado. Gracias por ayudar a mejorar la comunidad.");
            onClose();
        } catch (error) {
            console.error(error);
            alert("Error al enviar reporte.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#151b2e] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                    <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Reportar Incidencia</h2>
                        <p className="text-sm text-gray-400">Ayúdanos a mantener la información actualizada.</p>
                    </div>
                </div>

                <div className="bg-white/5 rounded-lg p-3 mb-6 flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-white">{placeName}</p>
                        {itemName && <p className="text-xs text-gray-400">Item: {itemName}</p>}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Tipo de Problema</label>
                        <select
                            value={issueType}
                            onChange={(e) => setIssueType(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-red-500 transition-colors appearance-none"
                        >
                            <option value="place_closed">El lugar ha cerrado</option>
                            <option value="item_missing">El plato/item ya no existe</option>
                            <option value="inappropriate">Contenido inapropiado</option>
                            <option value="duplicate">Lugar duplicado</option>
                            <option value="other">Otro error en la información</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Detalles adicionales</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe el problema (opcional)..."
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-red-500 transition-colors h-24 resize-none"
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                        >
                            {submitting ? 'Enviando...' : (
                                <>
                                    <Send className="w-4 h-4" /> Enviar Reporte
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

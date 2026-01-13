import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { AlertTriangle, X, Send, MapPin, AlertCircle, FileText, List, Users } from 'lucide-react';

export type ReportTargetType = 'place' | 'review' | 'list' | 'group' | 'user' | 'other';

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetId: string;
    targetName: string;
    targetType: ReportTargetType;
    itemName?: string; // Optional context (e.g. item name if target is generic item) or sub-detail
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, targetId, targetName, targetType, itemName }) => {
    const { user } = useAuth();
    const [issueType, setIssueType] = useState('inappropriate'); // Default to a generic one
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
                targetId,
                targetName,
                targetType,
                itemName: itemName || null, // Keeping for backward compatibility or extra context
                issueType,
                description,
                status: 'pending', // pending, resolved, rejected, discarded
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

    const getIcon = () => {
        switch (targetType) {
            case 'place': return <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />;
            case 'review': return <FileText className="w-4 h-4 text-pink-400 shrink-0" />;
            case 'list': return <List className="w-4 h-4 text-emerald-400 shrink-0" />;
            case 'group': return <Users className="w-4 h-4 text-amber-400 shrink-0" />;
            default: return <AlertCircle className="w-4 h-4 text-gray-400 shrink-0" />;
        }
    };

    const getTypeLabel = () => {
        switch (targetType) {
            case 'place': return 'Lugar';
            case 'review': return 'Reseña';
            case 'list': return 'Lista';
            case 'group': return 'Grupo';
            default: return 'Contenido';
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
                        <h2 className="text-xl font-bold text-white">Reportar {getTypeLabel()}</h2>
                        <p className="text-sm text-gray-400">Ayúdanos a mantener la comunidad segura.</p>
                    </div>
                </div>

                <div className="bg-white/5 rounded-lg p-3 mb-6 flex items-center gap-3">
                    {getIcon()}
                    <div>
                        <p className="text-sm font-bold text-white line-clamp-1">{targetName}</p>
                        {itemName && <p className="text-xs text-gray-400">Contexto: {itemName}</p>}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Motivo del reporte</label>
                        <select
                            value={issueType}
                            onChange={(e) => setIssueType(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-red-500 transition-colors appearance-none"
                        >
                            <option value="inappropriate">Contenido inapropiado / ofensivo</option>
                            <option value="spam">Spam / Publicidad no deseada</option>
                            <option value="fake">Información falsa / engañosa</option>
                            {(targetType === 'place' || targetType === 'review') && (
                                <>
                                    <option value="place_closed">El lugar ha cerrado</option>
                                    <option value="item_missing">El item ya no existe</option>
                                    <option value="duplicate">Lugar duplicado</option>
                                </>
                            )}
                            <option value="other">Otro motivo</option>
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

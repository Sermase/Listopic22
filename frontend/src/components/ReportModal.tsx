import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { collection, addDoc, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { AlertTriangle, X, Send, MapPin, AlertCircle, FileText, List, Users, ShieldCheck, Loader2 } from 'lucide-react';

export type ReportTargetType = 'place' | 'review' | 'list' | 'group' | 'user' | 'other';

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetId: string;
    targetName: string;
    targetType: ReportTargetType;
    targetOwnerId?: string;
    itemName?: string;
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, targetId, targetName, targetType, targetOwnerId, itemName }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [issueType, setIssueType] = useState('inappropriate');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [alreadyReported, setAlreadyReported] = useState(false);
    const [checkingDuplicate, setCheckingDuplicate] = useState(false);

    // Check for duplicate report when modal opens
    useEffect(() => {
        if (!isOpen || !user?.uid || !targetId) return;

        let cancelled = false;
        const checkDuplicate = async () => {
            setCheckingDuplicate(true);
            try {
                const q = query(
                    collection(db, 'reports'),
                    where('userId', '==', user.uid),
                    where('targetId', '==', targetId),
                    where('status', '==', 'pending'),
                    limit(1),
                );
                const snap = await getDocs(q);
                if (!cancelled) setAlreadyReported(!snap.empty);
            } catch {
                // If query fails (e.g. missing index), allow submission
                if (!cancelled) setAlreadyReported(false);
            } finally {
                if (!cancelled) setCheckingDuplicate(false);
            }
        };
        checkDuplicate();
        return () => { cancelled = true; };
    }, [isOpen, user?.uid, targetId]);

    if (!isOpen) return null;

    // Anti-self-report: user cannot report their own content
    const isSelfReport = !!user?.uid && !!targetOwnerId && user.uid === targetOwnerId;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isSelfReport) {
            showToast({ message: 'No puedes reportar tu propio contenido.', variant: 'error' });
            return;
        }
        if (alreadyReported) {
            showToast({ message: 'Ya has reportado este contenido. Estamos revisándolo.', variant: 'info' });
            return;
        }

        setSubmitting(true);
        try {
            await addDoc(collection(db, 'reports'), {
                userId: user?.uid || 'anonymous',
                userName: user?.displayName || 'Anónimo',
                userEmail: user?.email || null,
                targetId,
                targetName,
                targetType,
                targetOwnerId: targetOwnerId || null,
                itemName: itemName || null,
                issueType,
                description,
                status: 'pending',
                createdAt: serverTimestamp(),
            });
            showToast({
                title: '✓ Reporte enviado',
                message: 'Gracias por ayudar a mejorar la comunidad. Lo revisaremos pronto.',
                variant: 'success',
                durationMs: 4000,
            });
            setDescription('');
            setIssueType('inappropriate');
            onClose();
        } catch (error) {
            console.error('Report submission error:', error);
            showToast({ message: 'Error al enviar el reporte. Inténtalo de nuevo.', variant: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const getIcon = () => {
        const cls = 'w-4 h-4 shrink-0';
        switch (targetType) {
            case 'place': return <MapPin className={`${cls} text-indigo-400`} />;
            case 'review': return <FileText className={`${cls} text-pink-400`} />;
            case 'list': return <List className={`${cls} text-emerald-400`} />;
            case 'group': return <Users className={`${cls} text-amber-400`} />;
            case 'user': return <Users className={`${cls} text-rose-400`} />;
            default: return <AlertCircle className={`${cls} text-gray-400`} />;
        }
    };

    const getTypeLabel = () => {
        switch (targetType) {
            case 'place': return 'Lugar';
            case 'review': return 'Reseña';
            case 'list': return 'Lista';
            case 'group': return 'Grupo';
            case 'user': return 'Usuario';
            default: return 'Contenido';
        }
    };

    const isDisabled = submitting || alreadyReported || isSelfReport || checkingDuplicate;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-[#151b2e] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6 relative animate-in zoom-in-95 fade-in duration-200">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
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

                {/* Self-report guard */}
                {isSelfReport && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                        <p className="text-sm text-amber-200">No puedes reportar tu propio contenido.</p>
                    </div>
                )}

                {/* Already reported guard */}
                {alreadyReported && !isSelfReport && (
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 mb-4 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                        <p className="text-sm text-indigo-200">Ya has reportado este contenido. Nuestro equipo lo está revisando.</p>
                    </div>
                )}

                {/* Target info */}
                <div className="bg-white/5 rounded-lg p-3 mb-6 flex items-center gap-3">
                    {getIcon()}
                    <div className="min-w-0">
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
                            disabled={isDisabled}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-red-500 transition-colors appearance-none disabled:opacity-40"
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
                            {targetType === 'user' && (
                                <>
                                    <option value="harassment">Acoso o intimidación</option>
                                    <option value="impersonation">Suplantación de identidad</option>
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
                            disabled={isDisabled}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-red-500 transition-colors h-24 resize-none disabled:opacity-40"
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={isDisabled}
                            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                            ) : checkingDuplicate ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</>
                            ) : (
                                <><Send className="w-4 h-4" /> Enviar Reporte</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

import React, { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, FileText, Loader2, X } from 'lucide-react';
import { createBusinessClaim } from '../services/BusinessClaimService';
import type { BusinessClaim } from '../services/BusinessClaimService';
import type { User } from 'firebase/auth';
import { PlaceSearch } from './PlaceSearch';
import type { PlaceResult } from '../services/PlaceService';

interface BusinessClaimModalProps {
    isOpen: boolean;
    user: User | null;
    placeId: string;
    placeName: string;
    placeAddress?: string;
    onClose: () => void;
    onCreated: (claim: Pick<BusinessClaim, 'id' | 'status' | 'placeId' | 'placeName' | 'contactEmail' | 'role' | 'message' | 'proofs'>) => void;
}

export const BusinessClaimModal: React.FC<BusinessClaimModalProps> = ({
    isOpen,
    user,
    placeId,
    placeName,
    placeAddress,
    onClose,
    onCreated,
}) => {
    const [role, setRole] = useState('');
    const [contactEmail, setContactEmail] = useState(user?.email || '');
    const [contactPhone, setContactPhone] = useState('');
    const [website, setWebsite] = useState('');
    const [message, setMessage] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [truthDeclarationAccepted, setTruthDeclarationAccepted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedPlace, setSelectedPlace] = useState<Pick<PlaceResult, 'id' | 'name' | 'address'> | null>(() => ({
        id: placeId,
        name: placeName,
        address: placeAddress || '',
    }));

    useEffect(() => {
        if (!isOpen) return;
        setSelectedPlace({
            id: placeId,
            name: placeName,
            address: placeAddress || '',
        });
    }, [isOpen, placeAddress, placeId, placeName]);

    const canSubmit = useMemo(() => {
        return Boolean(user && selectedPlace?.id && role.trim().length >= 2 && contactEmail.trim().includes('@') && message.trim().length >= 20 && truthDeclarationAccepted);
    }, [contactEmail, message, role, selectedPlace?.id, truthDeclarationAccepted, user]);

    if (!isOpen) return null;

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!user || !canSubmit) return;

        setSubmitting(true);
        setError(null);
        try {
            const claimPlace = selectedPlace || { id: placeId, name: placeName, address: placeAddress };
            const created = await createBusinessClaim({
                userId: user.uid,
                userEmail: user.email,
                userName: user.displayName,
                placeId: claimPlace.id,
                placeName: claimPlace.name,
                placeAddress: claimPlace.address,
                role,
                contactEmail,
                contactPhone,
                website,
                message,
                truthDeclarationAccepted,
                files,
            });

            onCreated({
                id: created.id,
                status: 'pending',
                placeId: claimPlace.id,
                placeName: claimPlace.name,
                contactEmail,
                role,
                message,
                proofs: created.proofs,
            });
            setRole('');
            setContactPhone('');
            setWebsite('');
            setMessage('');
            setFiles([]);
            setTruthDeclarationAccepted(false);
            onClose();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo enviar la solicitud.';
            setError(message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[220] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 py-8">
            <div className="w-full max-w-2xl max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] shadow-2xl">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[var(--lt-card-strong)] px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] grid place-items-center shrink-0">
                            <BriefcaseBusiness className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-white truncate">Reclamar negocio</h2>
                            <p className="text-xs text-gray-400 truncate">{placeName}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-white/10 text-gray-300"
                        aria-label="Cerrar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <p className="text-sm text-gray-300">
                        Envía una explicación y pruebas de que gestionas este lugar. Revisaremos la solicitud desde Developer y te aparecerá aquí el estado.
                    </p>

                    <div className="rounded-xl border border-white/10 bg-black/15 p-4">
                        <span className="block text-xs font-bold uppercase text-gray-400 mb-2">Negocio</span>
                        <PlaceSearch
                            onSelect={(place) => setSelectedPlace({
                                id: place.id,
                                name: place.name,
                                address: place.address,
                            })}
                            prefillValue={selectedPlace?.name || placeName}
                            placeholder="Busca el negocio en Google..."
                        />
                        {selectedPlace && (
                            <div className="mt-3 rounded-lg bg-white/5 px-3 py-2">
                                <p className="text-sm font-bold text-white truncate">{selectedPlace.name}</p>
                                {selectedPlace.address && (
                                    <p className="text-xs text-gray-400 truncate">{selectedPlace.address}</p>
                                )}
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="block">
                            <span className="block text-xs font-bold uppercase text-gray-400 mb-2">Relación con el negocio</span>
                            <input
                                value={role}
                                onChange={(event) => setRole(event.target.value)}
                                placeholder="Propietario, gerente, marketing..."
                                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                                maxLength={120}
                                required
                            />
                        </label>
                        <label className="block">
                            <span className="block text-xs font-bold uppercase text-gray-400 mb-2">Email de contacto</span>
                            <input
                                type="email"
                                value={contactEmail}
                                onChange={(event) => setContactEmail(event.target.value)}
                                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                                maxLength={180}
                                required
                            />
                        </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="block">
                            <span className="block text-xs font-bold uppercase text-gray-400 mb-2">Teléfono</span>
                            <input
                                value={contactPhone}
                                onChange={(event) => setContactPhone(event.target.value)}
                                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                                maxLength={80}
                            />
                        </label>
                        <label className="block">
                            <span className="block text-xs font-bold uppercase text-gray-400 mb-2">Web o red social</span>
                            <input
                                value={website}
                                onChange={(event) => setWebsite(event.target.value)}
                                placeholder="https://..."
                                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                                maxLength={240}
                            />
                        </label>
                    </div>

                    <label className="block">
                        <span className="block text-xs font-bold uppercase text-gray-400 mb-2">Solicitud</span>
                        <textarea
                            value={message}
                            onChange={(event) => setMessage(event.target.value)}
                            placeholder="Explica qué relación tienes con el negocio y qué pruebas adjuntas."
                            className="min-h-32 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                            maxLength={1600}
                            required
                        />
                        <span className="mt-1 block text-[11px] text-gray-500">Mínimo recomendado: 20 caracteres.</span>
                    </label>

                    <label className="block rounded-xl border border-dashed border-white/15 bg-black/15 p-4">
                        <span className="flex items-center gap-2 text-sm font-bold text-white">
                            <FileText className="w-4 h-4 text-[var(--lt-accent)]" />
                            Pruebas
                        </span>
                        <span className="mt-1 block text-xs text-gray-400">PDF o imágenes. Máximo 5 archivos de 25 MB.</span>
                        <input
                            type="file"
                            multiple
                            accept="image/*,application/pdf"
                            onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 5))}
                            className="mt-3 block w-full text-xs text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--lt-accent)] file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
                        />
                        {files.length > 0 && (
                            <div className="mt-3 space-y-1">
                                {files.map((file) => (
                                    <div key={`${file.name}-${file.size}`} className="text-xs text-gray-300 truncate">
                                        {file.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </label>

                    <label className="flex gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                        <input
                            type="checkbox"
                            checked={truthDeclarationAccepted}
                            onChange={(event) => setTruthDeclarationAccepted(event.target.checked)}
                            className="mt-1 h-4 w-4 shrink-0 accent-[var(--lt-accent)]"
                            required
                        />
                        <span>
                            Declaro que la información enviada es veraz, que estoy autorizado a reclamar este negocio y que las pruebas adjuntas son legítimas.
                        </span>
                    </label>

                    <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-3 rounded-xl bg-white/5 text-sm font-bold text-gray-200 hover:bg-white/10"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!canSubmit || submitting}
                            className="px-5 py-3 rounded-xl bg-[var(--lt-accent)] text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                            Enviar solicitud
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

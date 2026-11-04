import React, { useEffect, useState } from 'react';
import { collection, doc, documentId, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAppConfig } from '../../context/AppConfigContext';
import { presetBadge } from '../../config/badgePresets';
import { ABILITIES, type AbilityId } from '../../lib/abilities';
import { refreshInactiveBadges } from '../../hooks/useAbilities';


type BadgeState = { exists: boolean; active: boolean; name: string; icon: string; how: string };

const Toggle: React.FC<{ on: boolean; busy: boolean; label: string; onClick: () => void }> = ({ on, busy, label, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={on}
        className={`shrink-0 whitespace-nowrap text-xs font-bold px-3 py-1 rounded-full border transition-colors disabled:opacity-50 ${on
            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
            : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}
    >
        {label}: {on ? 'sí' : 'no'}
    </button>
);

/** Developer → Sorpresas → Medallas con premio: dos interruptores por premio (la medalla y su premio). */
export const AbilitiesSection: React.FC = () => {
    const config = useAppConfig();
    const [badges, setBadges] = useState<Record<string, BadgeState>>({});
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        const ids = ABILITIES.map((a) => a.badge);
        void getDocs(query(collection(db, 'badges'), where(documentId(), 'in', ids))).then((snap) => {
            const found = new Map(snap.docs.map((d) => [d.id, d.data()] as const));
            setBadges(Object.fromEntries(ids.map((id) => {
                const data = found.get(id) as { active?: boolean; name?: string; icon?: string; descriptionPublic?: string } | undefined;
                const preset = presetBadge(id);
                return [id, {
                    exists: Boolean(data),
                    active: Boolean(data) && data?.active !== false,
                    name: data?.name || preset?.name || id,
                    icon: data?.icon || preset?.icon || '🏅',
                    how: data?.descriptionPublic || preset?.descriptionPublic || '',
                }];
            })));
        }).catch(() => setBadges({}));
    }, []);

    const toggleBadge = async (badgeId: string) => {
        const current = badges[badgeId];
        if (!current) return;
        setBusy(badgeId);
        try {
            const next = !current.active;
            // Si no está importada, se crea desde el pack (Pack Escalera).
            const preset = presetBadge(badgeId);
            const payload = current.exists || !preset ? { active: next } : { ...preset, active: next };
            await setDoc(doc(db, 'badges', badgeId), payload, { merge: true });
            setBadges((prev) => ({ ...prev, [badgeId]: { ...current, exists: true, active: next } }));
            void refreshInactiveBadges();
        } catch (error) {
            alert(`No se pudo guardar: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setBusy(null);
        }
    };

    const togglePrize = async (id: AbilityId) => {
        setBusy(id);
        try {
            await setDoc(doc(db, 'config', 'app'), { abilities: { [id]: config.abilities?.[id] === false }, updatedAt: new Date() }, { merge: true });
        } catch (error) {
            alert(`No se pudo guardar: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="mt-6 border-t border-white/5 pt-5">
            <h3 className="text-lg font-bold text-white flex items-center gap-2"><span>🏅</span> Medallas con premio</h3>
            <p className="text-gray-400 text-xs mt-1 mb-3">
                «Medalla: no» deja de darla (y su premio se va con ella). «Premio: no» la sigue dando pero sin premio. Tú, como Jefe, tienes todos los premios para probarlos.
            </p>
            <ul className="divide-y divide-white/5">
                {ABILITIES.map((ability) => {
                    const badge = badges[ability.badge];
                    const prizeOn = config.abilities?.[ability.id] !== false;
                    return (
                        <li key={ability.id} className="flex flex-wrap items-center gap-3 py-3">
                            <span className="text-2xl w-8 text-center shrink-0" aria-hidden="true">{ability.emoji}</span>
                            <div className="min-w-0 flex-1 basis-48">
                                <p className="text-sm font-bold text-white">{ability.name}</p>
                                <p className="text-xs text-gray-400">
                                    {badge ? `${badge.icon} ${badge.name}${badge.how ? ` · ${badge.how}` : ''}` : 'Cargando…'}
                                    {badge && !badge.exists && ' · sin importar'}
                                </p>
                            </div>
                            <Toggle on={Boolean(badge?.active)} busy={!badge || busy === ability.badge} label="Medalla" onClick={() => { void toggleBadge(ability.badge); }} />
                            <Toggle on={prizeOn} busy={busy === ability.id} label="Premio" onClick={() => { void togglePrize(ability.id); }} />
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

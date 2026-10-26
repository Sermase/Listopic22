import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAppConfig } from '../../context/AppConfigContext';
import { SURPRISES, fireSurprise, type SurpriseId } from '../../lib/surprises';

/** Lo que «Probar» enseña en esta pantalla (sin publicar nada). */
const PREVIEW: Partial<Record<SurpriseId, () => void>> = {
    perfectTen: () => fireSurprise({ kind: 'rain', emoji: '🍕', title: '¡Un 10! Que lo sepa el mundo' }),
    brokenPlate: () => fireSurprise({ kind: 'broken', title: '¡Suspenso! ¡Puaj!' }),
    spicy: () => fireSurprise({ kind: 'shake' }),
    lateNight: () => fireSurprise({ kind: 'bubble', emoji: '🌙', text: '¿Kebab de madrugada? Aquí no juzgamos.' }),
    croqueta: () => fireSurprise({ kind: 'croqueta' }),
    shakeRoulette: () => fireSurprise({ kind: 'roulette' }),
    tortilla: () => fireSurprise({ kind: 'tortilla', side: 'con' }),
    abuela: () => fireSurprise({ kind: 'bubble', emoji: '👵', text: '¿Has comido? Estás en los huesos.' }),
};

/** Developer → Sorpresas: un interruptor por sorpresa (config/app.surprises), para todo el mundo. */
export const SurprisesPanel: React.FC = () => {
    const config = useAppConfig();
    const [saving, setSaving] = useState<SurpriseId | null>(null);

    const toggle = async (id: SurpriseId) => {
        setSaving(id);
        try {
            await setDoc(doc(db, 'config', 'app'), { surprises: { [id]: config.surprises?.[id] === false }, updatedAt: new Date() }, { merge: true });
        } catch (error) {
            alert(`No se pudo guardar: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setSaving(null);
        }
    };

    return (
        <div className="max-w-3xl mx-auto">
            <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6">
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><span>🥚</span> Sorpresas</h2>
                <p className="text-gray-400 text-sm mb-5">
                    Huevos de Pascua escondidos. Lo que apagues aquí se apaga para todo el mundo; cada persona además puede quitarlas todas en Preferencias → Sorpresas.
                </p>
                <ul className="divide-y divide-white/5">
                    {SURPRISES.map((s) => {
                        const on = config.surprises?.[s.id] !== false;
                        const preview = PREVIEW[s.id];
                        return (
                            <li key={s.id} className="flex items-center gap-3 py-3">
                                <span className="text-2xl w-8 text-center shrink-0" aria-hidden="true">{s.emoji}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-white">{s.name}</p>
                                    <p className="text-xs text-gray-400">{s.how}</p>
                                </div>
                                {preview && (
                                    <button type="button" onClick={preview} className="shrink-0 text-xs font-bold px-3 py-1 rounded-full border border-white/10 text-gray-300 hover:bg-white/5">
                                        Probar
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => toggle(s.id)}
                                    disabled={saving === s.id}
                                    aria-pressed={on}
                                    className={`shrink-0 whitespace-nowrap text-xs font-bold px-3 py-1 rounded-full border transition-colors disabled:opacity-50 ${on
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                        : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}
                                >
                                    {on ? '✅ Activa' : '💤 Apagada'}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

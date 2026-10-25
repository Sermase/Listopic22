import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAppConfig } from '../../context/AppConfigContext';
import { isLabAppVisible, type LabAppId } from '../../lib/labApps';

/** Interruptor de una app del laboratorio: se guarda al tocarlo (config/app.labApps). */
export const LabAppToggle: React.FC<{ id: LabAppId }> = ({ id }) => {
    const config = useAppConfig();
    const [saving, setSaving] = useState(false);
    const shown = config.labApps?.[id] !== false;
    const publicNow = isLabAppVisible(config, id);

    const toggle = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'config', 'app'), { labApps: { [id]: !shown }, updatedAt: new Date() }, { merge: true });
        } catch (error) {
            alert(`No se pudo guardar: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={saving}
            aria-pressed={shown}
            title={config.showLab ? undefined : 'El laboratorio está oculto (OTROS → Lab): no se ve aunque la marques.'}
            className={`shrink-0 whitespace-nowrap text-xs font-bold px-3 py-1 rounded-full border transition-colors disabled:opacity-50 ${shown
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}
        >
            {shown ? (publicNow ? '👁 Se muestra' : '👁 Se mostrará') : '🙈 Oculta'}
        </button>
    );
};

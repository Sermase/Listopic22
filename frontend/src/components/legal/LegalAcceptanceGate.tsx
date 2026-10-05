import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { Loader2, ShieldCheck } from 'lucide-react';
import { auth } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { LEGAL_PATHS, LEGAL_VERSION } from '../../config/legal';
import { isLegalAcceptedThisSession, recordLegalAcceptance } from '../../services/LegalService';
import { LegalConsentChecks } from './LegalConsentChecks';

/**
 * Pide aceptar Términos y Privacidad a quien tiene sesión y no ha aceptado la
 * versión vigente: cuentas creadas con Google (no pasan por el formulario de
 * registro), cuentas anteriores a este aviso y todos cuando cambia la versión.
 * Los textos legales se pueden leer sin aceptar.
 */
export const LegalAcceptanceGate: React.FC = () => {
    const { user, profileLoaded, acceptedLegalVersion } = useAuth();
    const location = useLocation();
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [ageConfirmed, setAgeConfirmed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [, forceRender] = useState(0);

    if (!user || !profileLoaded) return null;
    if (acceptedLegalVersion === LEGAL_VERSION || isLegalAcceptedThisSession(user.uid)) return null;
    if (LEGAL_PATHS.includes(location.pathname)) return null;

    const isUpdate = acceptedLegalVersion !== null;

    const handleAccept = async () => {
        if (!termsAccepted || !ageConfirmed) return;
        setSaving(true);
        await recordLegalAcceptance(user.uid, 'prompt');
        setSaving(false);
        forceRender((n) => n + 1);
    };

    return createPortal(
        <div className="fixed inset-0 z-[11000] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="legal-gate-title">
            <div className="w-full sm:max-w-md bg-[var(--lt-card-strong)] border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl">
                <div className="w-12 h-12 rounded-2xl bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] flex items-center justify-center mb-4">
                    <ShieldCheck className="w-6 h-6 text-[var(--lt-accent)]" />
                </div>
                <h2 id="legal-gate-title" className="text-xl font-display font-bold text-[var(--lt-text)] mb-2">
                    {isUpdate ? 'Hemos actualizado nuestras condiciones' : 'Antes de seguir'}
                </h2>
                <p className="text-sm text-[var(--lt-text-muted)] mb-5">
                    {isUpdate
                        ? 'Para seguir usando tu cuenta, revisa y acepta la nueva versión de los Términos de uso y la Política de privacidad.'
                        : 'Para usar tu cuenta de Listopic necesitamos que aceptes los Términos de uso y la Política de privacidad.'}
                </p>

                <LegalConsentChecks
                    termsAccepted={termsAccepted}
                    onTermsChange={setTermsAccepted}
                    ageConfirmed={ageConfirmed}
                    onAgeChange={setAgeConfirmed}
                    openInNewTab
                />

                <div className="mt-6 flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={handleAccept}
                        disabled={!termsAccepted || !ageConfirmed || saving}
                        className="w-full bg-[var(--lt-accent)] text-white font-bold py-3 px-4 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        data-testid="legal-accept-submit"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Aceptar y continuar
                    </button>
                    <button
                        type="button"
                        onClick={() => { void signOut(auth); }}
                        disabled={saving}
                        className="w-full py-2.5 text-sm font-semibold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]"
                    >
                        No acepto, cerrar sesión
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};

import React from 'react';
import { Link } from 'react-router-dom';
import { LEGAL } from '../../config/legal';

interface LegalConsentChecksProps {
    termsAccepted: boolean;
    onTermsChange: (value: boolean) => void;
    ageConfirmed: boolean;
    onAgeChange: (value: boolean) => void;
    /** Abre los textos en otra pestaña (en el aviso modal, para no perder el contexto). */
    openInNewTab?: boolean;
}

const linkClass = 'text-[var(--lt-accent)] font-semibold hover:underline';
const boxClass = 'mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 accent-[var(--lt-accent)] cursor-pointer';

/** Casillas obligatorias y sin marcar de antemano: Términos + Privacidad y edad mínima. */
export const LegalConsentChecks: React.FC<LegalConsentChecksProps> = ({
    termsAccepted, onTermsChange, ageConfirmed, onAgeChange, openInNewTab = false,
}) => {
    const target = openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {};
    return (
        <div className="space-y-3 text-left text-sm text-[var(--lt-text-muted)]">
            <label className="flex items-start gap-3 cursor-pointer">
                <input
                    type="checkbox"
                    className={boxClass}
                    checked={termsAccepted}
                    onChange={(event) => onTermsChange(event.target.checked)}
                    required
                    data-testid="legal-accept-terms"
                />
                <span>
                    He leído y acepto los <Link to="/terms" className={linkClass} {...target}>Términos de uso</Link> y la <Link to="/privacy" className={linkClass} {...target}>Política de privacidad</Link>.
                </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
                <input
                    type="checkbox"
                    className={boxClass}
                    checked={ageConfirmed}
                    onChange={(event) => onAgeChange(event.target.checked)}
                    required
                    data-testid="legal-accept-age"
                />
                <span>Confirmo que tengo {LEGAL.minAge} años o más.</span>
            </label>
        </div>
    );
};

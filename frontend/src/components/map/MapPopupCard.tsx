import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { formatScore, scoreBadgeStyle } from '../../lib/scoreScale';

/**
 * Ficha que sale al tocar un pin. La misma en todos los mapas y con los colores
 * del tema (los popups de Leaflet se pintan dentro de la app, así que heredan --lt-*).
 */
export const MapPopupCard: React.FC<{
    title: string;
    to: string;
    photoUrl?: string | null;
    score?: number | null;
    subtitle?: string | null;
    sponsored?: boolean;
    onNavigate?: () => void;
    children?: React.ReactNode;
}> = ({ title, to, photoUrl, score, subtitle, sponsored = false, onNavigate, children }) => {
    const hasScore = typeof score === 'number' && Number.isFinite(score) && score > 0;
    return (
        <div className="w-[230px] overflow-hidden rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] font-sans shadow-[0_12px_36px_rgba(0,0,0,0.35)]">
            <Link to={to} onClick={onNavigate} className="relative block h-[104px] bg-[var(--lt-card)]">
                {photoUrl ? (
                    <img
                        src={photoUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                ) : (
                    <span className="flex h-full items-center justify-center text-3xl opacity-40" aria-hidden="true">🍽️</span>
                )}
                {hasScore && (
                    <span className="absolute bottom-2 right-2 rounded-lg px-2 py-0.5 text-sm font-extrabold shadow-md" style={scoreBadgeStyle(score)}>
                        {formatScore(score)}
                    </span>
                )}
                {sponsored && (
                    <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">
                        Patrocinado
                    </span>
                )}
            </Link>
            <div className="px-3 pb-3 pt-2.5">
                <Link to={to} onClick={onNavigate} className="block truncate text-sm font-bold !text-[var(--lt-text)] hover:underline">
                    {title}
                </Link>
                {subtitle && <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--lt-text-muted)]">{subtitle}</p>}
                {children}
                <Link
                    to={to}
                    onClick={onNavigate}
                    className="lt-on-accent mt-2.5 flex items-center justify-center gap-0.5 rounded-xl bg-[var(--lt-accent)] py-1.5 text-xs font-bold transition-opacity hover:opacity-90"
                >
                    Ver detalles <ChevronRight className="h-3.5 w-3.5" />
                </Link>
            </div>
        </div>
    );
};

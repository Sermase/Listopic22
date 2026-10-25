import React from 'react';
import type { ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { Navigation, X } from 'lucide-react';
import { useBackToClose } from '../../hooks/useSheetDismiss';
import { LazyMapView as MapView } from '../lazy';

type MapProps = ComponentProps<typeof MapView>;

interface FullMapModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    items: MapProps['items'];
    mode?: MapProps['mode'];
    range?: number | null;
    /** «Cómo llegar»: abre la ruta en Google Maps. */
    directionsUrl?: string;
}

/** El mapa a pantalla completa (Inicio, perfil, sitio y plato). «Atrás» o la ✕ lo cierran; no se cierra deslizando, que es mover el mapa. */
export const FullMapModal: React.FC<FullMapModalProps> = ({ isOpen, onClose, title, subtitle, items, mode = 'global', range = null, directionsUrl }) => {
    useBackToClose(isOpen, onClose);
    if (!isOpen) return null;

    return createPortal(
        <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[9998] flex flex-col bg-[var(--lt-bg)] animate-fade-in">
            <div
                className="flex items-center gap-2 border-b border-[var(--lt-border)] bg-[var(--lt-card-strong)] px-4 pb-2.5"
                style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.625rem)' }}
            >
                <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-lg font-bold text-[var(--lt-text)]">{title}</h2>
                    {subtitle && <p className="truncate text-xs text-[var(--lt-text-muted)]">{subtitle}</p>}
                </div>
                {directionsUrl && (
                    <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold lt-on-accent"
                        style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                    >
                        <Navigation className="h-3.5 w-3.5" /> Cómo llegar
                    </a>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar mapa"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--lt-border)] text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
            <div className="relative min-h-0 flex-1" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <MapView items={items} mode={mode} range={range} scrollWheelZoom />
            </div>
        </div>,
        document.body,
    );
};

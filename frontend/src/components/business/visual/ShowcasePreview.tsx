/**
 * «Vista previa» de 🎨 Imagen: la cabecera pública real con el borrador, en
 * móvil (375px) o escritorio, una tira de carta con el color y el enlace a la
 * página de verdad.
 */
import React, { useCallback, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Tabs, type TabOption } from '../../ui/Tabs';
import { cn } from '../../../lib/utils';
import type { BusinessVisualData } from '../../../services/BusinessProService';
import { kit } from '../kit';
import { ShowcaseHero } from './ShowcaseHero';
import { DEVICE_SIZE, type PreviewDevice } from './previewDevice';
import { isValidAccent } from './visualMeta';

const DEVICE_TABS: TabOption<PreviewDevice>[] = [
    { value: 'mobile', label: 'Móvil', icon: <span aria-hidden="true">📱</span> },
    { value: 'desktop', label: 'Escritorio', icon: <span aria-hidden="true">💻</span> },
];

/** Ancho disponible de un contenedor (null hasta medirlo o sin ResizeObserver). */
function useElementWidth(): [(node: HTMLDivElement | null) => void, number | null] {
    const [width, setWidth] = useState<number | null>(null);
    const ref = useCallback((node: HTMLDivElement | null) => {
        if (!node || typeof ResizeObserver === 'undefined') return;
        setWidth(node.clientWidth || null);
        const observer = new ResizeObserver((entries) => {
            const next = entries[0]?.contentRect.width;
            if (next) setWidth(next);
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return [ref, width];
}

/**
 * Pinta `children` al tamaño real del dispositivo y lo reduce para que quepa
 * a lo ancho (y, si se pide, a lo alto).
 */
const ScaledFrame: React.FC<{ device: PreviewDevice; maxHeight?: number; children: React.ReactNode }> = ({ device, maxHeight, children }) => {
    const [measureRef, available] = useElementWidth();
    const { width, height } = DEVICE_SIZE[device];
    const byWidth = available ? available / width : 1;
    const byHeight = maxHeight ? maxHeight / height : 1;
    const scale = Math.min(1, byWidth, byHeight);

    return (
        <div ref={measureRef} className="w-full">
            <div
                className="relative mx-auto overflow-hidden rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-bg)] shadow-lg"
                style={{ width: width * scale, height: height * scale }}
            >
                <div
                    // Solo para mirar: nada de dentro recibe foco ni clics.
                    inert
                    aria-hidden="true"
                    className="pointer-events-none absolute left-0 top-0 origin-top-left"
                    style={{ width, height, transform: `scale(${scale})` }}
                >
                    {children}
                </div>
            </div>
        </div>
    );
};

export interface ShowcasePreviewProps {
    placeId: string;
    data: BusinessVisualData;
    name: string;
    address?: string;
    rating: { average: number | null; count: number };
    /** Lo que se ve en la cabecera (portada o, sin ella, la foto del local). */
    imageUrl?: string;
    onImageError?: () => void;
    /** Alto máximo de la cabecera (móvil: vista previa compacta). */
    maxHeight?: number;
    /** Encabezado «Vista previa» (en móvil lo pone el botón que la pliega). */
    showTitle?: boolean;
    className?: string;
}

export const ShowcasePreview: React.FC<ShowcasePreviewProps> = ({
    placeId,
    data,
    name,
    address,
    rating,
    imageUrl,
    onImageError,
    maxHeight,
    showTitle = true,
    className,
}) => {
    const [device, setDevice] = useState<PreviewDevice>('mobile');
    const accent = isValidAccent(data.accentColor) ? data.accentColor : 'var(--lt-accent)';

    return (
        <div className={cn('space-y-3', className)}>
            <div className={cn('flex flex-wrap items-center gap-2', showTitle ? 'justify-between' : 'justify-center')}>
                {showTitle && <h3 className="text-base font-black text-[var(--lt-text)]">Vista previa</h3>}
                <Tabs size="lg" ariaLabel="Ver como" value={device} options={DEVICE_TABS} onChange={setDevice} />
            </div>
            <p className="sr-only">
                {`Así se verá la cabecera de tu ficha en ${device === 'mobile' ? 'el móvil' : 'el ordenador'} con los cambios sin guardar.`}
            </p>

            <ScaledFrame device={device} maxHeight={maxHeight}>
                <ShowcaseHero
                    device={device}
                    name={name}
                    address={address}
                    heroText={data.heroText}
                    accentColor={data.accentColor}
                    visualStyle={data.visualStyle}
                    imageUrl={imageUrl}
                    onImageError={onImageError}
                    rating={rating}
                />
            </ScaledFrame>

            {/* Tira de carta: los títulos de sección van en tu color. */}
            <div aria-hidden="true" className={cn(kit.inset, 'overflow-hidden')}>
                <p className="border-b border-[var(--lt-border)] px-3 py-2 text-xs font-black uppercase tracking-[0.18em]" style={{ color: accent }}>
                    Entrantes
                </p>
                <ul className="divide-y divide-[var(--lt-border)] text-sm text-[var(--lt-text)]">
                    <li className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="truncate">Croquetas de la casa</span>
                        <span className="shrink-0 font-semibold text-[var(--lt-text-muted)]">1,80 €</span>
                    </li>
                    <li className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="truncate">Ensalada de temporada</span>
                        <span className="shrink-0 font-semibold text-[var(--lt-text-muted)]">9,50 €</span>
                    </li>
                </ul>
            </div>

            <a
                href={`/place/${encodeURIComponent(placeId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-bold text-[var(--lt-accent)] underline-offset-4 hover:underline', kit.focus)}
            >
                <span aria-hidden="true">👀</span>
                Ver mi página real
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
        </div>
    );
};

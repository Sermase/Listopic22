import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, Navigation, SlidersHorizontal, X } from 'lucide-react';
import { useBackToClose } from '../../hooks/useSheetDismiss';
import { useLocation } from '../../hooks/useLocation';
import { LazyMapView as MapView } from '../lazy';
import { normalizeMapItems } from './mapItems';
import type { MapItem } from './mapItems';
import { formatScore, scoreBadgeStyle } from '../../lib/scoreScale';

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

const MIN_SCORES = [0, 5, 7, 9] as const;
type SortKey = 'score' | 'near';

const distanceKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad;
    const dLng = (bLng - aLng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
};

const formatDistance = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`);

const useIsDesktop = () => {
    const query = '(min-width: 1024px)';
    const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
    useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = () => setDesktop(mql.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);
    return desktop;
};

const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${active
        ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]'
        : 'border-[var(--lt-border)] bg-[var(--lt-card)] text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`;

/**
 * El mapa a pantalla completa (Inicio, perfil, sitio y plato). «Atrás» o la ✕ lo cierran; no se cierra deslizando, que es mover el mapa.
 * Con varios sitios trae filtros y la lista: en escritorio a un lado, en el móvil en una hoja que asoma por abajo.
 */
export const FullMapModal: React.FC<FullMapModalProps> = (props) => {
    useBackToClose(props.isOpen, props.onClose);
    // Montado solo mientras está abierto: cada vez empieza sin filtros.
    return props.isOpen ? <FullMapContent {...props} /> : null;
};

const FullMapContent: React.FC<FullMapModalProps> = ({ isOpen, onClose, title, subtitle, items, mode = 'global', range = null, directionsUrl }) => {
    const isDesktop = useIsDesktop();
    const { location } = useLocation();

    const allItems = useMemo(() => normalizeMapItems(items), [items]);
    const hasPanel = allItems.length > 1;
    const tagOptions = useMemo(() => {
        const counts = new Map<string, number>();
        allItems.forEach((item) => item.lists?.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
    }, [allItems]);

    const [minScore, setMinScore] = useState<number>(0);
    const [tag, setTag] = useState('');
    const [sort, setSort] = useState<SortKey>('score');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);

    // En el móvil, la hoja abierta es una ventana más: «atrás» la baja antes de cerrar el mapa.
    useBackToClose(isOpen && !isDesktop && sheetOpen, () => { setSheetOpen(false); setFiltersOpen(false); });

    const activeFilters = (minScore > 0 ? 1 : 0) + (tag ? 1 : 0);
    const shown = useMemo(() => {
        const list = allItems.filter((item) => (!minScore || (item.rating ?? 0) >= minScore) && (!tag || item.lists?.includes(tag)));
        const withDistance = list.map((item) => ({
            item,
            km: location ? distanceKm(location.latitude, location.longitude, item.lat!, item.lng!) : null,
        }));
        if (sort === 'near' && location) withDistance.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
        else withDistance.sort((a, b) => (b.item.rating ?? 0) - (a.item.rating ?? 0));
        return withDistance;
    }, [allItems, minScore, tag, sort, location]);
    const mapItems = useMemo(() => shown.map(({ item }) => item), [shown]);

    // La hoja del móvil se arrastra entera: hacia arriba la sube y hacia abajo la baja
    // (siguiendo el dedo), salvo si la lista está desplazada y el dedo está encima.
    const sheetRef = useRef<HTMLDivElement | null>(null);
    const sheetOpenRef = useRef(sheetOpen);
    useLayoutEffect(() => { sheetOpenRef.current = sheetOpen; });
    const hasSheet = hasPanel && !isDesktop;
    useEffect(() => {
        const sheet = sheetRef.current;
        if (!hasSheet || !sheet) return;
        let y0 = 0;
        let t0 = 0;
        let dy = 0;
        let armed = false;
        let dragging = false;
        const listScrolled = (target: EventTarget | null) => {
            for (let el = target as HTMLElement | null; el && el !== sheet; el = el.parentElement) {
                if (el.scrollTop > 0) return true;
            }
            return false;
        };
        const start = (e: TouchEvent) => {
            armed = e.touches.length === 1 && !(e.target as HTMLElement | null)?.closest('select,input');
            dragging = false;
            dy = 0;
            y0 = e.touches[0].clientY;
            t0 = performance.now();
        };
        const move = (e: TouchEvent) => {
            if (!armed) return;
            dy = e.touches[0].clientY - y0;
            if (!dragging) {
                if (Math.abs(dy) < 8) return;
                // Abierta y hacia arriba es desplazar la lista; hacia abajo con la lista bajada, también.
                if ((sheetOpenRef.current && dy < 0) || (dy > 0 && listScrolled(e.target))) { armed = false; return; }
                dragging = true;
                sheet.style.transition = 'none';
            }
            if (sheetOpenRef.current) sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
            if (e.cancelable) e.preventDefault();
        };
        const end = () => {
            if (!dragging) return;
            dragging = false;
            armed = false;
            const fast = Math.abs(dy) / Math.max(1, performance.now() - t0) > 0.5;
            sheet.style.transition = '';
            sheet.style.transform = '';
            if (sheetOpenRef.current && (dy > 90 || (dy > 30 && fast))) { setSheetOpen(false); setFiltersOpen(false); }
            else if (!sheetOpenRef.current && dy < -30) setSheetOpen(true);
        };
        sheet.addEventListener('touchstart', start, { passive: true });
        sheet.addEventListener('touchmove', move, { passive: false });
        sheet.addEventListener('touchend', end);
        sheet.addEventListener('touchcancel', end);
        return () => {
            sheet.removeEventListener('touchstart', start);
            sheet.removeEventListener('touchmove', move);
            sheet.removeEventListener('touchend', end);
            sheet.removeEventListener('touchcancel', end);
        };
    }, [hasSheet]);

    const clearFilters = () => { setMinScore(0); setTag(''); };
    const pick = (item: MapItem) => {
        setFocus((prev) => ({ id: item.id, nonce: (prev?.nonce ?? 0) + 1 }));
        if (!isDesktop) { setSheetOpen(false); setFiltersOpen(false); }
    };
    const toggleFilters = () => {
        setFiltersOpen((v) => !v);
        if (!isDesktop) setSheetOpen(true);
    };

    const countLabel = `${shown.length} ${shown.length === 1 ? 'sitio' : 'sitios'}${activeFilters ? ` de ${allItems.length}` : ''}`;

    const filtersBlock = filtersOpen && (
        <div className="space-y-3 border-b border-[var(--lt-border)] px-4 py-3">
            <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--lt-text-muted)]">Nota mínima</p>
                <div className="flex flex-wrap gap-1.5">
                    {MIN_SCORES.map((value) => (
                        <button key={value} type="button" onClick={() => setMinScore(value)} className={chipClass(minScore === value)} aria-pressed={minScore === value}>
                            {value ? `${value}+` : 'Todas'}
                        </button>
                    ))}
                </div>
            </div>
            {tagOptions.length > 1 && (
                <label className="block">
                    <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[var(--lt-text-muted)]">Lista</span>
                    <select
                        value={tag}
                        onChange={(e) => setTag(e.target.value)}
                        className="w-full rounded-xl border border-[var(--lt-border)] bg-[var(--lt-card)] px-3 py-2 text-sm text-[var(--lt-text)]"
                    >
                        <option value="">Todas las listas</option>
                        {tagOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                </label>
            )}
            {location && (
                <div>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--lt-text-muted)]">Ordenar</p>
                    <div className="flex gap-1.5">
                        <button type="button" onClick={() => setSort('score')} className={chipClass(sort === 'score')} aria-pressed={sort === 'score'}>Mejor nota</button>
                        <button type="button" onClick={() => setSort('near')} className={chipClass(sort === 'near')} aria-pressed={sort === 'near'}>Más cerca</button>
                    </div>
                </div>
            )}
            {activeFilters > 0 && (
                <button type="button" onClick={clearFilters} className="text-xs font-semibold text-[var(--lt-accent)]">Quitar filtros</button>
            )}
        </div>
    );

    const list = (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain subtle-scrollbar py-1" data-no-swipe>
            {shown.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                    Nada con estos filtros. <button type="button" onClick={clearFilters} className="font-semibold text-[var(--lt-accent)]">Quitar filtros</button>
                </li>
            )}
            {shown.map(({ item, km }) => {
                const hasScore = (item.rating ?? 0) > 0;
                const line = [km !== null ? formatDistance(km) : null, item.subtitle || (item.reviewsCount ? `${item.reviewsCount} ${item.reviewsCount === 1 ? 'reseña' : 'reseñas'}` : null)].filter(Boolean).join(' · ');
                return (
                    <li key={item.id}>
                        <button
                            type="button"
                            onClick={() => pick(item)}
                            className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--lt-card)] ${focus?.id === item.id ? 'bg-[var(--lt-accent-soft)]' : ''}`}
                        >
                            {item.photoUrl
                                ? <img src={item.photoUrl} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                                : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--lt-card)] text-lg">{item.emoji || '📍'}</span>}
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-[var(--lt-text)]">{item.name}</span>
                                {line && <span className="block truncate text-xs text-[var(--lt-text-muted)]">{line}</span>}
                            </span>
                            {hasScore && (
                                <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold" style={scoreBadgeStyle(item.rating)}>{formatScore(item.rating)}</span>
                            )}
                        </button>
                    </li>
                );
            })}
        </ul>
    );

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
                {hasPanel && (
                    <button
                        type="button"
                        onClick={toggleFilters}
                        aria-pressed={filtersOpen}
                        className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold ${filtersOpen || activeFilters
                            ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]'
                            : 'border-[var(--lt-border)] text-[var(--lt-text)]'}`}
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
                        {activeFilters > 0 && (
                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--lt-accent)] px-1 text-[10px] text-white">{activeFilters}</span>
                        )}
                    </button>
                )}
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
            <div className="relative flex min-h-0 flex-1" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {hasPanel && isDesktop && (
                    <aside className="flex w-[340px] shrink-0 flex-col border-r border-[var(--lt-border)] bg-[var(--lt-card-strong)]" aria-label="Sitios del mapa">
                        {filtersBlock}
                        <p className="px-4 pb-1 pt-3 text-xs font-semibold text-[var(--lt-text-muted)]">{countLabel}</p>
                        {list}
                    </aside>
                )}
                {/* En el móvil el mapa acaba donde asoma la hoja, para que no tape «Centrar en mi ubicación». */}
                <div className="relative min-w-0 flex-1" style={hasPanel && !isDesktop ? { paddingBottom: 76 } : undefined}>
                    <MapView items={mapItems} mode={mode} range={range} scrollWheelZoom focusId={focus?.id ?? null} focusNonce={focus?.nonce} />
                </div>
                {hasPanel && !isDesktop && (
                    <div
                        ref={sheetRef}
                        className={`absolute inset-x-0 bottom-0 z-[1001] flex flex-col rounded-t-3xl border-t border-[var(--lt-border)] bg-[var(--lt-card-strong)] shadow-[0_-8px_24px_rgba(15,23,42,0.25)] transition-[max-height,transform] duration-200 ${sheetOpen ? 'max-h-[62%]' : 'max-h-[76px]'}`}
                        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        <button
                            type="button"
                            onClick={() => { setSheetOpen((v) => !v); if (sheetOpen) setFiltersOpen(false); }}
                            aria-expanded={sheetOpen}
                            className="flex w-full shrink-0 flex-col items-center px-4 pb-3 pt-2"
                        >
                            <span className="mb-2 h-1.5 w-10 rounded-full bg-[var(--lt-border-strong)]" aria-hidden="true" />
                            <span className="flex w-full items-center justify-between text-sm font-bold text-[var(--lt-text)]">
                                {countLabel}
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--lt-accent)]">
                                    {sheetOpen ? 'Ver mapa' : 'Ver lista'} <ChevronUp className={`h-4 w-4 transition-transform ${sheetOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </span>
                        </button>
                        {sheetOpen && (
                            <div className="flex min-h-0 flex-1 flex-col">
                                {filtersBlock}
                                {list}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
};

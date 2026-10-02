import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, MapPin, Search, X } from 'lucide-react';
import { algoliaClient, INDEX_NAMES } from '../../services/algoliaClient';
import { geoAreaLabel, type GeoLevel } from '../../lib/geoAreas';
import {
    buildZoneTree, searchZoneTree, zoneAttributes, zoneKey, zonesLabel,
    type Zone, type ZoneNode, type ZoneRecord,
} from '../../lib/searchZones';
import { useBotOnlyFilter } from './botOnlyFilter';

const LEVEL_NAME: Record<GeoLevel, string> = { country: 'país', region: 'comunidad', province: 'provincia', city: 'ciudad' };
const MAX_RECORDS = 1000;

interface ZonePickerProps {
    tab: 'items' | 'places';
    zones: Zone[];
    onChange: (zones: Zone[]) => void;
    /** Búsqueda actual, sin la zona: el árbol enseña solo zonas con resultados. */
    query: string;
    filters: string;
    geo?: { aroundLatLng?: string; aroundRadius?: number | 'all' };
}

const nodeKey = (path: ZoneNode[], node: ZoneNode) => [...path, node].map((n) => zoneKey(n)).join('/');

/**
 * Buscar: zona en cascada (país → comunidad → provincia → ciudad), varias a la
 * vez y de niveles distintos («Comunidad de Madrid» + «Segovia provincia»).
 * El árbol se calcula con los resultados de la búsqueda actual.
 */
export const ZonePicker: React.FC<ZonePickerProps> = ({ tab, zones: committedZones, onChange: commitZones, query, filters, geo }) => {
    // La casilla responde al momento; la URL (y la búsqueda) llegan después.
    const [zones, setZones] = useState<Zone[]>(committedZones);
    const committedKey = committedZones.map(zoneKey).join('|');
    useEffect(() => { setZones(committedZones); }, [committedKey]); // eslint-disable-line react-hooks/exhaustive-deps
    const onChange = (next: Zone[]) => {
        setZones(next);
        commitZones(next);
    };
    const [open, setOpen] = useState(false);
    const [tree, setTree] = useState<ZoneNode[] | null>(null);
    const [truncated, setTruncated] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [text, setText] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    const selected = useMemo(() => new Set(zones.map(zoneKey)), [zones]);
    // Mismos elementos que los resultados (sin los de solo bots salvo con el filtro «Bots»).
    const botFilter = useBotOnlyFilter(tab);
    const effectiveFilters = [filters, botFilter].filter(Boolean).join(' AND ');
    const loadKey = JSON.stringify([tab, query, effectiveFilters, geo?.aroundLatLng ?? null, geo?.aroundRadius ?? null]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const attrs = zoneAttributes(tab);
        setLoading(true);
        setError(null);
        algoliaClient.search({
            requests: [{
                indexName: tab === 'places' ? INDEX_NAMES.places : INDEX_NAMES.items,
                query,
                filters: effectiveFilters || undefined,
                hitsPerPage: MAX_RECORDS,
                attributesToRetrieve: Object.values(attrs),
                attributesToHighlight: [],
                attributesToSnippet: [],
                analytics: false,
                ...(geo?.aroundLatLng ? { aroundLatLng: geo.aroundLatLng, aroundRadius: geo.aroundRadius } : {}),
            }],
        }).then((response) => {
            if (cancelled) return;
            const result = response.results[0] as { hits?: Array<Record<string, unknown>>; nbHits?: number };
            const hits = result.hits || [];
            const records: ZoneRecord[] = hits.map((hit) => ({
                country: hit[attrs.country] as string | undefined,
                region: hit[attrs.region] as string | undefined,
                province: hit[attrs.province] as string | undefined,
                city: hit[attrs.city] as string | undefined,
            }));
            const nextTree = buildZoneTree(records);
            setTree(nextTree);
            setTruncated((result.nbHits ?? hits.length) > hits.length);
            // Un solo país: se abre directamente en sus comunidades.
            if (nextTree.length === 1) setExpanded((prev) => new Set(prev).add(nodeKey([], nextTree[0])));
        }).catch((e) => {
            if (cancelled) return;
            console.error('ZonePicker: no se pudieron cargar las zonas', e);
            setError('No se han podido cargar las zonas.');
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
        // loadKey resume tab, query, filters y geo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, loadKey]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const toggle = (node: ZoneNode) => {
        const key = zoneKey(node);
        if (selected.has(key)) {
            onChange(zones.filter((z) => zoneKey(z) !== key));
            return;
        }
        // Al elegir una zona sobran las que ya contiene.
        const inside = new Set<string>();
        const walk = (n: ZoneNode) => n.children.forEach((c) => { inside.add(zoneKey(c)); walk(c); });
        walk(node);
        onChange([...zones.filter((z) => !inside.has(zoneKey(z))), { level: node.level, value: node.value }]);
    };

    const toggleExpanded = (key: string) => setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const label = zonesLabel(zones);
    const matches = useMemo(() => (tree ? searchZoneTree(tree, text) : []), [tree, text]);

    const renderRow = (node: ZoneNode, path: ZoneNode[], depth: number, showPath = false) => {
        const key = nodeKey(path, node);
        const isSelected = selected.has(zoneKey(node));
        const inheritedFrom = path.find((p) => selected.has(zoneKey(p)));
        const hasChildren = node.children.length > 0 && !showPath;
        const isOpen = expanded.has(key);
        return (
            <li key={key}>
                <div className="flex items-center gap-1 rounded-lg pr-2 hover:bg-[var(--lt-accent-soft)]" style={{ paddingLeft: `${depth * 14 + 4}px` }}>
                    {hasChildren ? (
                        <button
                            type="button"
                            onClick={() => toggleExpanded(key)}
                            aria-label={`${isOpen ? 'Plegar' : 'Desplegar'} ${node.value}`}
                            aria-expanded={isOpen}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]"
                        >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                    ) : <span className="w-7 shrink-0" />}
                    <label className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-sm ${inheritedFrom ? 'opacity-60' : ''}`} title={inheritedFrom ? `Incluida en ${geoAreaLabel(inheritedFrom.level, inheritedFrom.value)}` : undefined}>
                        <input
                            type="checkbox"
                            checked={isSelected || Boolean(inheritedFrom)}
                            disabled={Boolean(inheritedFrom)}
                            onChange={() => toggle(node)}
                            className="h-4 w-4 shrink-0 accent-[var(--lt-accent)]"
                        />
                        <span className="min-w-0 flex-1 truncate text-[var(--lt-text)]">
                            {geoAreaLabel(node.level, node.value)}
                            {showPath && path.length > 0 && (
                                <span className="text-[11px] text-[var(--lt-text-muted)]"> · {path.slice(1).map((p) => p.value).join(' · ') || path[0].value}</span>
                            )}
                        </span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--lt-text-muted)]">{LEVEL_NAME[node.level]}</span>
                        <span className="shrink-0 tabular-nums text-xs font-bold text-[var(--lt-text-muted)]">{node.count}</span>
                    </label>
                </div>
                {hasChildren && isOpen && (
                    <ul>{node.children.map((child) => renderRow(child, [...path, node], depth + 1))}</ul>
                )}
            </li>
        );
    };

    return (
        <div ref={containerRef} className="relative" role="group" aria-label="Zona">
            <div className="inline-flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-haspopup="dialog"
                    className={`inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${label ? 'border-[var(--lt-accent)] bg-[var(--lt-accent)] text-white' : 'border-[var(--lt-border)] bg-[var(--lt-bg)] text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]'}`}
                >
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{label ? label : 'Zona: toda'}</span>
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {label && (
                    <button type="button" onClick={() => onChange([])} aria-label="Quitar zona" className="rounded-full p-1 text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {open && (
                <>
                    <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="fixed inset-0 z-[1190] bg-black/40 sm:hidden" />
                    <div
                        role="dialog"
                        aria-label="Elegir zona"
                        className="fixed inset-x-0 bottom-0 z-[1200] flex max-h-[80vh] flex-col rounded-t-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:max-h-[65vh] sm:w-96 sm:rounded-2xl"
                    >
                        <div className="flex items-center justify-between gap-2 border-b border-[var(--lt-border)] px-4 py-3">
                            <div>
                                <p className="text-sm font-black text-[var(--lt-text)]">Zona</p>
                                <p className="text-[11px] text-[var(--lt-text-muted)]">Elige una o varias, del nivel que quieras.</p>
                            </div>
                            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-full p-1.5 text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {zones.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 border-b border-[var(--lt-border)] px-4 py-2">
                                {zones.map((z) => (
                                    <span key={zoneKey(z)} className="inline-flex items-center gap-1 rounded-full border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--lt-text)]">
                                        {geoAreaLabel(z.level, z.value)}
                                        <button type="button" onClick={() => onChange(zones.filter((x) => zoneKey(x) !== zoneKey(z)))} aria-label={`Quitar ${z.value}`} className="text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                                <button type="button" onClick={() => onChange([])} className="text-[11px] font-bold text-[var(--lt-text-muted)] underline-offset-2 hover:underline">Quitar todas</button>
                            </div>
                        )}

                        <div className="px-4 pt-3">
                            <label className="flex items-center gap-2 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-bg)] px-3 py-2">
                                <Search className="h-4 w-4 shrink-0 text-[var(--lt-text-muted)]" aria-hidden />
                                <input
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="Buscar ciudad, provincia, comunidad…"
                                    aria-label="Buscar zona"
                                    className="min-w-0 flex-1 bg-transparent text-sm text-[var(--lt-text)] outline-none placeholder:text-[var(--lt-text-muted)]"
                                />
                            </label>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
                            {loading && !tree ? (
                                <p className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--lt-text-muted)]">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando zonas…
                                </p>
                            ) : error ? (
                                <p role="alert" className="py-8 text-center text-sm text-[var(--lt-text-muted)]">{error}</p>
                            ) : !tree || tree.length === 0 ? (
                                <p className="py-8 text-center text-sm text-[var(--lt-text-muted)]">Esta búsqueda no tiene resultados con zona.</p>
                            ) : text.trim() ? (
                                matches.length ? (
                                    <ul>{matches.map(({ node, path }) => renderRow(node, path, 0, true))}</ul>
                                ) : (
                                    <p className="py-8 text-center text-sm text-[var(--lt-text-muted)]">Ninguna zona coincide.</p>
                                )
                            ) : (
                                <ul>{tree.map((node) => renderRow(node, [], 0))}</ul>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-2 border-t border-[var(--lt-border)] px-4 py-3">
                            <p className="text-[11px] text-[var(--lt-text-muted)]">
                                {truncated ? `Zonas de los primeros ${MAX_RECORDS} resultados.` : 'El número es de resultados.'}
                            </p>
                            <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-[var(--lt-accent)] px-4 py-1.5 text-xs font-black text-white">
                                Listo
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

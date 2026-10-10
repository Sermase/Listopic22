/**
 * 🗺️ Portada y mapa: pedir que el negocio salga destacado en la portada
 * (Explorar) o con chincheta dorada en el mapa. Lo revisa un administrador.
 *
 *   <PlacementPanel placeId={id} placements={data.placements} draft={draft}
 *     onDraftChange={setDraft} place={place} onSubmitted={(placementId) => …} />
 *
 * El borrador vive en el padre (no se pierde al cambiar de subpestaña).
 */
import React, { useState } from 'react';
import { requestSponsoredPlacement, type SponsoredPlacement } from '../../../services/BusinessProService';
import { Button } from '../../ui/Button';
import { cn } from '../../../lib/utils';
import {
    businessErrorCopy,
    ChoiceCards,
    EmojiChip,
    QuickDateRange,
    SectionHeader,
    SoftCard,
    TextField,
    type ChoiceOption,
} from '../kit';
import { SponsoredHomeCard } from './SponsoredHomeCard';
import {
    HEADLINE_IDEAS,
    MAX_OPEN_PLACEMENTS,
    MAX_PLACEMENT_HEADLINE,
    type PlacementDraft,
} from './sponsoredMeta';
import type { Loadable } from './useSponsoredData';
import type { PlacePreview } from './usePlacePreview';

export interface PlacementPanelProps {
    placeId: string;
    placements: Loadable<SponsoredPlacement[]>;
    draft: PlacementDraft;
    onDraftChange: (updater: (prev: PlacementDraft) => PlacementDraft) => void;
    place: PlacePreview;
    onSubmitted: (placementId: string) => void;
}

/** Mini mapa con calles y la chincheta dorada de los patrocinados. */
export const MapPinPreview: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 160 90" aria-hidden="true" className={cn('h-auto w-full', className)}>
        <rect x="0" y="0" width="160" height="90" rx="12" className="fill-[var(--lt-glass)]" />
        <path d="M0 62 C40 54 70 70 160 48" strokeWidth="6" fill="none" className="stroke-[var(--lt-border-strong)]" />
        <path d="M52 0 L66 90" strokeWidth="5" fill="none" className="stroke-[var(--lt-border-strong)]" />
        <path d="M112 0 C104 30 120 60 108 90" strokeWidth="4" fill="none" className="stroke-[var(--lt-border)]" />
        <circle cx="30" cy="30" r="4" className="fill-[var(--lt-text-muted)]" opacity="0.5" />
        <circle cx="132" cy="70" r="4" className="fill-[var(--lt-text-muted)]" opacity="0.5" />
        <circle cx="90" cy="20" r="4" className="fill-[var(--lt-text-muted)]" opacity="0.5" />
        <circle cx="86" cy="40" r="16" className="fill-[var(--lt-promo-soft)]" />
        <path
            d="M86 20 C77 20 71 27 71 35 C71 46 86 58 86 58 C86 58 101 46 101 35 C101 27 95 20 86 20 Z"
            strokeWidth="2"
            className="fill-[var(--lt-promo)] stroke-[var(--lt-card-strong)]"
        />
        <circle cx="86" cy="35" r="5" className="fill-[var(--lt-card-strong)]" />
    </svg>
);

export const PlacementPanel: React.FC<PlacementPanelProps> = ({ placeId, placements, draft, onDraftChange, place, onSubmitted }) => {
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const patch = (next: Partial<PlacementDraft>) => {
        onDraftChange((prev) => ({ ...prev, ...next }));
        setError(null);
    };

    const openCount = placements.status === 'ready'
        ? placements.data.filter((row) => row.status === 'requested' || row.status === 'active').length
        : null;
    const full = openCount !== null && openCount >= MAX_OPEN_PLACEMENTS;
    const headline = draft.headline.trim();

    const typeOptions: ChoiceOption<SponsoredPlacement['type']>[] = [
        {
            value: 'home',
            title: '🏠 En la portada',
            subtitle: 'En Explorar, hasta 3 negocios a la vez.',
            preview: (
                <span className="pointer-events-none block">
                    <SponsoredHomeCard
                        placeName={place.name}
                        headline={headline || undefined}
                        address={place.address}
                        photoUrl={place.photoUrl}
                    />
                </span>
            ),
        },
        {
            value: 'search',
            title: '🗺️ En el mapa',
            subtitle: 'Tu chincheta brilla cuando buscan por la zona.',
            preview: <MapPinPreview className="max-h-24" />,
        },
    ];

    const submit = async () => {
        if (sending || full) return;
        setSending(true);
        setError(null);
        try {
            const result = await requestSponsoredPlacement({
                placeId,
                type: draft.type,
                headline: headline || undefined,
                startsAt: draft.startsAt || undefined,
                endsAt: draft.endsAt || undefined,
            });
            onSubmitted(result.placementId);
        } catch (err) {
            console.error('PlacementPanel: request failed', err);
            setError(businessErrorCopy(err, '😕 No se pudo enviar la solicitud.').message);
        } finally {
            setSending(false);
        }
    };

    return (
        <SoftCard as="section" aria-labelledby="promos-placement-title" className="space-y-5 p-4 sm:p-5">
            <SectionHeader
                as="h3"
                id="promos-placement-title"
                emoji="🗺️"
                title="Portada y mapa"
                help="Destaca tu negocio entero, siempre con la etiqueta Patrocinado. Lo revisa un administrador."
            />

            <ChoiceCards
                legend="¿Dónde quieres salir?"
                options={typeOptions}
                value={draft.type}
                onChange={(type) => patch({ type })}
                columns={2}
            />

            <div className="space-y-2">
                <TextField
                    label="💬 Mensaje corto (opcional)"
                    value={draft.headline}
                    onChange={(value) => patch({ headline: value })}
                    max={MAX_PLACEMENT_HEADLINE}
                    placeholder="Nueva carta de temporada"
                />
                <div role="group" aria-label="Ideas para el mensaje" className="flex flex-wrap gap-2">
                    {HEADLINE_IDEAS.map((idea) => {
                        const text = `${idea.emoji} ${idea.text}`;
                        const selected = headline === text;
                        return (
                            <EmojiChip
                                key={idea.text}
                                emoji={idea.emoji}
                                label={idea.text}
                                size="sm"
                                selected={selected}
                                onToggle={() => patch({ headline: selected ? '' : text })}
                            />
                        );
                    })}
                </div>
            </div>

            <div className="space-y-2">
                <QuickDateRange
                    legend="📅 ¿Cuándo?"
                    start={draft.startsAt}
                    end={draft.endsAt}
                    onChange={({ start, end }) => patch({ startsAt: start, endsAt: end })}
                    allowOpenEnd
                />
                <p className="text-xs text-[var(--lt-text-muted)]">Sin fechas, se activa en cuanto el administrador la apruebe.</p>
            </div>

            <div className="space-y-2 border-t border-[var(--lt-border)] pt-4">
                {error && (
                    <p role="alert" className="rounded-xl bg-[var(--lt-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--lt-danger)]">{error}</p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                    <p className={cn('min-w-0 flex-1 text-sm font-semibold', full ? 'text-[var(--lt-warning)]' : 'text-[var(--lt-text-muted)]')}>
                        {openCount === null
                            ? (placements.status === 'error' ? null : 'Comprobando tus solicitudes…')
                            : <><span aria-hidden="true">📬 </span>{openCount}/{MAX_OPEN_PLACEMENTS} solicitudes abiertas</>}
                    </p>
                    <Button
                        variant="primary"
                        onClick={() => void submit()}
                        disabled={full || placements.status === 'loading'}
                        loading={sending}
                        className="min-h-11"
                    >
                        📣 Enviar solicitud
                    </Button>
                </div>
                <p className="text-xs text-[var(--lt-text-muted)]">
                    {full
                        ? `Ya tienes ${MAX_OPEN_PLACEMENTS} abiertas: espera a que el administrador revise alguna.`
                        : <><span aria-hidden="true">🕵️ </span>Un administrador la revisa y te llega una notificación.</>}
                </p>
            </div>
        </SoftCard>
    );
};

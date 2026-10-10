import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import { DELIVERY_PROVIDER_OPTIONS, INFO_LIMITS } from '../../../constants/businessInfoOptions';
import type { BusinessDeliveryLink, DeliveryProvider } from '../../../types/businessInfo';
import { cn } from '../../../lib/utils';
import { IconButton } from '../../ui/IconButton';
import { EmptyState, Switch, TextAreaField, TextField, kit } from '../kit';
import type { SectionFormProps } from './formTypes';
import { EmojiText, FormStack } from './formParts';
import { deliveryProviderLabel, isLikelyUrl, withProtocol } from './fichaModel';

const providerOption = (provider: DeliveryProvider | undefined) => (
    DELIVERY_PROVIDER_OPTIONS.find((option) => option.value === (provider || 'custom')) || DELIVERY_PROVIDER_OPTIONS[DELIVERY_PROVIDER_OPTIONS.length - 1]
);

let nextRowId = 0;
const newRowId = () => {
    nextRowId += 1;
    return `delivery-${nextRowId}`;
};

/**
 * Ids estables de las filas (F11): no dependen del proveedor ni de la posición,
 * así cambiar un campo no remonta la fila ni se pierde el foco.
 */
const useRowIds = (count: number) => {
    const [ids, setIds] = useState<string[]>(() => Array.from({ length: count }, newRowId));
    // Si el número de enlaces cambia desde fuera, se completan con ids fijos por posición.
    const synced = ids.length === count ? ids : Array.from({ length: count }, (_, index) => ids[index] || `delivery-at-${index}`);
    return [synced, setIds] as const;
};

interface Removed {
    link: BusinessDeliveryLink;
    index: number;
    id: string;
}

/** 🛵 Delivery: enlaces para pedir a domicilio. */
export const DeliveriesForm: React.FC<SectionFormProps<'deliveries'>> = ({ doc, onChange }) => {
    const links = doc.data.links || [];
    const [ids, setIds] = useRowIds(links.length);
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [removed, setRemoved] = useState<Removed | null>(null);
    const [focusId, setFocusId] = useState<string | null>(null);
    const urlInputs = useRef(new Map<string, HTMLInputElement>());
    const atMax = links.length >= INFO_LIMITS.deliveryLinks;
    const enabled = doc.data.enabled === true;

    useEffect(() => {
        if (!focusId) return;
        urlInputs.current.get(focusId)?.focus();
    }, [focusId]);

    const updateLink = (index: number, patch: Partial<BusinessDeliveryLink>) => {
        onChange({ links: links.map((link, current) => (current === index ? { ...link, ...patch } : link)) });
    };

    const addLink = (provider: DeliveryProvider) => {
        if (atMax) return;
        const id = newRowId();
        setIds([...ids, id]);
        setRemoved(null);
        setFocusId(id);
        // El primer enlace enciende «Mostrar pedidos a domicilio».
        onChange({ links: [...links, { provider, label: '', url: '' }], enabled: links.length === 0 ? true : doc.data.enabled });
    };

    const removeLink = (index: number) => {
        const next = links.filter((_, current) => current !== index);
        setRemoved({ link: links[index], index, id: ids[index] });
        setIds(ids.filter((_, current) => current !== index));
        onChange({ links: next, enabled: next.length > 0 ? doc.data.enabled : false });
    };

    const undoRemove = () => {
        if (!removed || atMax) return;
        const next = [...links];
        next.splice(Math.min(removed.index, next.length), 0, removed.link);
        const nextIds = [...ids];
        nextIds.splice(Math.min(removed.index, nextIds.length), 0, removed.id);
        setIds(nextIds);
        onChange({ links: next, enabled: links.length === 0 ? true : doc.data.enabled });
        setRemoved(null);
    };

    return (
        <FormStack>
            <div className="space-y-4">
                {links.length === 0 ? (
                    <EmptyState
                        size="sm"
                        emoji="🛵"
                        title="Aún no tienes enlaces de pedidos"
                        text="Añade Glovo, Just Eat… y aparecerán como botones en tu ficha."
                    />
                ) : (
                    <ul className="space-y-3" aria-label="Tus enlaces de pedidos">
                        {links.map((link, index) => {
                            const id = ids[index];
                            const option = providerOption(link.provider);
                            const url = link.url || '';
                            const missing = !url.trim();
                            const invalid = !missing && !isLikelyUrl(url);
                            const showError = touched[id] === true;
                            return (
                                <li key={id} className={cn(kit.inset, 'space-y-3 p-3 sm:p-4')}>
                                    <div className="flex items-center gap-3">
                                        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] text-xl leading-none">
                                            {option.emoji}
                                        </span>
                                        <h3 className="min-w-0 flex-1 truncate text-sm font-black text-[var(--lt-text)]">{option.label}</h3>
                                        <IconButton
                                            label={`Quitar el enlace de ${option.label}`}
                                            icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                                            variant="danger"
                                            className="h-11 w-11"
                                            onClick={() => removeLink(index)}
                                        />
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <TextField
                                            label="Texto del botón"
                                            value={link.label || ''}
                                            onChange={(label) => updateLink(index, { label })}
                                            max={INFO_LIMITS.deliveryLabel}
                                            placeholder={`Pedir en ${option.label}`}
                                        />
                                        <TextField
                                            ref={(node) => {
                                                if (node) urlInputs.current.set(id, node);
                                                else urlInputs.current.delete(id);
                                            }}
                                            label="Enlace"
                                            type="url"
                                            inputMode="url"
                                            value={url}
                                            onChange={(next) => updateLink(index, { url: next })}
                                            onBlur={() => {
                                                setTouched((prev) => ({ ...prev, [id]: true }));
                                                const fixed = withProtocol(url);
                                                if (fixed !== url) updateLink(index, { url: fixed });
                                            }}
                                            placeholder="https://…"
                                            spellCheck={false}
                                            error={showError && missing ? '✋ Falta el enlace' : showError && invalid ? '✋ Este enlace no parece válido' : undefined}
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {removed && (
                    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[var(--lt-glass)] px-3 py-2 text-sm text-[var(--lt-text-muted)]">
                        <span className="min-w-0 flex-1">
                            <span aria-hidden="true">🗑️ </span>Quitado el enlace de {deliveryProviderLabel(removed.link.provider)}.
                        </span>
                        <button
                            type="button"
                            onClick={undoRemove}
                            disabled={atMax}
                            className={cn('min-h-11 rounded-lg px-2 font-bold text-[var(--lt-accent)] underline underline-offset-4', kit.focus)}
                        >
                            Deshacer
                        </button>
                    </div>
                )}

                <fieldset className="min-w-0 space-y-2">
                    <legend className="flex w-full items-center justify-between gap-3">
                        <span className={kit.label}><EmojiText emoji="➕">Añadir un enlace</EmojiText></span>
                        <span className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                            atMax ? 'bg-[var(--lt-warning-soft)] text-[var(--lt-warning)]' : 'bg-[var(--lt-glass)] text-[var(--lt-text-muted)]',
                        )}>
                            <span aria-hidden="true">{links.length}/{INFO_LIMITS.deliveryLinks}</span>
                            <span className="sr-only">{`${links.length} de ${INFO_LIMITS.deliveryLinks} como máximo`}</span>
                        </span>
                    </legend>
                    <div className="flex flex-wrap gap-2">
                        {DELIVERY_PROVIDER_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                disabled={atMax}
                                title={atMax ? `${INFO_LIMITS.deliveryLinks} como máximo` : undefined}
                                onClick={() => addLink(option.value)}
                                className={cn(
                                    'inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                    kit.focus,
                                    kit.idle,
                                )}
                            >
                                <span aria-hidden="true" className="text-lg leading-none">{option.emoji}</span>
                                {option.label}
                            </button>
                        ))}
                    </div>
                    {atMax && <p className="text-xs font-semibold text-[var(--lt-warning)]">✋ {INFO_LIMITS.deliveryLinks} como máximo</p>}
                </fieldset>
            </div>

            {links.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-start">
                    <Switch
                        checked={enabled}
                        onChange={(next) => onChange({ enabled: next })}
                        label={<EmojiText emoji="🛵">Mostrar pedidos a domicilio</EmojiText>}
                        description="Los enlaces salen como botones en tu ficha."
                    />
                    <div className="space-y-1.5" aria-hidden="true">
                        <p className="text-xs font-semibold text-[var(--lt-text-muted)]">Así se verá en tu ficha:</p>
                        <div className={cn('space-y-2 transition-opacity', !enabled && 'opacity-35 grayscale')}>
                            {links.map((link, index) => {
                                const option = providerOption(link.provider);
                                return (
                                    <div key={ids[index]} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 text-sm font-bold text-[var(--lt-text)]">
                                        <span className="truncate">{link.label?.trim() || `Pedir en ${option.label}`}</span>
                                        <ExternalLink className="h-4 w-4 shrink-0 text-[var(--lt-text-muted)]" />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <TextAreaField
                label={<EmojiText emoji="📝">Notas</EmojiText>}
                value={doc.data.notes || ''}
                onChange={(notes) => onChange({ notes })}
                max={INFO_LIMITS.notes}
                rows={3}
                placeholder="También repartimos por teléfono los fines de semana…"
            />
        </FormStack>
    );
};

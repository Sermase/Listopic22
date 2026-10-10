import React from 'react';
import {
    CUISINE_OPTIONS,
    INFO_LIMITS,
    PAYMENT_OPTIONS,
    PRICE_RANGE_OPTIONS,
    SERVICE_GROUPS,
    type PriceRange,
} from '../../../constants/businessInfoOptions';
import { ChipGroup, ChoiceCards, type ChipOption, type ChipOptionGroup, type ChoiceOption } from '../kit';
import { includesFolded } from '../kit/text';
import type { SectionFormProps } from './formTypes';
import { EmojiText, FormStack, GoLink } from './formParts';

const PRICE_CHOICES: Array<ChoiceOption<PriceRange>> = PRICE_RANGE_OPTIONS.map((option) => ({
    value: option.value,
    emoji: option.emoji,
    title: option.label,
    subtitle: option.symbol,
}));

const toChip = ({ value, label, emoji, hint }: { value: string; label: string; emoji: string; hint?: string }): ChipOption => ({ value, label, emoji, hint });

const CUISINE_CHIPS = CUISINE_OPTIONS.map(toChip);
const COMMON_PAYMENT_CHIPS = PAYMENT_OPTIONS.filter((option) => option.common).map(toChip);
const MORE_PAYMENT_CHIPS = PAYMENT_OPTIONS.filter((option) => !option.common).map(toChip);

/** 🛎️ Cocina, pagos y servicios. */
export const CommercialForm: React.FC<SectionFormProps<'commercial'>> = ({ doc, onChange, ctx }) => {
    const services = doc.data.services || [];
    const hasReservations = includesFolded(services, 'Reservas');

    const serviceGroups: ChipOptionGroup[] = SERVICE_GROUPS.map((group, index) => ({
        key: group.id,
        title: group.title,
        emoji: group.emoji,
        options: group.options.map(toChip),
        defaultOpen: index === 0,
        storageKey: `listopic_ficha_services_${group.id}`,
        footer: group.id === 'family' && ctx?.goToSection
            ? <GoLink onClick={() => ctx.goToSection?.('family')}>Detállalo en <EmojiText emoji="👨‍👩‍👧">Familias →</EmojiText></GoLink>
            : group.id === 'eat' && hasReservations && ctx?.goToSection
                ? <GoLink onClick={() => ctx.goToSection?.('reservations')}>Configura el botón en <EmojiText emoji="📅">Reservas →</EmojiText></GoLink>
                : undefined,
    }));

    return (
        <FormStack>
            <ChoiceCards
                legend={<EmojiText emoji="💶">Precio</EmojiText>}
                help="Lo que suele gastar una persona."
                options={PRICE_CHOICES}
                value={doc.data.priceRange || null}
                columns={4}
                allowClear
                clearLabel="Quitar precio"
                onChange={(priceRange) => onChange({ priceRange: priceRange ?? undefined })}
            />

            <ChipGroup
                legend={<EmojiText emoji="🍽️">Tipo de cocina</EmojiText>}
                help="Elige todas las que encajen. Así te encuentran al buscar."
                options={CUISINE_CHIPS}
                value={doc.data.cuisineTypes || []}
                onChange={(cuisineTypes) => onChange({ cuisineTypes })}
                max={INFO_LIMITS.cuisineTypes}
                allowOther
                otherPlaceholder="Otra cocina"
            />

            <ChipGroup
                legend={<EmojiText emoji="💳">Formas de pago</EmojiText>}
                help="Las más habituales primero."
                options={COMMON_PAYMENT_CHIPS}
                groups={[{
                    key: 'more',
                    title: `Ver más formas de pago (${MORE_PAYMENT_CHIPS.length})`,
                    options: MORE_PAYMENT_CHIPS,
                    storageKey: 'listopic_ficha_payments_more',
                }]}
                value={doc.data.paymentMethods || []}
                onChange={(paymentMethods) => onChange({ paymentMethods })}
                max={INFO_LIMITS.paymentMethods}
            />

            <ChipGroup
                legend={<EmojiText emoji="🛎️">Servicios</EmojiText>}
                help="Marca solo lo que ofreces de verdad."
                groups={serviceGroups}
                value={services}
                onChange={(next) => onChange({ services: next })}
                max={INFO_LIMITS.services}
                customTitle="Otros servicios guardados"
            />
        </FormStack>
    );
};

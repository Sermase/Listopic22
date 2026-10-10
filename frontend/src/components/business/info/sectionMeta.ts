import type {
    BusinessHoursPeriod,
    BusinessInfoDocument,
    BusinessInfoSection,
} from '../../../types/businessInfo';
import {
    ACCESSIBILITY_OPTIONS,
    ALLERGEN_INFO_OPTIONS,
    CONTACT_FIELDS,
    CUISINE_OPTIONS,
    DELIVERY_PROVIDER_OPTIONS,
    DIET_OPTIONS,
    FAMILY_OPTIONS,
    GLUTEN_OPTIONS,
    PET_AMENITY_OPTIONS,
    PET_POLICY_OPTIONS,
    PRICE_RANGE_OPTIONS,
    RESERVATION_PROVIDER_OPTIONS,
    findLanguageOption,
    findOptionByText,
    findOptionByValue,
    type InfoFlag,
} from '../../../constants/businessInfoOptions';

// Metadatos de cada sección de la Ficha: emoji, título, ayuda, grupo, estado de
// completado (solo frontend, spec §5.2) y un resumen corto de lo que hay.

export type SectionStatus = 'empty' | 'partial' | 'complete';

export type SectionGroupId = 'basics' | 'offer' | 'audience' | 'orders';

export const SECTION_GROUPS: Array<{ id: SectionGroupId; title: string; sections: BusinessInfoSection[] }> = [
    { id: 'basics', title: 'Lo básico', sections: ['identity', 'contact', 'hours'] },
    { id: 'offer', title: 'Qué ofreces', sections: ['commercial', 'dietary'] },
    { id: 'audience', title: 'Para quién es', sections: ['accessibility', 'family', 'pets'] },
    { id: 'orders', title: 'Pide o reserva', sections: ['reservations', 'deliveries'] },
];

/** Orden de navegación (anterior / siguiente): el de los grupos. */
export const SECTION_ORDER: BusinessInfoSection[] = SECTION_GROUPS.flatMap((group) => group.sections);

export const SECTION_STATUS_META: Record<SectionStatus, { emoji: string; label: string; tone: 'neutral' | 'warning' | 'success' }> = {
    empty: { emoji: '➕', label: 'Sin empezar', tone: 'neutral' },
    partial: { emoji: '✏️', label: 'A medias', tone: 'warning' },
    complete: { emoji: '✅', label: 'Completo', tone: 'success' },
};

export interface SectionMeta<S extends BusinessInfoSection = BusinessInfoSection> {
    id: S;
    emoji: string;
    title: string;
    /** Una línea bajo el título. */
    help: string;
    /** Por qué merece la pena rellenarla (el «Siguiente: …» del progreso). */
    nudge: string;
    group: SectionGroupId;
    status: (doc: BusinessInfoDocument<S>) => SectionStatus;
    summary: (doc: BusinessInfoDocument<S>) => string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ayudas
// ─────────────────────────────────────────────────────────────────────────────

/** Mismo criterio que hasContent del backend: algo marcado o escrito. */
export const hasContent = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.values(value).some(hasContent);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().length > 0;
    return Boolean(value);
};

const filled = (value: string | undefined): boolean => typeof value === 'string' && value.trim().length > 0;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const isValidPeriod = (period: BusinessHoursPeriod | undefined): boolean => Boolean(
    period && TIME_PATTERN.test(period.open) && TIME_PATTERN.test(period.close),
);

/** Las reglas de «Completo»; el resto es «A medias» si hay algo y «Sin empezar» si no. */
const statusFrom = (doc: BusinessInfoDocument, complete: boolean): SectionStatus => {
    if (complete) return 'complete';
    return hasContent(doc.data) ? 'partial' : 'empty';
};

/** Secciones en las que «nada» es una respuesta válida: completas al guardarlas. */
const reviewedOnSave = (doc: BusinessInfoDocument): SectionStatus => statusFrom(doc, doc.version > 0);

const MAX_SUMMARY_PARTS = 3;

/** «🐶 Perros · 💧 Agua · ☀️ Terraza +2» */
const joinSummary = (parts: string[]): string => {
    const shown = parts.filter(Boolean);
    const extra = shown.length - MAX_SUMMARY_PARTS;
    const text = shown.slice(0, MAX_SUMMARY_PARTS).join(' · ');
    return extra > 0 ? `${text} +${extra}` : text;
};

const flagParts = <K extends string>(data: Partial<Record<K, unknown>>, flags: Array<InfoFlag<K>>): string[] => flags
    .filter((flag) => data[flag.key] === true)
    .map((flag) => `${flag.emoji} ${flag.short || flag.label}`);

const excerpt = (text: string, max = 40): string => {
    const clean = text.trim().replace(/\s+/g, ' ');
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Secciones
// ─────────────────────────────────────────────────────────────────────────────

type SectionMetaMap = { [S in BusinessInfoSection]: SectionMeta<S> };

export const SECTION_META: SectionMetaMap = {
    identity: {
        id: 'identity',
        emoji: '🪪',
        title: 'Identidad',
        help: 'Cómo te presentas.',
        nudge: 'cuenta qué os hace especiales',
        group: 'basics',
        status: (doc) => statusFrom(doc, filled(doc.data.displayName?.es) || filled(doc.data.description?.es)),
        summary: (doc) => joinSummary([
            filled(doc.data.displayName?.es) ? excerpt(doc.data.displayName?.es || '') : '',
            !filled(doc.data.displayName?.es) && filled(doc.data.description?.es) ? excerpt(doc.data.description?.es || '') : '',
            ...(doc.data.languages || []).map((language) => findLanguageOption(language)?.emoji || language),
        ]),
    },
    contact: {
        id: 'contact',
        emoji: '📞',
        title: 'Contacto',
        help: 'Cómo te encuentran.',
        nudge: 'que te llamen o te escriban sin buscarte',
        group: 'basics',
        status: (doc) => statusFrom(doc, CONTACT_FIELDS.some((field) => filled(doc.data[field.key]))),
        summary: (doc) => joinSummary(CONTACT_FIELDS
            .filter((field) => filled(doc.data[field.key]))
            .map((field) => `${field.emoji} ${field.label}`)),
    },
    hours: {
        id: 'hours',
        emoji: '🕒',
        title: 'Horarios',
        help: 'Así sabrá la gente si estás abierto ahora.',
        nudge: 'la gente mira si estás abierto antes de ir',
        group: 'basics',
        status: (doc) => statusFrom(doc, (doc.data.weeklySchedule || [])
            .some((day) => day.closed === true || (day.periods || []).some(isValidPeriod))),
        summary: (doc) => {
            const days = doc.data.weeklySchedule || [];
            const open = days.filter((day) => day.closed !== true && (day.periods || []).some(isValidPeriod)).length;
            const closed = days.filter((day) => day.closed === true).length;
            return joinSummary([
                open > 0 ? `🕒 ${open} ${open === 1 ? 'día abierto' : 'días abiertos'}` : '',
                closed > 0 ? `🌙 ${closed} ${closed === 1 ? 'día cerrado' : 'días cerrados'}` : '',
            ]);
        },
    },
    commercial: {
        id: 'commercial',
        emoji: '🛎️',
        title: 'Cocina, pagos y servicios',
        help: 'Qué se come, cómo se paga y qué más ofreces.',
        nudge: 'ayuda a que te encuentren al buscar',
        group: 'offer',
        status: (doc) => statusFrom(doc, Boolean(doc.data.priceRange)
            && (doc.data.cuisineTypes || []).length > 0
            && (doc.data.paymentMethods || []).length > 0),
        summary: (doc) => {
            const price = findOptionByValue(PRICE_RANGE_OPTIONS, doc.data.priceRange);
            const cuisines = (doc.data.cuisineTypes || []).map((cuisine) => {
                const option = findOptionByText(CUISINE_OPTIONS, cuisine);
                return option ? `${option.emoji} ${option.label}` : cuisine;
            });
            const services = (doc.data.services || []).length;
            return joinSummary([
                price ? `${price.emoji} ${price.symbol}` : '',
                ...cuisines.slice(0, 1),
                services > 0 ? `${services} ${services === 1 ? 'servicio' : 'servicios'}` : '',
            ]);
        },
    },
    dietary: {
        id: 'dietary',
        emoji: '🥗',
        title: 'Alérgenos y dietas',
        help: 'Para decidir con seguridad, sobre todo con celiaquía o alergias.',
        nudge: 'quien tiene alergias lo mira antes de ir',
        group: 'offer',
        status: reviewedOnSave,
        summary: (doc) => joinSummary([
            ...flagParts(doc.data, GLUTEN_OPTIONS),
            ...flagParts(doc.data, DIET_OPTIONS),
            ...flagParts(doc.data, ALLERGEN_INFO_OPTIONS),
        ]),
    },
    accessibility: {
        id: 'accessibility',
        emoji: '♿',
        title: 'Accesibilidad',
        help: 'Marca solo lo que sea seguro: alguien puede planear su visita con esto.',
        nudge: 'alguien puede planear su visita con esto',
        group: 'audience',
        status: reviewedOnSave,
        summary: (doc) => joinSummary(flagParts(doc.data, ACCESSIBILITY_OPTIONS)),
    },
    family: {
        id: 'family',
        emoji: '👨‍👩‍👧',
        title: 'Familias',
        help: 'Lo que facilita ir con bebés o peques.',
        nudge: 'las familias buscan tronas y cambiador',
        group: 'audience',
        status: reviewedOnSave,
        summary: (doc) => joinSummary(flagParts(doc.data, FAMILY_OPTIONS)),
    },
    pets: {
        id: 'pets',
        emoji: '🐾',
        title: 'Mascotas',
        help: 'Si se puede venir con mascota y en qué condiciones.',
        nudge: 'quien va con perro lo pregunta siempre',
        group: 'audience',
        status: reviewedOnSave,
        summary: (doc) => {
            const policy = doc.data.petPolicy && doc.data.petPolicy !== 'unknown'
                ? findOptionByValue(PET_POLICY_OPTIONS, doc.data.petPolicy)
                : undefined;
            return joinSummary([
                policy ? `${policy.emoji} ${policy.short || policy.label}` : '',
                ...flagParts(doc.data, PET_AMENITY_OPTIONS),
            ]);
        },
    },
    reservations: {
        id: 'reservations',
        emoji: '📅',
        title: 'Reservas',
        help: 'El botón de reservar de tu ficha.',
        nudge: 'que reserven sin salir de Listopic',
        group: 'orders',
        status: (doc) => statusFrom(doc, doc.data.enabled === true && (filled(doc.data.embedUrl) || filled(doc.data.externalUrl))),
        summary: (doc) => {
            if (doc.data.enabled !== true) return '';
            const provider = findOptionByValue(RESERVATION_PROVIDER_OPTIONS, doc.data.provider);
            return joinSummary(['📅 Botón activo', provider ? `${provider.emoji} ${provider.label}` : '']);
        },
    },
    deliveries: {
        id: 'deliveries',
        emoji: '🛵',
        title: 'Delivery',
        help: 'Enlaces para pedir a domicilio.',
        nudge: 'que te pidan a casa desde tu ficha',
        group: 'orders',
        status: (doc) => statusFrom(doc, (doc.data.links || []).length > 0 || doc.version > 0),
        summary: (doc) => joinSummary((doc.data.links || []).map((link) => {
            const provider = findOptionByValue(DELIVERY_PROVIDER_OPTIONS, link.provider || 'custom');
            return provider ? `${provider.emoji} ${provider.label}` : '';
        })),
    },
};

export const sectionMeta = <S extends BusinessInfoSection>(section: S): SectionMeta<S> => SECTION_META[section] as SectionMeta<S>;

export const sectionStatus = <S extends BusinessInfoSection>(doc: BusinessInfoDocument<S>): SectionStatus => (
    sectionMeta(doc.section).status(doc)
);

export const sectionSummary = <S extends BusinessInfoSection>(doc: BusinessInfoDocument<S>): string => (
    sectionMeta(doc.section).summary(doc)
);

/** La primera sección sin completar, en el orden de navegación (la de por defecto). */
export const firstIncompleteSection = (
    sections: Record<BusinessInfoSection, BusinessInfoDocument>,
): BusinessInfoSection | null => SECTION_ORDER.find((section) => sectionStatus(sections[section]) !== 'complete') || null;

/** Porcentaje de secciones completas (0-100). */
export const completionPercent = (sections: Record<BusinessInfoSection, BusinessInfoDocument>): number => {
    const done = SECTION_ORDER.filter((section) => sectionStatus(sections[section]) === 'complete').length;
    return Math.round((done / SECTION_ORDER.length) * 100);
};

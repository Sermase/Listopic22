import type {
    BusinessInfoDocument,
    BusinessInfoSection,
    BusinessPetsInfo,
    BusinessSectionData,
    BusinessWeeklyHours,
    PetPolicy,
} from '../../../types/businessInfo';
import type { BusinessInfoSectionsResponse } from '../../../services/BusinessInfoService';
import {
    ACCESSIBILITY_OPTIONS,
    ALLERGEN_INFO_OPTIONS,
    DELIVERY_PROVIDER_OPTIONS,
    DIET_OPTIONS,
    FAMILY_OPTIONS,
    GLUTEN_OPTIONS,
    PET_AMENITY_OPTIONS,
    PET_POLICIES_WITH_AMENITIES,
    PET_POLICY_FLAGS,
    WEEKDAY_OPTIONS,
    findOptionByValue,
} from '../../../constants/businessInfoOptions';
import { isDeepEqual } from '../kit/useDirtyState';
import { timeRangeError, toTimeValue } from '../kit/time';
import { SECTION_ORDER } from './sectionMeta';

// Modelo de la Ficha sin interfaz (spec §5.3): copia guardada y borrador por
// sección, cuándo hay cambios, qué se envía, qué bloquea Guardar y qué ajustó
// el servidor al guardar. Todo puro para poder probarlo.

export type FichaSections = { [S in BusinessInfoSection]: BusinessInfoDocument<S> };

export const emptySectionDoc = <S extends BusinessInfoSection>(section: S): BusinessInfoDocument<S> => ({
    section,
    schemaVersion: 1,
    source: 'business_user',
    status: 'active',
    tier: 'free',
    version: 0,
    hiddenFields: [],
    data: {} as BusinessSectionData[S],
});

export const emptySections = (): FichaSections => Object.fromEntries(
    SECTION_ORDER.map((section) => [section, emptySectionDoc(section)]),
) as FichaSections;

/** Respuesta de getBusinessInfoForManager → las 10 secciones, siempre con forma válida. */
export const normalizeSections = (info: BusinessInfoSectionsResponse | null | undefined): FichaSections => {
    const result = emptySections();
    SECTION_ORDER.forEach((section) => {
        const raw = info?.sections?.[section] as Partial<BusinessInfoDocument> | undefined;
        if (!raw || typeof raw !== 'object') return;
        const data = raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : {};
        (result as Record<BusinessInfoSection, BusinessInfoDocument>)[section] = {
            ...emptySectionDoc(section),
            ...raw,
            section,
            version: Number.isFinite(Number(raw.version)) ? Number(raw.version) : 0,
            hiddenFields: Array.isArray(raw.hiddenFields) ? raw.hiddenFields.filter((field): field is string => typeof field === 'string') : [],
            data,
        } as BusinessInfoDocument;
    });
    return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// ¿Hay cambios?
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Forma comparable de unos datos: como pruneEmpty del backend (sin '', false,
 * [] ni {}), con los textos recortados. Así «marcar y desmarcar» o un campo que
 * el servidor guarda vacío no cuentan como cambio.
 */
export const comparable = (value: unknown): unknown => {
    if (typeof value === 'string') {
        const text = value.trim();
        return text ? text : undefined;
    }
    if (value === false || value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
        const items = value.map(comparable).filter((item) => item !== undefined);
        return items.length ? items : undefined;
    }
    if (typeof value === 'object') {
        const result: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
            const cleaned = comparable(child);
            if (cleaned !== undefined) result[key] = cleaned;
        });
        return Object.keys(result).length ? result : undefined;
    }
    return value;
};

export const sameStringSet = (a: readonly string[] | undefined, b: readonly string[] | undefined): boolean => {
    const left = new Set(a || []);
    const right = new Set(b || []);
    return left.size === right.size && [...left].every((item) => right.has(item));
};

/** Enums en los que «unknown» (❔ / 🤷 Sin indicar) es lo mismo que no decir nada. */
const UNKNOWN_IS_EMPTY: Partial<Record<BusinessInfoSection, string[]>> = {
    pets: ['petPolicy'],
    dietary: ['crossContaminationRisk'],
};

/** comparable() de los datos de una sección. */
export const comparableData = (section: BusinessInfoSection, data: object): unknown => {
    const keys = UNKNOWN_IS_EMPTY[section];
    if (!keys) return comparable(data);
    const copy: Record<string, unknown> = { ...data };
    keys.forEach((key) => {
        if (copy[key] === 'unknown') delete copy[key];
    });
    return comparable(copy);
};

/** dirty(section) = datos distintos u ocultos de Google distintos. */
export const sectionDirty = (saved: BusinessInfoDocument, draft: BusinessInfoDocument): boolean => (
    !isDeepEqual(comparableData(saved.section, saved.data), comparableData(draft.section, draft.data))
    || !sameStringSet(saved.hiddenFields, draft.hiddenFields)
);

/**
 * Secciones en las que «nada de esto» es una respuesta válida: cuentan como
 * completas al guardarlas una vez (version > 0), aunque estén vacías.
 */
export const REVIEWED_ON_SAVE: ReadonlySet<BusinessInfoSection> = new Set<BusinessInfoSection>([
    'accessibility', 'family', 'pets', 'dietary', 'deliveries',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Textos, enlaces y emails (mismas reglas que business-claims.js)
// ─────────────────────────────────────────────────────────────────────────────

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (value: string): boolean => EMAIL_PATTERN.test(value.trim().toLowerCase());

/** Como sanitizeUrl del servidor: añade https:// si falta; '' si no es http(s). */
export const serverUrl = (value: string | undefined): string => {
    const raw = (value || '').trim().slice(0, 400);
    if (!raw) return '';
    try {
        const url = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
        return url.toString().slice(0, 400);
    } catch {
        return '';
    }
};

/** Enlace que de verdad parece una web (con dominio: «mibar.es», no «mibar»). */
export const isLikelyUrl = (value: string | undefined): boolean => {
    const url = serverUrl(value);
    if (!url) return false;
    try {
        const host = new URL(url).hostname;
        return host.includes('.') && !host.startsWith('.') && !host.endsWith('.');
    } catch {
        return false;
    }
};

/** Al salir del campo: «mibar.es» → «https://mibar.es». */
export const withProtocol = (value: string): string => {
    const text = value.trim();
    if (!text || /^https?:\/\//i.test(text)) return text;
    return `https://${text}`;
};

/** ¿Es código de un widget (iframe o atributo src)? */
export const isWidgetCode = (value: string | undefined): boolean => /<iframe|src\s*=\s*["']/i.test(value || '');

/** Como extractIframeSrc del servidor. */
export const extractWidgetSrc = (value: string | undefined): string => {
    const raw = (value || '').trim().slice(0, 1200);
    if (!raw) return '';
    const match = raw.match(/src=["']([^"']+)["']/i);
    return match ? match[1] : raw;
};

/**
 * Instagram como lo guarda el servidor: sin @ ni caracteres raros; de un
 * enlace de instagram.com se queda con el usuario.
 */
export const cleanInstagram = (value: string): string => {
    const raw = value.trim();
    if (!raw) return '';
    const fromUrl = raw.match(/instagram\.com\/([^/?#\s]+)/i);
    const handle = fromUrl ? fromUrl[1] : raw;
    return handle.replace(/^@+/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 60);
};

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se envía al guardar
// ─────────────────────────────────────────────────────────────────────────────

/** Horario semanal tal y como lo acepta el servidor (solo días con algo válido). */
export const cleanWeeklySchedule = (weekly: BusinessWeeklyHours[] | undefined): BusinessWeeklyHours[] => (weekly || [])
    .filter((day) => Number.isInteger(day.day) && day.day >= 0 && day.day <= 6)
    .map((day): BusinessWeeklyHours | null => {
        if (day.closed === true) return { day: day.day, closed: true, periods: [] };
        const periods = (day.periods || [])
            .map((period) => ({ open: toTimeValue(period.open), close: toTimeValue(period.close) }))
            .filter((period) => period.open && period.close && period.open !== period.close)
            .slice(0, 4);
        return periods.length ? { day: day.day, closed: false, periods } : null;
    })
    .filter((day): day is BusinessWeeklyHours => day !== null)
    .sort((a, b) => a.day - b.day);

/**
 * Política → los booleanos derivados de siempre (petFriendly, allowsDogs…) y,
 * si la política esconde una baldosa, esa baldosa a false (sin contradicciones).
 */
export const petPolicyPatch = (policy: PetPolicy, data: BusinessPetsInfo): Partial<BusinessPetsInfo> => {
    const welcomes = PET_POLICIES_WITH_AMENITIES.includes(policy);
    const patch: Partial<BusinessPetsInfo> = {
        petPolicy: policy,
        petFriendly: welcomes,
        allowsDogs: welcomes,
        allowsCats: policy === 'allowed',
        assistanceDogsOnly: policy === 'assistance_only',
        terraceOnly: policy === 'terrace_only',
    };
    if (!welcomes) {
        PET_AMENITY_OPTIONS.forEach((option) => {
            if (data[option.key]) patch[option.key] = false;
        });
    } else if (policy === 'terrace_only') {
        patch.indoorAllowed = false;
    } else if (data.petPolicy !== policy && (policy === 'allowed' || policy === 'dogs_only')) {
        // Como antes: con «todas» o «solo perros», dentro también (se puede desmarcar).
        patch.indoorAllowed = true;
    }
    return patch;
};

const hasPetAmenity = (data: BusinessPetsInfo): boolean => PET_AMENITY_OPTIONS.some((option) => data[option.key] === true);

/**
 * ¿Se enseña el paso «¿Qué les ofrecéis?»? Con una política que admite
 * mascotas, o sin política pero con algo ya guardado (datos antiguos: así se
 * ve y se puede quitar, en vez de borrarse al guardar sin que se vea).
 */
export const showsPetAmenities = (data: BusinessPetsInfo): boolean => {
    const policy = data.petPolicy || 'unknown';
    if (PET_POLICIES_WITH_AMENITIES.includes(policy)) return true;
    return policy === 'unknown' && hasPetAmenity(data);
};

/**
 * Quita contradicciones de mascotas (F9): solo lo que la política permite.
 * Sin política («Sin indicar») no hay nada que contradecir y no se toca.
 */
export const cleanPetsData = (data: BusinessSectionData['pets']): BusinessSectionData['pets'] => {
    const policy = data.petPolicy;
    if (!policy || policy === 'unknown') return data;
    const next = { ...data };
    if (!PET_POLICIES_WITH_AMENITIES.includes(policy)) {
        PET_AMENITY_OPTIONS.forEach((option) => {
            if (next[option.key]) next[option.key] = false;
        });
    } else if (policy === 'terrace_only' && next.indoorAllowed) {
        next.indoorAllowed = false;
    }
    return next;
};

export interface SavePayload {
    data: BusinessSectionData[BusinessInfoSection];
    hiddenFields: string[];
}

export const buildSavePayload = (doc: BusinessInfoDocument): SavePayload => {
    const hiddenFields = Array.from(new Set(doc.hiddenFields || []));
    switch (doc.section) {
        case 'hours': {
            const data = doc.data as BusinessSectionData['hours'];
            return { data: { ...data, weeklySchedule: cleanWeeklySchedule(data.weeklySchedule) }, hiddenFields };
        }
        case 'pets':
            return { data: cleanPetsData(doc.data as BusinessSectionData['pets']), hiddenFields };
        case 'deliveries': {
            const data = doc.data as BusinessSectionData['deliveries'];
            const links = (data.links || []).map((link) => ({
                provider: link.provider || 'custom',
                label: (link.label || '').trim(),
                url: (link.url || '').trim(),
            }));
            return { data: { ...data, links, enabled: data.enabled === true && links.length > 0 }, hiddenFields };
        }
        default:
            return { data: doc.data, hiddenFields };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Lo que bloquea Guardar (errores del cliente)
// ─────────────────────────────────────────────────────────────────────────────

export const deliveryProviderLabel = (provider: string | undefined): string => (
    findOptionByValue(DELIVERY_PROVIDER_OPTIONS, provider || 'custom')?.label || 'Otro'
);

/** Primer motivo por el que no se puede guardar, o null. */
export const sectionInvalidReason = (doc: BusinessInfoDocument): string | null => {
    switch (doc.section) {
        case 'contact': {
            const data = doc.data as BusinessSectionData['contact'];
            if (data.email?.trim() && !isValidEmail(data.email)) return 'Revisa el email';
            if (data.website?.trim() && !isLikelyUrl(data.website)) return 'Revisa la web';
            return null;
        }
        case 'hours': {
            const data = doc.data as BusinessSectionData['hours'];
            for (const day of data.weeklySchedule || []) {
                if (day.closed === true) continue;
                for (const period of day.periods || []) {
                    if (!toTimeValue(period.open) && !toTimeValue(period.close)) continue;
                    const problem = timeRangeError(period);
                    if (problem) {
                        const dayLabel = WEEKDAY_OPTIONS.find((option) => option.day === day.day)?.label || 'Un día';
                        return `${dayLabel}: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`;
                    }
                }
            }
            return null;
        }
        case 'reservations': {
            const data = doc.data as BusinessSectionData['reservations'];
            if (data.embedUrl?.trim() && !isLikelyUrl(extractWidgetSrc(data.embedUrl))) return 'Revisa el enlace de reservas';
            if (data.externalUrl?.trim() && !isLikelyUrl(data.externalUrl)) return 'Revisa el enlace de reservas';
            return null;
        }
        case 'deliveries': {
            const data = doc.data as BusinessSectionData['deliveries'];
            for (const link of data.links || []) {
                const name = deliveryProviderLabel(link.provider);
                if (!link.url?.trim()) return `Falta el enlace de ${name}`;
                if (!isLikelyUrl(link.url)) return `Revisa el enlace de ${name}`;
            }
            return null;
        }
        default:
            return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Lo que ajustó el servidor (aviso «Hemos ajustado algunos datos»)
// ─────────────────────────────────────────────────────────────────────────────

const flagLabels = (options: Array<{ key: string; label: string }>): Record<string, string> => Object.fromEntries(
    options.map((option) => [option.key, option.label]),
);

export const FIELD_LABELS: Record<BusinessInfoSection, Record<string, string>> = {
    identity: { displayName: 'el nombre visible', description: 'la descripción', languages: 'los idiomas' },
    contact: { phone: 'el teléfono', website: 'la web', email: 'el email', instagram: 'el Instagram' },
    commercial: { priceRange: 'el precio', cuisineTypes: 'el tipo de cocina', paymentMethods: 'las formas de pago', services: 'los servicios' },
    accessibility: { ...flagLabels(ACCESSIBILITY_OPTIONS), notes: 'las notas' },
    family: { ...flagLabels(FAMILY_OPTIONS), notes: 'las notas' },
    pets: {
        ...flagLabels(PET_POLICY_FLAGS),
        ...flagLabels(PET_AMENITY_OPTIONS),
        petPolicy: 'si se admiten mascotas',
        restrictions: 'las condiciones',
        notes: 'las notas',
    },
    dietary: {
        ...flagLabels(GLUTEN_OPTIONS),
        ...flagLabels(DIET_OPTIONS),
        ...flagLabels(ALLERGEN_INFO_OPTIONS),
        crossContaminationRisk: 'la contaminación cruzada',
        crossContaminationNotes: 'las notas de contaminación cruzada',
        allergens: 'los alérgenos en cocina',
        notes: 'las notas',
    },
    hours: { weeklySchedule: 'el horario semanal', specialHours: 'los horarios especiales', temporaryClosures: 'los cierres temporales', notes: 'las notas de horario' },
    reservations: { enabled: 'el botón de reservar', embedUrl: 'el enlace de reservas', externalUrl: 'el enlace de respaldo', buttonText: 'el texto del botón', provider: 'el proveedor' },
    deliveries: { enabled: 'mostrar pedidos a domicilio', links: 'los enlaces de pedidos', notes: 'las notas' },
};

/** Lo enviado, con las transformaciones que el servidor hace siempre (no son «ajustes»). */
const expectedValue = (section: BusinessInfoSection, key: string, value: unknown): unknown => {
    if (section === 'contact') {
        if (key === 'website') return serverUrl(value as string);
        if (key === 'email') return typeof value === 'string' ? value.trim().toLowerCase() : value;
        if (key === 'instagram' && typeof value === 'string' && !/^https?:\/\//.test(value.trim())) return cleanInstagram(value);
    }
    if (section === 'reservations' && key === 'embedUrl') return serverUrl(extractWidgetSrc(value as string));
    if (section === 'reservations' && key === 'externalUrl') return serverUrl(extractWidgetSrc(value as string));
    if (section === 'deliveries' && key === 'links' && Array.isArray(value)) {
        return value.map((link: { provider?: string; label?: string; url?: string }) => ({
            provider: link.provider || 'custom',
            label: link.label,
            url: serverUrl(link.url),
        }));
    }
    return value;
};

/** Claves que el servidor rellena por su cuenta: no se avisa de ellas. */
const isServerDefault = (section: BusinessInfoSection, key: string, sent: Record<string, unknown>): boolean => {
    if (section !== 'reservations') return false;
    if (key === 'provider' || key === 'displayMode') return true;
    if (key === 'buttonText' || key === 'externalUrl') return !(typeof sent[key] === 'string' && (sent[key] as string).trim());
    return false;
};

/** Etiquetas de los campos que el servidor guardó distintos de lo enviado. */
export const adjustedFields = (section: BusinessInfoSection, sent: object, stored: object): string[] => {
    const sentRecord = sent as Record<string, unknown>;
    const storedRecord = stored as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(sentRecord), ...Object.keys(storedRecord)]));
    const labels = keys
        .filter((key) => !isServerDefault(section, key, sentRecord))
        .filter((key) => !isDeepEqual(
            comparableData(section, { [key]: expectedValue(section, key, sentRecord[key]) }),
            comparableData(section, { [key]: storedRecord[key] }),
        ))
        .map((key) => FIELD_LABELS[section][key] || 'otros datos');
    return Array.from(new Set(labels));
};

/** Cuántos booleanos de la lista están marcados. */
export const countFlags = <K extends string>(options: Array<{ key: K }>, data: Partial<Record<K, unknown>>): number => (
    options.filter((option) => data[option.key] === true).length
);

/** «a, b y c». */
export const joinSpanish = (items: string[]): string => {
    if (items.length <= 1) return items[0] || '';
    return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
};

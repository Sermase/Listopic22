import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

import * as BusinessProService from '../services/BusinessProService';
import {
    ACCESSIBILITY_GROUPS,
    ACCESSIBILITY_OPTIONS,
    ALLERGEN_INFO_OPTIONS,
    ALLERGEN_OPTIONS,
    CROSS_CONTAMINATION_OPTIONS,
    CUISINE_OPTIONS,
    DELIVERY_PROVIDER_OPTIONS,
    DIET_OPTIONS,
    FAMILY_OPTIONS,
    GLUTEN_OPTIONS,
    LANGUAGE_OPTIONS,
    PAYMENT_OPTIONS,
    PET_AMENITY_OPTIONS,
    PET_CONDITION_OPTIONS,
    PET_POLICY_FLAGS,
    PET_POLICY_OPTIONS,
    PRICE_RANGE_OPTIONS,
    RESERVATION_PROVIDER_OPTIONS,
    SERVICE_GROUPS,
    SERVICE_OPTIONS,
    findLanguageOption,
    findOptionByText,
    findOptionByValue,
    type InfoFlag,
    type InfoOption,
} from './businessInfoOptions';
import * as legacy from './businessOptions';

// Valores guardados antes del catálogo: no pueden cambiar.
const STORED_PAYMENT_METHODS = [
    'Efectivo', 'Tarjeta', 'Contactless', 'Bizum', 'Apple Pay', 'Google Pay', 'PayPal', 'Transferencia',
    'Cheque gourmet', 'Ticket Restaurant', 'Sodexo', 'American Express', 'Visa', 'Mastercard', 'Pago online',
    'Pago en app', 'Contra reembolso',
];
const STORED_SERVICES = [
    'Comer en local', 'Terraza', 'Reservas', 'Para llevar', 'Menú del día', 'Menú infantil', 'Desayunos', 'Brunch',
    'Comidas', 'Cenas', 'Copas', 'Café', 'Cócteles', 'Vino', 'Cerveza', 'Música en directo', 'Eventos privados',
    'Catering', 'Cumpleaños', 'Apto para grupos', 'Apto para familias', 'Tronas', 'WiFi', 'Enchufes',
    'Aire acondicionado', 'Calefacción', 'Televisión', 'Parking', 'Parking cercano', 'Aparcacoches',
    'Zona fumadores', 'Zona tranquila', 'Vistas', 'Azotea',
];
const STORED_CUISINES = [
    'Española', 'Mediterránea', 'Tapas', 'Bar', 'Cafetería', 'Brunch', 'Italiana', 'Pizza', 'Hamburguesas',
    'Mexicana', 'Japonesa', 'Sushi', 'China', 'India', 'Vegana', 'Vegetariana', 'Sin gluten', 'Coctelería',
];
const STORED_PET_RESTRICTIONS = [
    'Solo perros pequeños', 'Solo con correa', 'No se permite subir a sillas', 'Evitar horas de mucha afluencia',
    'Consultar antes de reservar',
];

// Mismos conjuntos que valida el backend (functions/modules/business-claims.js).
const BACKEND_ENUMS = {
    priceRange: ['low', 'medium', 'high', 'premium'],
    crossContamination: ['unknown', 'possible', 'controlled', 'dedicated'],
    petPolicy: ['unknown', 'allowed', 'dogs_only', 'terrace_only', 'assistance_only', 'not_allowed'],
    reservationProvider: ['covermanager', 'thefork', 'opentable', 'zenchef', 'resy', 'google', 'custom'],
    deliveryProvider: ['glovo', 'justeat', 'ubereats', 'deliveroo', 'deliverect', 'own', 'whatsapp', 'custom'],
};

const ACCESSIBILITY_KEYS = [
    'stepFreeEntrance', 'accessibleBathroom', 'rampAvailable', 'wheelchairFriendlyTables', 'elevator',
    'accessibleParking', 'bathroomGrabBars', 'guideDogsWelcome', 'brailleMenu', 'largePrintMenu',
    'digitalMenuScreenReader', 'hearingLoop', 'visualMenu', 'quietEnvironment', 'signLanguageStaff',
    'pictogramMenu', 'easyReadMenu', 'sensoryFriendlyArea',
];
const FAMILY_KEYS = [
    'babyChanging', 'familyRestroom', 'highChairs', 'kidsMenu', 'playArea', 'strollerFriendly', 'bottleWarming',
    'breastfeedingFriendly',
];
const PET_KEYS = [
    'petFriendly', 'allowsDogs', 'allowsCats', 'terraceOnly', 'indoorAllowed', 'assistanceDogsOnly', 'waterBowls',
    'treatsAvailable', 'petMenu', 'sizeRestrictions', 'requiresLeash',
];
const DIETARY_KEYS = [
    'glutenFreeOptions', 'manyGlutenFreeOptions', 'glutenFreeMenu', 'vegetarianOptions', 'veganOptions',
    'dairyFreeOptions', 'nutFreeOptions', 'eggFreeOptions', 'allergenMenuAvailable', 'staffCanAdviseAllergens',
];

const values = (options: InfoOption[]) => options.map((option) => option.value);
const keys = (flags: InfoFlag[]) => flags.map((flag) => flag.key);
const sorted = (list: string[]) => [...list].sort();

const ALL_OPTION_LISTS: Record<string, InfoOption[]> = {
    LANGUAGE_OPTIONS,
    PRICE_RANGE_OPTIONS,
    CUISINE_OPTIONS,
    PAYMENT_OPTIONS,
    SERVICE_OPTIONS,
    PET_POLICY_OPTIONS,
    PET_CONDITION_OPTIONS,
    CROSS_CONTAMINATION_OPTIONS,
    RESERVATION_PROVIDER_OPTIONS,
    DELIVERY_PROVIDER_OPTIONS,
};
const ALL_FLAG_LISTS: Record<string, InfoFlag[]> = {
    ACCESSIBILITY_OPTIONS,
    FAMILY_OPTIONS,
    PET_AMENITY_OPTIONS,
    PET_POLICY_FLAGS,
    GLUTEN_OPTIONS,
    DIET_OPTIONS,
    ALLERGEN_INFO_OPTIONS,
};

describe('catálogo de la Ficha', () => {
    it('cada opción tiene etiqueta y emoji, sin valores repetidos', () => {
        Object.entries(ALL_OPTION_LISTS).forEach(([name, list]) => {
            list.forEach((option) => {
                expect(option.label.trim(), `${name}:${option.value}`).not.toBe('');
                expect(option.emoji.trim(), `${name}:${option.value}`).not.toBe('');
            });
            expect(new Set(values(list)).size, name).toBe(list.length);
        });
        Object.entries(ALL_FLAG_LISTS).forEach(([name, list]) => {
            list.forEach((flag) => {
                expect(flag.label.trim(), `${name}:${flag.key}`).not.toBe('');
                expect(flag.emoji.trim(), `${name}:${flag.key}`).not.toBe('');
            });
            expect(new Set(keys(list)).size, name).toBe(list.length);
        });
    });

    it('conserva los valores guardados de las listas', () => {
        expect(sorted(values(PAYMENT_OPTIONS))).toEqual(sorted(STORED_PAYMENT_METHODS));
        expect(sorted(values(SERVICE_OPTIONS))).toEqual(sorted(STORED_SERVICES));
        expect(sorted(values(CUISINE_OPTIONS))).toEqual(sorted(STORED_CUISINES));
        expect(values(PET_CONDITION_OPTIONS)).toEqual(STORED_PET_RESTRICTIONS);
        expect(SERVICE_GROUPS.flatMap((group) => values(group.options))).toEqual(values(SERVICE_OPTIONS));
        expect(PAYMENT_OPTIONS.filter((option) => option.common).map((option) => option.value))
            .toEqual(['Tarjeta', 'Efectivo', 'Contactless', 'Bizum']);
    });

    it('usa los mismos enums que valida el backend', () => {
        expect(sorted(values(PRICE_RANGE_OPTIONS))).toEqual(sorted(BACKEND_ENUMS.priceRange));
        expect(sorted(values(CROSS_CONTAMINATION_OPTIONS))).toEqual(sorted(BACKEND_ENUMS.crossContamination));
        expect(sorted(values(PET_POLICY_OPTIONS))).toEqual(sorted(BACKEND_ENUMS.petPolicy));
        expect(sorted(values(RESERVATION_PROVIDER_OPTIONS))).toEqual(sorted(BACKEND_ENUMS.reservationProvider));
        expect(sorted(values(DELIVERY_PROVIDER_OPTIONS))).toEqual(sorted(BACKEND_ENUMS.deliveryProvider));
    });

    it('cubre todos los booleanos de cada sección, una sola vez', () => {
        expect(sorted(keys(ACCESSIBILITY_OPTIONS))).toEqual(sorted(ACCESSIBILITY_KEYS));
        expect(ACCESSIBILITY_GROUPS.map((group) => group.id)).toEqual(['mobility', 'visual', 'hearing', 'cognitive']);
        expect(sorted(keys(FAMILY_OPTIONS))).toEqual(sorted(FAMILY_KEYS));
        expect(sorted([...keys(PET_AMENITY_OPTIONS), ...keys(PET_POLICY_FLAGS)])).toEqual(sorted(PET_KEYS));
        expect(sorted([...keys(GLUTEN_OPTIONS), ...keys(DIET_OPTIONS), ...keys(ALLERGEN_INFO_OPTIONS)])).toEqual(sorted(DIETARY_KEYS));
    });

    it('reexporta los alérgenos del servicio', () => {
        expect(ALLERGEN_OPTIONS).toBe(BusinessProService.ALLERGEN_OPTIONS);
        expect(ALLERGEN_OPTIONS).toHaveLength(14);
    });

    it('encuentra textos guardados sin mirar mayúsculas ni tildes', () => {
        expect(findOptionByText(CUISINE_OPTIONS, 'cafeteria')?.value).toBe('Cafetería');
        expect(findOptionByText(SERVICE_OPTIONS, '  WIFI ')?.emoji).toBe('📶');
        expect(findOptionByText(PET_CONDITION_OPTIONS, 'evitar horas punta')?.value).toBe('Evitar horas de mucha afluencia');
        expect(findOptionByText(CUISINE_OPTIONS, 'Fusión')).toBeUndefined();
        expect(findOptionByText(CUISINE_OPTIONS, '')).toBeUndefined();
        expect(findOptionByValue(PET_POLICY_OPTIONS, 'dogs_only')?.emoji).toBe('🐶');
        expect(findOptionByValue(PET_POLICY_OPTIONS, undefined)).toBeUndefined();
    });

    it('reconoce idiomas por nombre o código', () => {
        expect(findLanguageOption('es')?.value).toBe('Español');
        expect(findLanguageOption('ESPAÑOL')?.value).toBe('Español');
        expect(findLanguageOption('ingles')?.emoji).toBe('🇬🇧');
        expect(findLanguageOption('Valenciano')?.label).toBe('Catalán/Valenciano');
        expect(findLanguageOption('ca')?.value).toBe('Catalán');
        expect(findLanguageOption('klingon')).toBeUndefined();
    });
});

describe('businessOptions (legacy de los formularios actuales)', () => {
    it('deriva del catálogo sin cambiar lo que se ve ni lo que se guarda', () => {
        expect(legacy.PRICE_RANGE_LABELS).toEqual({ low: 'Económico', medium: 'Medio', high: 'Alto', premium: 'Premium' });
        expect(legacy.DELIVERY_PROVIDER_LABELS).toEqual({
            glovo: 'Glovo',
            justeat: 'Just Eat',
            ubereats: 'Uber Eats',
            deliveroo: 'Deliveroo',
            deliverect: 'Deliverect',
            own: 'Web propia',
            whatsapp: 'WhatsApp',
            custom: 'Otro',
        });
        expect(legacy.DELIVERY_PROVIDER_OPTIONS).toEqual(Object.entries(legacy.DELIVERY_PROVIDER_LABELS).map(([value, label]) => ({ value, label })));
        expect(legacy.PET_RESTRICTION_OPTIONS).toEqual(STORED_PET_RESTRICTIONS);
        expect(sorted(legacy.PAYMENT_METHOD_OPTIONS)).toEqual(sorted(STORED_PAYMENT_METHODS));
        expect(sorted(legacy.BUSINESS_SERVICE_OPTIONS)).toEqual(sorted(STORED_SERVICES));
    });
});

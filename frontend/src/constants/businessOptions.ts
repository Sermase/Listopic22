import {
    DELIVERY_PROVIDER_OPTIONS as DELIVERY_PROVIDER_CATALOGUE,
    PAYMENT_OPTIONS,
    PET_CONDITION_OPTIONS,
    PRICE_RANGE_OPTIONS,
    SERVICE_OPTIONS,
} from './businessInfoOptions';

// Legacy: lo que usan los formularios actuales de la Ficha
// (components/business/info). El catálogo con emoji es businessInfoOptions.ts:
// el código nuevo debe usar ese. Lo que coincide se deriva de él; solo quedan
// aquí los textos largos de los selects actuales.

export const PRICE_RANGE_LABELS: Record<string, string> = Object.fromEntries(
    PRICE_RANGE_OPTIONS.map((option) => [option.value, option.label]),
);

export const PAYMENT_METHOD_OPTIONS: string[] = PAYMENT_OPTIONS.map((option) => option.value);

export const BUSINESS_SERVICE_OPTIONS: string[] = SERVICE_OPTIONS.map((option) => option.value);

export const CROSS_CONTAMINATION_LABELS: Record<string, string> = {
    unknown: 'No indicado',
    possible: 'Puede haber contaminación cruzada',
    controlled: 'Protocolo para reducir contaminación cruzada',
    dedicated: 'Zona o preparación separada sin gluten',
};

export const DELIVERY_PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
    DELIVERY_PROVIDER_CATALOGUE.map((option) => [option.value, option.label]),
);

export const DELIVERY_PROVIDER_OPTIONS = DELIVERY_PROVIDER_CATALOGUE.map(({ value, label }) => ({
    value,
    label,
}));

export const PET_POLICY_LABELS: Record<string, string> = {
    unknown: 'No indicado',
    allowed: 'Mascotas admitidas',
    dogs_only: 'Perros admitidos',
    terrace_only: 'Solo en terraza',
    assistance_only: 'Solo perros de asistencia',
    not_allowed: 'No admite mascotas',
};

/** Textos guardados tal cual, en el orden de siempre. */
export const PET_RESTRICTION_OPTIONS: string[] = PET_CONDITION_OPTIONS.map((option) => option.value);

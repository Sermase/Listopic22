export type LocalizedText = {
    es?: string;
    en?: string;
};

export type BusinessInfoSection =
    | 'identity'
    | 'contact'
    | 'commercial'
    | 'accessibility'
    | 'dietary'
    | 'hours'
    | 'reservations'
    | 'deliveries';

export interface BusinessIdentityInfo {
    displayName?: LocalizedText;
    description?: LocalizedText;
    languages?: string[];
}

export interface BusinessContactInfo {
    phone?: string;
    website?: string;
    email?: string;
    instagram?: string;
}

export interface BusinessCommercialInfo {
    priceRange?: 'low' | 'medium' | 'high' | 'premium';
    cuisineTypes?: string[];
    paymentMethods?: string[];
    services?: string[];
}

export interface BusinessAccessibilityInfo {
    wheelchairAccess?: boolean;
    accessibleBathroom?: boolean;
    stepFreeEntrance?: boolean;
    babyChanging?: boolean;
    petFriendly?: boolean;
    hearingLoop?: boolean;
    notes?: string;
}

export type CrossContaminationRisk =
    | 'unknown'
    | 'possible'
    | 'controlled'
    | 'dedicated';

export interface BusinessDietaryInfo {
    glutenFreeOptions?: boolean;
    manyGlutenFreeOptions?: boolean;
    glutenFreeMenu?: boolean;
    crossContaminationRisk?: CrossContaminationRisk;
    crossContaminationNotes?: string;
    vegetarianOptions?: boolean;
    veganOptions?: boolean;
    dairyFreeOptions?: boolean;
    nutFreeOptions?: boolean;
    eggFreeOptions?: boolean;
    allergenMenuAvailable?: boolean;
    staffCanAdviseAllergens?: boolean;
    allergens?: string[];
    notes?: string;
}

export interface BusinessHoursPeriod {
    open: string;
    close: string;
}

export interface BusinessWeeklyHours {
    day: number;
    closed?: boolean;
    periods?: BusinessHoursPeriod[];
}

export interface BusinessSpecialHours {
    date: string;
    label?: string;
    closed?: boolean;
    periods?: BusinessHoursPeriod[];
}

export interface BusinessTemporaryClosure {
    from: string;
    to: string;
    reason?: string;
}

export interface BusinessHoursInfo {
    weeklySchedule?: BusinessWeeklyHours[];
    specialHours?: BusinessSpecialHours[];
    temporaryClosures?: BusinessTemporaryClosure[];
    notes?: string;
}

export type ReservationProvider =
    | 'covermanager'
    | 'thefork'
    | 'opentable'
    | 'zenchef'
    | 'resy'
    | 'google'
    | 'custom';

export type ReservationDisplayMode = 'external' | 'modal' | 'both';

export interface BusinessReservationsInfo {
    enabled?: boolean;
    provider?: ReservationProvider;
    embedUrl?: string;
    externalUrl?: string;
    displayMode?: ReservationDisplayMode;
    buttonText?: string;
}

export type DeliveryProvider =
    | 'glovo'
    | 'justeat'
    | 'ubereats'
    | 'deliveroo'
    | 'deliverect'
    | 'own'
    | 'whatsapp'
    | 'custom';

export interface BusinessDeliveryLink {
    provider?: DeliveryProvider;
    label?: string;
    url?: string;
}

export interface BusinessDeliveriesInfo {
    enabled?: boolean;
    links?: BusinessDeliveryLink[];
    notes?: string;
}

export type BusinessSectionData = {
    identity: BusinessIdentityInfo;
    contact: BusinessContactInfo;
    commercial: BusinessCommercialInfo;
    accessibility: BusinessAccessibilityInfo;
    dietary: BusinessDietaryInfo;
    hours: BusinessHoursInfo;
    reservations: BusinessReservationsInfo;
    deliveries: BusinessDeliveriesInfo;
};

export type BusinessSectionPayload = BusinessSectionData[BusinessInfoSection];

export interface BusinessInfoDocument<S extends BusinessInfoSection = BusinessInfoSection> {
    section: S;
    schemaVersion: number;
    source: 'business_user' | 'admin_override' | 'ai_extracted' | 'user_suggestion';
    status: 'active' | 'disabled' | 'expired' | 'pending_review';
    tier: 'free' | 'premium';
    version: number;
    hiddenFields: string[];
    data: BusinessSectionData[S];
    updatedBy?: string;
    updatedAt?: unknown;
    createdAt?: unknown;
}

export interface ResolvedBusinessInfo {
    identity?: BusinessIdentityInfo;
    contact?: BusinessContactInfo;
    commercial?: BusinessCommercialInfo;
    accessibility?: BusinessAccessibilityInfo;
    dietary?: BusinessDietaryInfo;
    hours?: BusinessHoursInfo;
    reservations?: BusinessReservationsInfo;
    deliveries?: BusinessDeliveriesInfo;
    hiddenFields?: Partial<Record<BusinessInfoSection, string[]>>;
    updatedAt?: unknown;
}

export type ShareEntityType =
    | 'place'
    | 'group'
    | 'list'
    | 'sublist'
    | 'profile'
    | 'app'
    | 'review'
    | 'link';

export interface ShareCriteriaStat {
    key: string;
    label: string;
    score: number;
    count?: number;
}

export interface ShareProfileStat {
    key: string;
    label: string;
    value: number | string;
}

export interface ShareEntityPayload {
    type: ShareEntityType;
    id?: string;
    title: string;
    subtitle?: string;
    description?: string;
    route?: string;
    url: string;
    imageUrl?: string;
    /** Galería de imágenes entre las que se puede elegir al crear la tarjeta. */
    imageUrls?: string[];
    badgeLabel?: string;
    score?: number;
    reviewCount?: number;
    authorId?: string;
    authorName?: string;
    authorPhoto?: string;
    authorUserType?: string | string[];
    city?: string;
    criteriaStats?: ShareCriteriaStat[];
    /** Criterios extra: se dibujan como indicadores circulares, no como barras. */
    nonPonderableStats?: ShareCriteriaStat[];
    referenceCriteriaStats?: ShareCriteriaStat[];
    referenceLabel?: string;
    profileStats?: ShareProfileStat[];
    tags?: string[];
}

const SHARE_ENTITY_LABELS: Record<ShareEntityType, string> = {
    place: 'Lugar',
    group: 'Grupo',
    list: 'Lista',
    sublist: 'Sublista',
    profile: 'Perfil',
    app: 'App',
    review: 'Rese\u00f1a',
    link: 'Enlace',
};

export const getShareEntityLabel = (entityType: ShareEntityType): string => {
    return SHARE_ENTITY_LABELS[entityType] || 'Contenido';
};

export type ShareEntityType =
    | 'place'
    | 'group'
    | 'list'
    | 'sublist'
    | 'profile'
    | 'app'
    | 'review'
    | 'link';

export interface ShareEntityPayload {
    type: ShareEntityType;
    id?: string;
    title: string;
    subtitle?: string;
    description?: string;
    route?: string;
    url: string;
    imageUrl?: string;
    badgeLabel?: string;
}

const SHARE_ENTITY_LABELS: Record<ShareEntityType, string> = {
    place: 'Lugar',
    group: 'Grupo',
    list: 'Lista',
    sublist: 'Sublista',
    profile: 'Perfil',
    app: 'App',
    review: 'Resena',
    link: 'Enlace',
};

export const getShareEntityLabel = (entityType: ShareEntityType): string => {
    return SHARE_ENTITY_LABELS[entityType] || 'Contenido';
};

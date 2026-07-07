export interface DuelSide {
    label: string;
    sublabel?: string;
    imageUrl?: string;
    link?: string;
}

export interface Duel {
    id: string;
    title?: string;
    status: 'active' | 'ended';
    sideA: DuelSide;
    sideB: DuelSide;
    endsAt?: string;
}

const mapSide = (raw: unknown): DuelSide => {
    const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
        label: typeof data.label === 'string' ? data.label : '—',
        sublabel: typeof data.sublabel === 'string' ? data.sublabel : undefined,
        imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
        link: typeof data.link === 'string' ? data.link : undefined,
    };
};

export const mapDuel = (id: string, data: Record<string, unknown>): Duel => ({
    id,
    title: typeof data.title === 'string' ? data.title : undefined,
    status: data.status === 'ended' ? 'ended' : 'active',
    sideA: mapSide(data.sideA),
    sideB: mapSide(data.sideB),
    endsAt: typeof data.endsAt === 'string' ? data.endsAt : undefined,
});

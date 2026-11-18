// Tarjeta de Minilista (ventana de la Lista y Buscar): datos, orden y filtro.
// Todo sale del propio documento de la Minilista (o del resultado de Algolia):
// participantes y podio los guarda el servidor al recalcular, sin lecturas extra.
import { contestPhase, type ContestPhase, type ContestSettings } from './contest';

export interface PodiumEntry {
    name: string;
    placeName?: string;
    placeId?: string;
    average: number;
    photo?: string;
}

export interface MinilistCardData {
    id: string;
    name: string;
    description?: string;
    coverUrl?: string | null;
    parentListId?: string | null;
    parentListName?: string | null;
    authorName?: string | null;
    authorPhoto?: string | null;
    isPublic: boolean;
    official: boolean;
    /** null si no es concurso. */
    contest: ContestPhase | null;
    reviewCount: number;
    participantsCount: number;
    followersCount: number;
    podium: PodiumEntry[];
    createdAtMs: number;
    userId?: string;
    editors?: string[];
}

type Obj = Record<string, unknown>;
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const millis = (value: unknown): number => {
    if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') return (value as { toMillis(): number }).toMillis();
    return typeof value === 'number' ? value * 1000 : 0;
};

export function cleanPodium(value: unknown): PodiumEntry[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((raw) => {
        const entry = raw as Obj;
        const name = str(entry?.name);
        const average = num(entry?.average);
        if (!name || average <= 0) return [];
        return [{
            name,
            average,
            ...(str(entry.placeName) ? { placeName: str(entry.placeName)! } : {}),
            ...(str(entry.placeId) ? { placeId: str(entry.placeId)! } : {}),
            ...(str(entry.photo) ? { photo: str(entry.photo)! } : {}),
        }];
    }).slice(0, 3);
}

/** Documento de Firestore (o resultado de Algolia) → tarjeta. */
export function toMinilistCard(list: Obj & { id?: string; objectID?: string }, now = Date.now()): MinilistCardData {
    const contestOn = (list.contest as ContestSettings | undefined)?.closed === true || list.contest === true;
    let phase: ContestPhase | null = null;
    if (contestOn) {
        if (list.contest === true) {
            const start = num(list.contestStartsAtTimestamp) * 1000;
            const end = num(list.contestEndsAtTimestamp) * 1000;
            phase = start && now < start ? 'before' : end && now > end ? 'after' : 'open';
        } else {
            phase = contestPhase(list.contest as ContestSettings, now);
        }
    }
    const isPublic = list.isPublic !== false && list.visibility !== 'private';
    return {
        id: String(list.id ?? list.objectID ?? ''),
        name: str(list.name) || 'Minilista',
        description: str(list.description) || undefined,
        coverUrl: str(list.thumbnailUrl) || str(list.mainImageUrl) || str(list.photoUrl) || str(list.coverUrl) || str(list.imageUrl),
        parentListId: str(list.parentListId),
        parentListName: str(list.parentListName),
        authorName: str(list.authorName) || str(list.ownerName),
        authorPhoto: str(list.authorPhotoUrl) || str(list.authorPhoto),
        isPublic,
        official: list.official === true,
        contest: phase,
        reviewCount: num(list.reviewCount ?? list.reviewsCount),
        participantsCount: num(list.participantsCount),
        followersCount: num(list.followersCount),
        podium: cleanPodium(list.podium),
        createdAtMs: millis(list.createdAt) || num(list.updatedAtTimestamp) * 1000,
        userId: str(list.userId) || undefined,
        editors: Array.isArray(list.editors) ? (list.editors as unknown[]).filter((v): v is string => typeof v === 'string') : undefined,
    };
}

/** Sin acentos ni mayúsculas, para buscar «tartas» y encontrar «Tártas». */
export const foldText = (value: string): string =>
    value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export type MinilistTab = 'top' | 'recent' | 'mine';

const contestRank = (phase: ContestPhase | null): number => (phase === 'open' ? 0 : phase === 'before' ? 1 : 2);

/**
 * Filtra por texto y ordena según la pestaña. En todas, el concurso abierto va primero.
 * «Destacadas»: oficial, luego participantes, reseñas y seguidores.
 */
export function arrangeMinilists(cards: MinilistCardData[], tab: MinilistTab, opts: { uid?: string | null; query?: string } = {}): MinilistCardData[] {
    const q = foldText(opts.query || '');
    const filtered = cards.filter((card) => {
        if (tab === 'mine' && !(opts.uid && (card.userId === opts.uid || card.editors?.includes(opts.uid)))) return false;
        if (!q) return true;
        return foldText([card.name, card.description, card.authorName].filter(Boolean).join(' ')).includes(q);
    });
    const score = (c: MinilistCardData) => c.participantsCount * 3 + c.reviewCount + c.followersCount * 2;
    return filtered.sort((a, b) =>
        contestRank(a.contest) - contestRank(b.contest)
        || (tab === 'recent'
            ? b.createdAtMs - a.createdAtMs
            : Number(b.official) - Number(a.official) || score(b) - score(a) || b.createdAtMs - a.createdAtMs));
}

/** «1 persona», «12 personas». */
export const peopleLabel = (n: number): string => `${n} ${n === 1 ? 'persona' : 'personas'}`;

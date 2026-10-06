import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

type Ref = { path?: string; group?: string };

const data = vi.hoisted(() => ({
    place: { name: 'Sermase', city: 'Madrid' } as Record<string, unknown>,
    reviews: [] as Array<Record<string, unknown>>,
    items: [] as Array<Record<string, unknown>>,
    itemReads: 0,
    // Si está, la lectura de la carta espera a que se abra.
    itemsGate: null as Promise<void> | null,
}));

vi.mock('../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    collectionGroup: (_db: unknown, group: string) => ({ group }),
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    query: (ref: Ref) => ref,
    where: () => null,
    limit: () => null,
    getDoc: async (ref: Ref) => ({
        exists: () => ref.path === 'places/P',
        data: () => (ref.path === 'places/P' ? data.place : undefined),
    }),
    getDocs: async (ref: Ref) => {
        const toDocs = (rows: Array<Record<string, unknown>>, prefix: string) => rows.map((row) => ({
            id: String(row.id),
            ref: { path: `${prefix}/${String(row.id)}` },
            data: () => row,
        }));
        if (ref.group === 'reviews') return { empty: data.reviews.length === 0, docs: toDocs(data.reviews, 'lists/L1/reviews') };
        if (ref.path === 'places/P/items') {
            data.itemReads += 1;
            if (data.itemsGate) await data.itemsGate;
            return { empty: data.items.length === 0, docs: toDocs(data.items, 'places/P/items') };
        }
        return { empty: true, docs: [] };
    },
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../context/AuthPromptContext', () => ({ useAuthPrompt: () => ({ openAuthPrompt: vi.fn() }) }));
vi.mock('../components/ElementRanks', () => ({ ElementRanks: () => null }));
vi.mock('../components/lazy', () => ({ LazyAddReviewForm: () => null, LazyShareModal: () => null }));
vi.mock('../components/ReviewCard', () => ({ ReviewCard: () => null }));
vi.mock('../components/ReviewCardList', () => ({ ReviewCardList: () => null }));
vi.mock('../components/SaveToArchiveModal', () => ({ SaveToArchiveModal: () => null }));
vi.mock('../components/ReportModal', () => ({ ReportModal: () => null }));

import { GroupPage } from './GroupPage';

class NoopObserver {
    observe() { /* jsdom */ }
    unobserve() { /* jsdom */ }
    disconnect() { /* jsdom */ }
}

const CurrentPath = () => {
    const location = useLocation();
    return <span data-testid="path">{location.pathname}{location.search}</span>;
};

const router: { navigate: ((to: string) => void) | null } = { navigate: null };
const Navigator = () => {
    const navigate = useNavigate();
    useEffect(() => {
        router.navigate = navigate;
    }, [navigate]);
    return null;
};

const renderAt = (url: string) => render(
    <MemoryRouter initialEntries={[url]}>
        <Navigator />
        <Routes>
            <Route path="/group/:placeId/:itemName" element={<><GroupPage /><CurrentPath /></>} />
        </Routes>
    </MemoryRouter>,
);

const review = (id: string, itemName: string, extra: Record<string, unknown> = {}) => ({
    id,
    placeId: 'P',
    visibility: 'public',
    itemName,
    overallRating: 7,
    createdAt: { seconds: 1 },
    ...extra,
});

const croqueta = {
    id: 'croqueta-prueba-1',
    canonicalName: 'Croqueta, la original',
    status: 'active',
    source: 'business',
    curatedAliasesNormalized: ['croqueta prueba 1', 'croqueta la original'],
};

describe('GroupPage', () => {
    beforeEach(() => {
        vi.stubGlobal('IntersectionObserver', NoopObserver);
        data.reviews = [];
        data.items = [];
        data.itemReads = 0;
        data.itemsGate = null;
    });

    it('casa las reseñas con la misma normalización que las Listas, sin leer la carta', async () => {
        data.reviews = [review('r1', 'Croqueta, la original'), review('r2', 'Bravas')];
        renderAt('/group/P/croqueta%20la%20ORIGINAL');

        expect(await screen.findByText('1 valoración')).toBeInTheDocument();
        expect(data.itemReads).toBe(0);
    });

    it('redirige un nombre antiguo al canónico conservando ?listId', async () => {
        data.reviews = [review('r1', 'Croqueta, la original', { originalItemName: '1' })];
        data.items = [croqueta];
        renderAt('/group/P/Croqueta%20prueba%201?listId=L1');

        await waitFor(() => expect(screen.getByTestId('path').textContent)
            .toBe('/group/P/Croqueta%2C%20la%20original?listId=L1'));
        expect(await screen.findByRole('heading', { level: 1, name: 'Croqueta, la original' })).toBeInTheDocument();
        expect(await screen.findByText('1 valoración')).toBeInTheDocument();
        // La carta se lee una sola vez aunque haya redirección.
        expect(data.itemReads).toBe(1);
    });

    it('muestra las valoraciones enlazadas al elemento antes de que el servidor las renombre', async () => {
        data.reviews = [review('r1', '1', { canonicalItemId: 'croqueta-prueba-1', canonicalItemName: 'Croqueta prueba 1' }), review('r2', '2')];
        data.items = [croqueta];
        renderAt('/group/P/Croqueta%2C%20la%20original');

        expect(await screen.findByText('1 valoración')).toBeInTheDocument();
        expect(screen.getByTestId('path').textContent).toBe('/group/P/Croqueta%2C%20la%20original');
    });

    it('sigue una fusión hasta el elemento vivo', async () => {
        data.reviews = [review('r1', 'Regina rossa')];
        data.items = [
            { id: 'reggina-rosa', canonicalName: 'Reggina rosa', status: 'inactive', mergedInto: 'regina-rossa' },
            { id: 'regina-rossa', canonicalName: 'Regina rossa', status: 'active' },
        ];
        renderAt('/group/P/Reggina%20rosa');

        await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/group/P/Regina%20rossa'));
        expect(await screen.findByText('1 valoración')).toBeInTheDocument();
    });

    it('una carga que ya no es la vigente no redirige (el usuario ya se fue a otro elemento)', async () => {
        data.items = [croqueta];
        let openItems!: () => void;
        data.itemsGate = new Promise<void>((resolve) => { openItems = resolve; });
        renderAt('/group/P/Croqueta%20prueba%201');
        await waitFor(() => expect(data.itemReads).toBe(1));

        act(() => router.navigate!('/group/P/Tortilla'));
        await waitFor(() => expect(data.itemReads).toBe(2));
        await act(async () => {
            openItems();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(await screen.findByText('Nadie ha escrito una valoración detallada sobre este plato aún.')).toBeInTheDocument();
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
        expect(screen.getByTestId('path').textContent).toBe('/group/P/Tortilla');
    });

    it('no redirige un nombre que no está en la carta', async () => {
        data.items = [croqueta];
        renderAt('/group/P/Tortilla');

        await waitFor(() => expect(data.itemReads).toBe(1));
        expect(screen.getByTestId('path').textContent).toBe('/group/P/Tortilla');
        expect(await screen.findByText('Nadie ha escrito una valoración detallada sobre este plato aún.')).toBeInTheDocument();
    });
});

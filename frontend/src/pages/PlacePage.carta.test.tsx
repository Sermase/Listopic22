import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PlaceDetails, PlaceOfficialMenuItem } from '../hooks/usePlaceDetails';

// Carta oficial (Business Pro) en la página pública: el orden que eligió el
// negocio dentro de cada sección va antes que la nota, y salen los ingredientes.

vi.mock('../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
    collection: () => ({}),
    collectionGroup: () => ({}),
    doc: () => ({}),
    query: () => ({}),
    where: () => null,
    limit: () => null,
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    getDocs: async () => ({ empty: true, docs: [] }),
    setDoc: async () => undefined,
    deleteDoc: async () => undefined,
    serverTimestamp: () => null,
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../context/AuthPromptContext', () => ({ useAuthPrompt: () => ({ openAuthPrompt: vi.fn() }) }));
vi.mock('../components/lazy', () => ({ LazyShareModal: () => null, LazyMapView: () => null, LazyAddReviewForm: () => null }));
vi.mock('../components/ReviewCard', () => ({ ReviewCard: () => null }));
vi.mock('../components/ReviewCardList', () => ({ ReviewCardList: () => null }));
vi.mock('../components/SaveToArchiveModal', () => ({ SaveToArchiveModal: () => null }));
vi.mock('../components/ReportModal', () => ({ ReportModal: () => null }));
vi.mock('../components/Lightbox', () => ({ Lightbox: () => null }));
vi.mock('../components/PlacePhotoUploadModal', () => ({ PlacePhotoUploadModal: () => null }));
vi.mock('../components/BusinessClaimModal', () => ({ BusinessClaimModal: () => null }));
vi.mock('../components/EntityHero', () => ({ EntityHero: () => null }));
vi.mock('../components/place/PlaceStatsPanel', () => ({ PlaceStatsPanel: () => null }));

const official = (id: string, name: string, extra: Partial<PlaceOfficialMenuItem> = {}): PlaceOfficialMenuItem => ({
    id,
    name,
    group: 'Postres',
    allergens: [],
    available: true,
    rating: null,
    reviewCount: 0,
    keys: [name.toLowerCase()],
    ...extra,
});

const place: PlaceDetails = {
    placeId: 'P',
    name: 'Casa Pepe',
    avgScore: 0,
    reviewCount: 0,
    criticRating: null as unknown as PlaceDetails['criticRating'],
    visibleReviewCount: 0,
    reviews: [],
    relatedLists: [],
    hasBusinessPro: true,
    menuSections: ['Postres'],
    officialItems: [
        official('flan', 'Flan', { rating: 9.5, reviewCount: 4 }),
        official('tarta', 'Tarta de queso', { menuOrder: 1, ingredients: 'queso, galleta', allergens: ['lacteos', 'gluten'] }),
        official('brownie', 'Brownie', { menuOrder: 0 }),
        official('natillas', 'Natillas', { rating: 7, reviewCount: 2 }),
    ],
};

vi.mock('../hooks/usePlaceDetails', () => ({
    usePlaceDetails: () => ({ place, loading: false, error: null, refresh: vi.fn() }),
}));

import { PlacePage } from './PlacePage';

class NoopObserver {
    observe() { /* jsdom */ }
    unobserve() { /* jsdom */ }
    disconnect() { /* jsdom */ }
}

describe('PlacePage: carta oficial', () => {
    beforeEach(() => {
        vi.stubGlobal('IntersectionObserver', NoopObserver);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('ordena primero lo que ordenó el negocio y enseña ingredientes y alérgenos con emoji', () => {
        render(
            <MemoryRouter initialEntries={['/place/P']}>
                <Routes>
                    <Route path="/place/:placeId" element={<PlacePage />} />
                </Routes>
            </MemoryRouter>,
        );

        const heading = screen.getByRole('heading', { name: 'Postres' });
        const section = heading.parentElement?.parentElement as HTMLElement;
        const names = ['Brownie', 'Tarta de queso', 'Flan', 'Natillas'];
        const order = within(section).getAllByText(/^(Brownie|Tarta de queso|Flan|Natillas)$/).map((node) => node.textContent);
        expect(order).toEqual(names);

        const ingredients = within(section).getByText(/queso, galleta/);
        expect(ingredients.textContent).toContain('Ingredientes:');
        const lacteos = within(section).getByTitle('🥛 Lácteos');
        expect(lacteos.textContent).toBe('🥛 Lácteos');
        expect(lacteos.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('🥛');
    });
});

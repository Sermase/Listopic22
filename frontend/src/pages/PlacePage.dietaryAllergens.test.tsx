import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PlaceDetails } from '../hooks/usePlaceDetails';

// D8: los alérgenos que se manejan en cocina (Ficha → 🥗 Alérgenos y dietas →
// `dietary.allergens`) salen como chips en «Alérgenos y dietas» de la ficha pública.

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

const place: PlaceDetails = {
    placeId: 'P',
    name: 'Casa Pepe',
    avgScore: 0,
    reviewCount: 0,
    criticRating: null as unknown as PlaceDetails['criticRating'],
    visibleReviewCount: 0,
    reviews: [],
    relatedLists: [],
    businessVerified: true,
    resolvedBusinessInfo: {
        // Solo alérgenos: con eso ya se enseña el bloque.
        dietary: { allergens: ['gluten', 'huevo', 'algo-raro'] },
    },
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

const chip = (text: string) => screen.getByText((_, element) => element?.tagName === 'LI' && element.textContent === text);

describe('PlacePage: alérgenos que se manejan en cocina', () => {
    beforeEach(() => {
        vi.stubGlobal('IntersectionObserver', NoopObserver);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('salen como chips con emoji (y el texto tal cual si no está en el catálogo)', () => {
        render(
            <MemoryRouter initialEntries={['/place/P']}>
                <Routes>
                    <Route path="/place/:placeId" element={<PlacePage />} />
                </Routes>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: /Alérgenos y dietas/ }));
        expect(screen.getByText(/En cocina se manejan estos alérgenos/)).toBeTruthy();
        expect(chip('🌾 Gluten')).toBeTruthy();
        expect(chip('🥚 Huevo')).toBeTruthy();
        expect(chip('⚠️ algo-raro')).toBeTruthy();
        expect(chip('🌾 Gluten').querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('🌾');
    });
});

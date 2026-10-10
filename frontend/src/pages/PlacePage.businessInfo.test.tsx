import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PlaceDetails } from '../hooks/usePlaceDetails';

// Chips públicos de la Ficha del negocio: etiqueta y emoji del catálogo
// (constants/businessInfoOptions), con el texto guardado si no está en él.

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
        identity: { languages: ['es', 'inglés', 'Klingon'] },
        commercial: {
            priceRange: 'medium',
            cuisineTypes: ['Tapas', 'Fusión'],
            paymentMethods: ['Bizum'],
            services: ['WiFi'],
        },
        dietary: { glutenFreeOptions: true, veganOptions: true, crossContaminationRisk: 'possible' },
        accessibility: { stepFreeEntrance: true, brailleMenu: true },
        family: { highChairs: true },
        pets: { petPolicy: 'dogs_only', allowsDogs: true, waterBowls: true, restrictions: ['No se permite subir a sillas', 'Solo de día'] },
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

/** El chip (o la línea) cuyo texto, emoji incluido, es exactamente este. */
const chip = (text: string) => screen.getByText((_, element) => (
    (element?.tagName === 'SPAN' || element?.tagName === 'P') && element.textContent === text
));

describe('PlacePage: chips de la Ficha del negocio', () => {
    beforeEach(() => {
        vi.stubGlobal('IntersectionObserver', NoopObserver);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('muestran el emoji y la etiqueta del catálogo', () => {
        render(
            <MemoryRouter initialEntries={['/place/P']}>
                <Routes>
                    <Route path="/place/:placeId" element={<PlacePage />} />
                </Routes>
            </MemoryRouter>,
        );

        expect(chip('🇪🇸 Español')).toBeTruthy();
        expect(chip('🇬🇧 Inglés')).toBeTruthy();
        expect(chip('Klingon')).toBeTruthy();
        expect(chip('💶 Medio')).toBeTruthy();
        expect(chip('🍢 Tapas')).toBeTruthy();
        expect(chip('🍽️ Fusión')).toBeTruthy();
        expect(chip('📲 Bizum')).toBeTruthy();
        expect(chip('📶 WiFi')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /Alérgenos y dietas/ }));
        expect(chip('🌾 Opciones sin gluten')).toBeTruthy();
        expect(chip('🌱 Vegano')).toBeTruthy();
        expect(chip('Gluten: ⚠️ Puede haber trazas')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /Accesibilidad/ }));
        expect(chip('♿ Movilidad')).toBeTruthy();
        expect(chip('🚪 Entrada sin escalones')).toBeTruthy();
        expect(chip('⠿ Carta en braille')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /Familias/ }));
        expect(chip('🪑 Tronas')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /Mascotas/ }));
        expect(chip('🐶 Admite perros')).toBeTruthy();
        expect(chip('💧 Cuencos de agua')).toBeTruthy();
        expect(chip('🐶 Solo perros')).toBeTruthy();
        expect(chip('🪑 No subir a sillas')).toBeTruthy();
        expect(chip('Solo de día')).toBeTruthy();

        // El emoji es decoración: el lector de pantalla lee solo la etiqueta.
        const emoji = chip('🐶 Admite perros').querySelector('[aria-hidden="true"]');
        expect(emoji?.textContent?.trim()).toBe('🐶');
    });
});

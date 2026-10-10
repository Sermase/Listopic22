import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { PlaceDetails } from '../hooks/usePlaceDetails';

// 🎨 Imagen en la página pública: el estilo de portada (visualStyle) se aplica
// con las mismas clases que la vista previa, y una portada que no carga deja
// ver la foto del local.

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
vi.mock('../components/place/PlaceStatsPanel', () => ({ PlaceStatsPanel: () => null }));

// La cabecera de verdad usa ProgressiveImage; aquí basta con ver qué recibe.
vi.mock('../components/EntityHero', () => ({
    EntityHero: (props: {
        imageUrl?: string;
        alt: string;
        className?: string;
        imageClassName?: string;
        onImageError?: () => void;
        children?: ReactNode;
    }) => (
        <section data-testid="hero" data-class={props.className ?? ''} data-image-class={props.imageClassName ?? ''}>
            {props.imageUrl && <img alt="Portada" src={props.imageUrl} onError={props.onImageError} />}
            {props.children}
        </section>
    ),
}));

const current = vi.hoisted(() => ({ place: null as unknown as PlaceDetails }));

const basePlace: PlaceDetails = {
    placeId: 'P',
    name: 'Bar Pepe',
    photoUrl: 'https://img.example.com/local.jpg',
    avgScore: 0,
    reviewCount: 0,
    criticRating: null as unknown as PlaceDetails['criticRating'],
    visibleReviewCount: 0,
    reviews: [],
    relatedLists: [],
};

vi.mock('../hooks/usePlaceDetails', () => ({
    usePlaceDetails: () => ({ place: current.place, loading: false, error: null, refresh: vi.fn() }),
}));

import { PlacePage } from './PlacePage';

class NoopObserver {
    observe() { /* jsdom */ }
    unobserve() { /* jsdom */ }
    disconnect() { /* jsdom */ }
}

const renderPage = () => render(
    <MemoryRouter initialEntries={['/place/P']}>
        <Routes>
            <Route path="/place/:placeId" element={<PlacePage />} />
        </Routes>
    </MemoryRouter>,
);

describe('PlacePage: estilo de portada de Business Pro', () => {
    beforeEach(() => {
        vi.stubGlobal('IntersectionObserver', NoopObserver);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('aplica el estilo elegido a la foto, la cabecera y el titular', () => {
        current.place = {
            ...basePlace,
            hasBusinessPro: true,
            businessProVisual: {
                visualStyle: 'night',
                heroImageUrl: 'https://img.example.com/portada.jpg',
                heroText: 'Cócteles de autor',
                accentColor: '#e4572e',
            },
        };
        renderPage();

        const hero = screen.getByTestId('hero');
        expect(hero.dataset.class).toContain('bg-black');
        expect(hero.dataset.imageClass).toContain('brightness-[.62]');
        expect(screen.getByRole('heading', { level: 1, name: 'Bar Pepe' }).className).toContain('[text-shadow:0_0_26px_var(--lt-accent)]');
        expect(screen.getByText('Cócteles de autor')).toHaveStyle({ borderColor: '#e4572e' });
    });

    it('si la portada no carga, enseña la foto del local', () => {
        current.place = {
            ...basePlace,
            hasBusinessPro: true,
            businessProVisual: { visualStyle: 'editorial', heroImageUrl: 'https://img.example.com/rota.jpg' },
        };
        renderPage();

        const image = screen.getByRole('img', { name: 'Portada' });
        expect(image).toHaveAttribute('src', 'https://img.example.com/rota.jpg');
        fireEvent.error(image);
        expect(screen.getByRole('img', { name: 'Portada' })).toHaveAttribute('src', 'https://img.example.com/local.jpg');
    });

    it('editorial (el de siempre) y sin Business Pro no cambian nada', () => {
        current.place = {
            ...basePlace,
            hasBusinessPro: false,
            businessProVisual: { visualStyle: 'night', heroImageUrl: 'https://img.example.com/portada.jpg' },
        };
        const { unmount } = renderPage();
        let hero = screen.getByTestId('hero');
        expect(hero.dataset.class).toBe('');
        expect(hero.dataset.imageClass).toBe('');
        expect(screen.getByRole('img', { name: 'Portada' })).toHaveAttribute('src', 'https://img.example.com/local.jpg');
        unmount();

        current.place = { ...basePlace, hasBusinessPro: true, businessProVisual: { visualStyle: 'editorial' } };
        renderPage();
        hero = screen.getByTestId('hero');
        expect(hero.dataset.class).toBe('');
        expect(hero.dataset.imageClass).toBe('');
    });
});

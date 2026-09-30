// Versiones diferidas de componentes pesados. Tienen la misma API que el
// original, pero su código (y el de sus librerías: Leaflet, Algolia, recorte
// de fotos, drag & drop...) solo se descarga cuando de verdad se muestran.
import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { ShareModal as ShareModalComponent } from './ShareModal';
import type { AddReviewForm as AddReviewFormComponent } from './AddReviewForm';
import type { MapView as MapViewComponent } from './MapView';

const ShareModalImpl = React.lazy(() => import('./ShareModal').then(m => ({ default: m.ShareModal })));
const AddReviewFormImpl = React.lazy(() => import('./AddReviewForm').then(m => ({ default: m.AddReviewForm })));
const MapViewImpl = React.lazy(() => import('./MapView').then(m => ({ default: m.MapView })));

type ShareModalProps = ComponentProps<typeof ShareModalComponent>;
type AddReviewFormProps = ComponentProps<typeof AddReviewFormComponent>;
type MapViewProps = ComponentProps<typeof MapViewComponent>;

// Cerrado no renderiza nada (igual que el original), así que solo se carga al abrirlo.
export const LazyShareModal: React.FC<ShareModalProps> = (props) => {
    if (!props.isOpen) return null;
    return (
        <Suspense fallback={null}>
            <ShareModalImpl {...props} />
        </Suspense>
    );
};

const FormLoadingOverlay = () => (
    <div className="fixed inset-0 z-[10000] lt-mobile-overlay bg-black/60 backdrop-blur-sm flex items-center justify-center" role="status" aria-label="Cargando formulario">
        <Loader2 className="w-8 h-8 text-[var(--lt-accent)] animate-spin" />
    </div>
);

export const LazyAddReviewForm: React.FC<AddReviewFormProps> = (props) => (
    <Suspense fallback={<FormLoadingOverlay />}>
        <AddReviewFormImpl {...props} />
    </Suspense>
);

export const LazyMapView: React.FC<MapViewProps> = (props) => (
    <Suspense fallback={<div className="lt-skeleton w-full h-full min-h-[12rem]" aria-busy="true" aria-label="Cargando mapa" />}>
        <MapViewImpl {...props} />
    </Suspense>
);

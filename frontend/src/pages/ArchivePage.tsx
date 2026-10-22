import React, { useState, useEffect, useMemo } from 'react';
import { HelpTip } from '../components/HelpTip';
import { useArchives, type SavedItemEntity } from '../hooks/useArchives';
import { Folder, MapPin, MessageSquare, List as ListIcon, Trash2, Map as MapIcon, X, Filter, Edit2, Search, Check, MoreVertical, Image as ImageIcon, ArrowLeft, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, collectionGroup, deleteDoc, deleteField, getDocs, limit, orderBy, query, doc, getDoc, updateDoc, where } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from '../firebase';
import { LazyMapView as MapView, LazyAddReviewForm as AddReviewForm } from '../components/lazy';
import { PlacePhotoPlaceholder } from '../components/PlacePhotoPlaceholder';
import { ProgressiveImage } from '../components/ProgressiveImage';
import type { MapItem } from '../components/MapView';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { Button, Card, IconButton, Modal, Tabs } from '../components/ui';
import { fetchUserReviewsFromAccessibleLists } from '../lib/reviewFallbacks';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { MarqueeText } from '../components/ui/MarqueeText';

const COLOR_OPTIONS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
    '#14b8a6', '#f97316', '#84cc16', '#64748b',
    '#a855f7', '#e11d48', '#0ea5e9', '#22c55e',
];

const EMOJI_OPTIONS = [
    '📍', '📁', '❤️', '⭐', '🔥', '✈️',
    '🍔', '🌮', '🍝', '🍜', '🍣', '🍕',
    '☕', '🍷', '🍺', '🥂', '🍦', '🧃',
    '🏔️', '🏖️', '🏨', '🏛️', '🌆', '🗺️',
    '🛍️', '🎨', '🎵', '🎭', '📸', '💼',
    '🌿', '🐾', '🏋️', '🎯', '🚀', '💎',
];

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    place: {
        label: 'Sitio',
        color: 'text-emerald-300',
        bg: 'bg-emerald-500/20',
        icon: <MapPin className="w-3 h-3" />,
    },
    review: {
        label: 'Reseña',
        color: 'text-purple-300',
        bg: 'bg-purple-500/20',
        icon: <MessageSquare className="w-3 h-3" />,
    },
    group: {
        label: 'Plato',
        color: 'text-amber-300',
        bg: 'bg-amber-500/20',
        icon: <ListIcon className="w-3 h-3" />,
    },
    list: {
        label: 'Lista',
        color: 'text-cyan-300',
        bg: 'bg-cyan-500/20',
        icon: <Folder className="w-3 h-3" />,
    },
};

// Lee las coordenadas de un doc de Firestore intentando todos los campos posibles
function extractCoords(data: Record<string, any>): { lat: number; lng: number } | null {
    if (data.coords?.lat && data.coords?.lng) return { lat: data.coords.lat, lng: data.coords.lng };
    if (data.coordinates?.latitude && data.coordinates?.longitude) return { lat: data.coordinates.latitude, lng: data.coordinates.longitude };
    if (data.location?.latitude && data.location?.longitude) return { lat: data.location.latitude, lng: data.location.longitude };
    if (data.latitude && data.longitude) return { lat: data.latitude, lng: data.longitude };
    if (data.lat && data.lng) return { lat: data.lat, lng: data.lng };
    return null;
}

interface UploadedPlacePhoto {
    id: string;
    docPath: string;
    placeId: string;
    placeName: string;
    caption?: string;
    url: string;
    storagePath?: string;
    createdAt?: unknown;
}

interface UploadedReviewPhoto {
    id: string;
    docPath: string;
    reviewId: string;
    listId?: string;
    placeId?: string;
    itemName: string;
    placeName?: string;
    url: string;
    storagePath?: string;
    createdAt?: unknown;
}

type ReviewPhotoSource = {
    id: string;
    path: string;
    data: Record<string, any>;
};

type ArchiveSavedItem = SavedItemEntity & { photoFallbackUrls?: string[] };
type ArchiveSection = 'collections' | 'photos';
type PhotoFilter = 'all' | 'place' | 'review';
type CollectionFilter = 'all' | 'place' | 'list' | 'group' | 'review';

const SECTION_TABS = [
    { value: 'collections' as const, label: 'Colecciones', icon: <Folder className="w-4 h-4" /> },
    { value: 'photos' as const, label: 'Fotos', icon: <ImageIcon className="w-4 h-4" /> },
];

const PHOTO_FILTER_TABS = [
    { value: 'all' as const, label: 'Todas' },
    { value: 'place' as const, label: 'Sitios' },
    { value: 'review' as const, label: 'Reseñas' },
];

const COLLECTION_FILTER_TABS = [
    { value: 'all' as const, label: 'Todo' },
    { value: 'place' as const, label: 'Sitios' },
    { value: 'list' as const, label: 'Listas' },
    { value: 'group' as const, label: 'Platos' },
    { value: 'review' as const, label: 'Reseñas' },
];

function toMillis(value: any): number {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    if (value instanceof Date) return value.getTime();
    return 0;
}

function getErrorCode(error: unknown): string | null {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        return typeof code === 'string' ? code : null;
    }
    return null;
}

const firstString = (...values: unknown[]): string | undefined => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (Array.isArray(value)) {
            const nested = firstString(...value);
            if (nested) return nested;
        }
    }
    return undefined;
};

const addUniquePhoto = (photos: string[], value: unknown) => {
    const photo = firstString(value);
    if (photo && !photos.includes(photo)) photos.push(photo);
};

const getReviewPhotosFromData = (data: Record<string, any>): string[] => {
    const photos: string[] = [];
    if (Array.isArray(data.photoUrls)) data.photoUrls.forEach((url) => addUniquePhoto(photos, url));
    addUniquePhoto(photos, data.photoUrl);
    return photos;
};

const normalizeLabel = (value: string | undefined) => (value || '').trim().toLowerCase();

const ArchiveItemFallback: React.FC<{ type: SavedItemEntity['type'] }> = ({ type }) => {
    if (type === 'group') return <PlacePhotoPlaceholder compact variant="group" />;
    if (type === 'review') return <PlacePhotoPlaceholder compact variant="review" />;
    return <PlacePhotoPlaceholder compact />;
};

const ArchiveItemImage: React.FC<{ item: ArchiveSavedItem }> = ({ item }) => {
    const candidates = useMemo(
        () => [item.photoUrl, ...(item.photoFallbackUrls || [])].filter((url): url is string => typeof url === 'string' && url.trim().length > 0),
        [item.photoFallbackUrls, item.photoUrl],
    );
    const [index, setIndex] = useState(0);

    useEffect(() => {
        setIndex(0);
    }, [item.itemId, candidates.join('|')]);

    const src = candidates[index];
    if (!src) return <ArchiveItemFallback type={item.type} />;

    return (
        <ProgressiveImage
            src={src}
            alt={item.name}
            containerClassName="w-full h-full"
            className="w-full h-full object-cover"
            fallback={<ArchiveItemFallback type={item.type} />}
            onError={() => {
                setIndex((current) => {
                    const next = current + 1;
                    return next < candidates.length ? next : current;
                });
            }}
        />
    );
};

const UploadedPhotoFallback: React.FC<{ kind: 'place' | 'review' }> = ({ kind }) => (
    <PlacePhotoPlaceholder compact variant={kind === 'review' ? 'review' : undefined} />
);

const UploadedPhotoImage: React.FC<{ photo: UploadedPlacePhoto | UploadedReviewPhoto; kind: 'place' | 'review'; alt: string }> = ({ photo, kind, alt }) => (
    <ProgressiveImage
        src={photo.url}
        alt={alt}
        containerClassName="w-full h-full"
        className="w-full h-full object-cover"
        fallback={<UploadedPhotoFallback kind={kind} />}
    />
);

function getStoragePathFromUrl(url: string): string | undefined {
    try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/o\/([^/]+)$/);
        return match ? decodeURIComponent(match[1]) : undefined;
    } catch {
        return undefined;
    }
}

export const ArchivePage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { archives, fetchArchives, toggleItemInArchive, createArchive, updateArchive, deleteArchive } = useArchives();
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
    const [activeSection, setActiveSection] = useState<ArchiveSection>('collections');
    const [photoFilter, setPhotoFilter] = useState<PhotoFilter>('all');
    const [filterType, setFilterType] = useState<CollectionFilter>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [openArchiveId, setOpenArchiveId] = useState<string | null>(null);
    const [covers, setCovers] = useState<Record<string, string[]>>({});
    const [showSearch, setShowSearch] = useState(false);
    const [itemMenu, setItemMenu] = useState<{ item: ArchiveSavedItem; archiveId: string } | null>(null);
    const [archiveItems, setArchiveItems] = useState<Record<string, ArchiveSavedItem[]>>({});
    const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
    const [uploadedPlacePhotos, setUploadedPlacePhotos] = useState<UploadedPlacePhoto[]>([]);
    const [uploadedReviewPhotos, setUploadedReviewPhotos] = useState<UploadedReviewPhoto[]>([]);
    const [loadingPlacePhotos, setLoadingPlacePhotos] = useState(false);
    const [loadingReviewPhotos, setLoadingReviewPhotos] = useState(false);
    const [openPhotoMenu, setOpenPhotoMenu] = useState<string | null>(null);
    const [editingPlacePhoto, setEditingPlacePhoto] = useState<UploadedPlacePhoto | null>(null);
    const [editingCaption, setEditingCaption] = useState('');
    const [editingReviewPhoto, setEditingReviewPhoto] = useState<UploadedReviewPhoto | null>(null);
    const [photoReloadKey, setPhotoReloadKey] = useState(0);

    // Mapa
    const [mapItems, setMapItems] = useState<MapItem[]>([]);
    const [loadingMap, setLoadingMap] = useState(false);
    const [showMapFilters, setShowMapFilters] = useState(false);
    const [mapSelectedArchives, setMapSelectedArchives] = useState<string[]>([]);

    // Modal edición/creación
    const [showEditModal, setShowEditModal] = useState(false);
    const [editMode, setEditMode] = useState<'create' | 'edit'>('create');
    const [editId, setEditId] = useState('');
    const [editName, setEditName] = useState('');
    const [editEmoji, setEditEmoji] = useState('📍');
    const [editColor, setEditColor] = useState(COLOR_OPTIONS[0]);
    useBodyScrollLock(viewMode === 'map' || showEditModal || editingPlacePhoto !== null || editingReviewPhoto !== null);

    useEffect(() => { fetchArchives(); }, [fetchArchives]);

    useEffect(() => {
        setOpenPhotoMenu(null);
    }, [activeSection, photoFilter, searchTerm]);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;

        const loadUploadedPlacePhotos = async () => {
            setLoadingPlacePhotos(true);
            try {
                const snap = await getDocs(query(
                    collectionGroup(db, 'photos'),
                    where('userId', '==', user.uid),
                    orderBy('createdAt', 'desc'),
                    limit(120),
                ));
                if (cancelled) return;

                const photos = snap.docs
                    .map((photoDoc): UploadedPlacePhoto | null => {
                        const pathSegments = photoDoc.ref.path.split('/');
                        if (pathSegments.length !== 4 || pathSegments[0] !== 'places' || pathSegments[2] !== 'photos') {
                            return null;
                        }
                        const data = photoDoc.data() as Record<string, any>;
                        if (typeof data.url !== 'string' || !data.url.trim()) return null;
                        const placeId = typeof data.placeId === 'string' && data.placeId.trim()
                            ? data.placeId.trim()
                            : pathSegments[1];

                        return {
                            id: photoDoc.id,
                            docPath: photoDoc.ref.path,
                            placeId,
                            placeName: typeof data.placeName === 'string' && data.placeName.trim() ? data.placeName.trim() : 'Lugar',
                            caption: typeof data.caption === 'string' && data.caption.trim() ? data.caption.trim() : undefined,
                            url: data.url.trim(),
                            storagePath: typeof data.storagePath === 'string' && data.storagePath.trim() ? data.storagePath.trim() : undefined,
                            createdAt: data.createdAt,
                        };
                    })
                    .filter((photo): photo is UploadedPlacePhoto => photo !== null)
                    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

                setUploadedPlacePhotos(photos);
            } catch (error) {
                console.error('Error loading uploaded place photos', error);
                if (!cancelled) setUploadedPlacePhotos([]);
            } finally {
                if (!cancelled) setLoadingPlacePhotos(false);
            }
        };

        void loadUploadedPlacePhotos();
        return () => {
            cancelled = true;
        };
    }, [user, photoReloadKey]);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;

        const loadUploadedReviewPhotos = async () => {
            setLoadingReviewPhotos(true);
            try {
                let reviewSources: ReviewPhotoSource[] = [];

                try {
                    const snap = await getDocs(query(
                        collectionGroup(db, 'reviews'),
                        where('userId', '==', user.uid),
                        orderBy('createdAt', 'desc'),
                        limit(160),
                    ));
                    reviewSources = snap.docs.map((reviewDoc) => ({
                        id: reviewDoc.id,
                        path: reviewDoc.ref.path,
                        data: reviewDoc.data() as Record<string, any>,
                    }));
                } catch (error) {
                    if (getErrorCode(error) !== 'permission-denied') throw error;

                    const fallbackReviews = await fetchUserReviewsFromAccessibleLists(user.uid, 160);
                    reviewSources = fallbackReviews.map((review) => ({
                        id: review.id,
                        path: review.listId ? `lists/${review.listId}/reviews/${review.id}` : `reviews/${review.id}`,
                        data: review as Record<string, any>,
                    }));
                }
                if (cancelled) return;

                const seen = new Set<string>();
                const photos = reviewSources.flatMap((reviewDoc): UploadedReviewPhoto[] => {
                    const data = reviewDoc.data;
                    const pathSegments = reviewDoc.path.split('/');
                    const inferredListId = pathSegments.length === 4 && pathSegments[0] === 'lists'
                        ? pathSegments[1]
                        : undefined;
                    const listId = typeof data.listId === 'string' && data.listId.trim()
                        ? data.listId.trim()
                        : inferredListId;
                    const reviewKey = `${listId || 'root'}:${reviewDoc.id}`;

                    const urls = Array.isArray(data.photoUrls) && data.photoUrls.length > 0
                        ? data.photoUrls
                        : (typeof data.photoUrl === 'string' && data.photoUrl.trim() ? [data.photoUrl] : []);
                    const storagePaths = Array.isArray(data.photoStoragePaths) ? data.photoStoragePaths : [];

                    return urls
                        .filter((url: unknown): url is string => typeof url === 'string' && url.trim().length > 0)
                        .map((url, index) => {
                            const trimmedUrl = url.trim();
                            const key = `${reviewKey}:${trimmedUrl}`;
                            if (seen.has(key)) return null;
                            seen.add(key);

                            const explicitStoragePath = typeof storagePaths[index] === 'string' && storagePaths[index].trim()
                                ? storagePaths[index].trim()
                                : undefined;

                            return {
                                id: `${reviewDoc.id}-${index}`,
                                docPath: reviewDoc.path,
                                reviewId: reviewDoc.id,
                                listId,
                                placeId: typeof data.placeId === 'string' ? data.placeId : undefined,
                                itemName: typeof data.itemName === 'string' && data.itemName.trim() ? data.itemName.trim() : 'Reseña',
                                placeName: typeof data.placeName === 'string' && data.placeName.trim() ? data.placeName.trim() : undefined,
                                url: trimmedUrl,
                                storagePath: explicitStoragePath || getStoragePathFromUrl(trimmedUrl),
                                createdAt: data.createdAt,
                            } as UploadedReviewPhoto;
                        })
                        .filter((photo): photo is UploadedReviewPhoto => photo !== null);
                }).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

                setUploadedReviewPhotos(photos);
            } catch (error) {
                console.error('Error loading uploaded review photos', error);
                if (!cancelled) setUploadedReviewPhotos([]);
            } finally {
                if (!cancelled) setLoadingReviewPhotos(false);
            }
        };

        void loadUploadedReviewPhotos();
        return () => {
            cancelled = true;
        };
    }, [user, photoReloadKey]);

    useEffect(() => {
        if (openArchiveId && !archiveItems[openArchiveId] && !loadingItems[openArchiveId]) fetchItemsForArchive(openArchiveId);
    }, [openArchiveId]);

    // Portadas: las fotos de lo último guardado en cada colección.
    useEffect(() => {
        let cancelled = false;
        archives.forEach((arch) => {
            if (covers[arch.id]) return;
            loadLightItems(arch.id, 8)
                .then((items) => {
                    const photos = Array.from(new Set(items.map(item => item.photoUrl).filter((url): url is string => typeof url === 'string' && url.length > 0))).slice(0, 4);
                    if (!cancelled) setCovers(prev => ({ ...prev, [arch.id]: photos }));
                })
                .catch(() => { if (!cancelled) setCovers(prev => ({ ...prev, [arch.id]: [] })); });
        });
        return () => { cancelled = true; };
    }, [archives]);

    const openArchive = archives.find(a => a.id === openArchiveId) || null;
    const visibleArchives = searchTerm.trim()
        ? archives.filter(a => a.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
        : archives;

    const openCollection = (archiveId: string) => {
        setOpenArchiveId(archiveId);
        setFilterType('all');
        setSearchTerm('');
        setShowSearch(false);
        window.scrollTo({ top: 0 });
    };

    const closeCollection = () => {
        setOpenArchiveId(null);
        setFilterType('all');
        setSearchTerm('');
        setShowSearch(false);
    };

    const getReviewPhotoCandidatesForPlace = async (placeId?: string, itemName?: string): Promise<string[]> => {
        if (!placeId) return [];
        try {
            const snap = await getDocs(query(
                collectionGroup(db, 'reviews'),
                where('placeId', '==', placeId),
                where('visibility', '==', 'public'),
                limit(40),
            ));
            const wantedItemName = normalizeLabel(itemName);
            const photos: string[] = [];
            snap.docs.forEach((reviewDoc) => {
                const data = reviewDoc.data() as Record<string, any>;
                if (wantedItemName) {
                    const reviewItemName = normalizeLabel(
                        typeof data.itemName === 'string' ? data.itemName : typeof data.placeName === 'string' ? data.placeName : undefined,
                    );
                    if (reviewItemName !== wantedItemName) return;
                }
                getReviewPhotosFromData(data).forEach((photo) => addUniquePhoto(photos, photo));
            });
            return photos;
        } catch (error) {
            console.warn('ArchivePage: could not load review photo fallback', error);
            return [];
        }
    };

    const getPlacePhotoCandidates = async (placeId?: string): Promise<string[]> => {
        if (!placeId) return [];
        const photos: string[] = [];

        try {
            const placePhotosSnap = await getDocs(query(
                collection(db, 'places', placeId, 'photos'),
                orderBy('createdAt', 'desc'),
                limit(6),
            ));
            placePhotosSnap.docs.forEach((photoDoc) => {
                const data = photoDoc.data() as Record<string, any>;
                addUniquePhoto(photos, data.url || data.photoUrl);
            });
        } catch (error) {
            console.warn('ArchivePage: could not load place photos fallback', error);
        }

        try {
            const placeSnap = await getDoc(doc(db, 'places', placeId));
            if (placeSnap.exists()) {
                const data = placeSnap.data() as Record<string, any>;
                addUniquePhoto(photos, data.userPhotoUrl);
                addUniquePhoto(photos, data.mainImageUrl);
                addUniquePhoto(photos, data.photoUrl);
                addUniquePhoto(photos, data.thumbnailUrl);
                addUniquePhoto(photos, data.coverUrl);
                addUniquePhoto(photos, data.imageUrl);
                addUniquePhoto(photos, data.photos);
            }
        } catch (error) {
            console.warn('ArchivePage: could not load place doc photo fallback', error);
        }

        const reviewPhotos = await getReviewPhotoCandidatesForPlace(placeId);
        reviewPhotos.forEach((photo) => addUniquePhoto(photos, photo));
        return photos;
    };

    const getArchiveItemPhotoCandidates = async (item: SavedItemEntity): Promise<string[]> => {
        const photos: string[] = [];

        if (item.type === 'place') {
            const placePhotos = await getPlacePhotoCandidates(item.placeId || item.itemId);
            placePhotos.forEach((photo) => addUniquePhoto(photos, photo));
            addUniquePhoto(photos, item.photoUrl);
            return photos;
        }

        addUniquePhoto(photos, item.photoUrl);

        if (item.type === 'review') {
            const reviewPhotos = await getReviewPhotoCandidatesForPlace(item.placeId, item.name);
            reviewPhotos.forEach((photo) => addUniquePhoto(photos, photo));
            return photos;
        }

        if (item.type === 'group') {
            const groupPhotos = await getReviewPhotoCandidatesForPlace(item.placeId, item.name);
            groupPhotos.forEach((photo) => addUniquePhoto(photos, photo));
            const placePhotos = await getPlacePhotoCandidates(item.placeId);
            placePhotos.forEach((photo) => addUniquePhoto(photos, photo));
            return photos;
        }

        return photos;
    };

    /** Lo guardado tal cual (sin buscar fotos de respaldo): para portadas y mapa. */
    const loadLightItems = async (archiveId: string, max?: number): Promise<SavedItemEntity[]> => {
        if (!user) return [];
        const base = collection(db, 'users', user.uid, 'archives', archiveId, 'items');
        const q = max ? query(base, orderBy('savedAt', 'desc'), limit(max)) : query(base, orderBy('savedAt', 'desc'));
        const snap = await getDocs(q);
        const rawItems = snap.docs.map(iDoc => {
            const data = iDoc.data();
            let route = data.route;
            if (!route) {
                const type = (data.entityType || '').toLowerCase();
                if (type === 'place' && data.placeId) route = `/place/${data.placeId}`;
                else if (type === 'group' && data.placeId && data.itemName) route = `/group/${data.placeId}/${encodeURIComponent(data.itemName)}`;
                else if (type === 'review' && data.placeId) route = `/place/${data.placeId}`;
            }
            const coords = extractCoords(data);
            return {
                id: iDoc.id,
                itemId: data.itemId || iDoc.id,
                type: data.type || data.entityType || 'other',
                name: data.name || data.title || data.itemName || 'Sin nombre',
                subtitle: data.subtitle,
                photoUrl: data.thumbnailUrl || data.mainImageUrl || data.photoUrl || data.coverUrl || data.imageUrl,
                route: route || '#',
                placeId: data.placeId,
                listId: data.listId,
                lat: coords?.lat,
                lng: coords?.lng,
                savedAt: data.savedAt || data.createdAt,
            } as SavedItemEntity;
        });
        return rawItems;
    };

    const loadRawItems = async (archiveId: string): Promise<ArchiveSavedItem[]> => {
        const rawItems = await loadLightItems(archiveId);
        return Promise.all(rawItems.map(async (item): Promise<ArchiveSavedItem> => {
            const photoCandidates = await getArchiveItemPhotoCandidates(item);
            return {
                ...item,
                photoUrl: photoCandidates[0],
                photoFallbackUrls: photoCandidates.slice(1),
            };
        }));
    };

    const fetchItemsForArchive = async (archiveId: string) => {
        setLoadingItems(prev => ({ ...prev, [archiveId]: true }));
        try {
            const items = await loadRawItems(archiveId);
            setArchiveItems(prev => ({ ...prev, [archiveId]: items }));
        } catch (e) { console.error(e); }
        finally { setLoadingItems(prev => ({ ...prev, [archiveId]: false })); }
    };

    // Carga el mapa: sitios, platos y reseñas (las listas no tienen sitio). Sin fotos de
    // respaldo, que eran decenas de consultas; las coordenadas que falten salen de
    // places/, una lectura por sitio y todas a la vez.
    useEffect(() => {
        if (viewMode !== 'map') return;
        let cancelled = false;
        const activeIds = mapSelectedArchives.length > 0 ? mapSelectedArchives : archives.map(a => a.id);
        const load = async () => {
            setLoadingMap(true);
            try {
                const perArchive = await Promise.all(activeIds.map(async (archId) => {
                    const arch = archives.find(a => a.id === archId);
                    const raw = archiveItems[archId] ?? await loadLightItems(archId).catch(() => []);
                    return raw
                        .filter(item => item.type !== 'list' && (item.placeId || (item.lat && item.lng)))
                        .map(item => ({ item, arch }));
                }));
                const entries = perArchive.flat();
                const missing = Array.from(new Set(entries.filter(({ item }) => !(item.lat && item.lng)).map(({ item }) => item.placeId as string)));
                const coordsByPlace = new Map<string, { lat: number; lng: number }>();
                await Promise.all(missing.map(async (placeId) => {
                    try {
                        const snap = await getDoc(doc(db, 'places', placeId));
                        const coords = snap.exists() ? extractCoords(snap.data() as Record<string, any>) : null;
                        if (coords) coordsByPlace.set(placeId, coords);
                    } catch { /* sin coords, se ignora */ }
                }));
                const result: MapItem[] = [];
                entries.forEach(({ item, arch }) => {
                    const coords = item.lat && item.lng ? { lat: item.lat, lng: item.lng } : coordsByPlace.get(item.placeId || '');
                    if (!coords) return;
                    result.push({
                        // El mismo sitio puede estar en dos colecciones: id compuesto.
                        id: `${arch?.id || 'x'}:${item.itemId}`,
                        placeId: item.placeId,
                        lat: coords.lat,
                        lng: coords.lng,
                        name: item.type === 'place' || !item.subtitle ? item.name : `${item.name} · ${item.subtitle}`,
                        photoUrl: item.photoUrl,
                        emoji: arch?.emoji || '📍',
                        color: arch?.color || '#6366f1',
                    });
                });
                if (!cancelled) setMapItems(result);
            } finally {
                if (!cancelled) setLoadingMap(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [viewMode, mapSelectedArchives, archives]);

    const openMap = (archiveIds?: string[]) => {
        setMapSelectedArchives(archiveIds || archives.map(a => a.id));
        setShowMapFilters(false);
        setViewMode('map');
    };

    const refreshCovers = (...archiveIds: string[]) =>
        setCovers(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !archiveIds.includes(id))));

    const moveItem = async (item: ArchiveSavedItem, sourceId: string, targetId: string) => {
        setItemMenu(null);
        try {
            const saved: ArchiveSavedItem = { ...item };
            delete saved.photoFallbackUrls;
            await toggleItemInArchive(targetId, { ...saved, savedAt: null }, true);
            await toggleItemInArchive(sourceId, item, false);
            fetchItemsForArchive(sourceId);
            setArchiveItems(prev => { const next = { ...prev }; delete next[targetId]; return next; });
            refreshCovers(sourceId, targetId);
            fetchArchives();
            showToast({ variant: 'success', message: `Movido a ${archives.find(a => a.id === targetId)?.name || 'la colección'}` });
        } catch { showToast({ variant: 'error', message: 'No se pudo mover el elemento.' }); }
    };

    const removeItem = async (item: ArchiveSavedItem, archiveId: string) => {
        setItemMenu(null);
        try {
            await toggleItemInArchive(archiveId, item, false);
            fetchItemsForArchive(archiveId);
            refreshCovers(archiveId);
            fetchArchives();
        } catch { showToast({ variant: 'error', message: 'No se pudo quitar el elemento.' }); }
    };

    const getFilteredItems = (items: SavedItemEntity[]) =>
        items.filter(i => {
            if (filterType !== 'all' && i.type !== filterType) return false;
            if (searchTerm && !i.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            return true;
        });

    const openCreate = () => {
        setEditMode('create'); setEditId(''); setEditName('');
        setEditEmoji('📍'); setEditColor(COLOR_OPTIONS[0]);
        setShowEditModal(true);
    };

    const openEdit = (e: React.MouseEvent, arch: { id: string; name: string; emoji?: string; color?: string }) => {
        e.stopPropagation();
        setEditMode('edit'); setEditId(arch.id); setEditName(arch.name);
        setEditEmoji(arch.emoji || '📍'); setEditColor(arch.color || COLOR_OPTIONS[0]);
        setShowEditModal(true);
    };

    const saveEdit = async () => {
        if (!editName.trim()) return;
        try {
            if (editMode === 'create') await createArchive(editName.trim(), editEmoji, editColor);
            else await updateArchive(editId, { name: editName.trim(), emoji: editEmoji, color: editColor });
            setShowEditModal(false);
        } catch { showToast({ variant: 'error', message: 'No se pudo guardar la colección.' }); }
    };

    const makeDocRefFromPath = (path: string) => {
        const [firstPathSegment, ...remainingPathSegments] = path.split('/');
        return doc(db, firstPathSegment, ...remainingPathSegments);
    };

    const photosForGrid = useMemo(() => {
        const placePhotos = uploadedPlacePhotos.map(photo => ({ kind: 'place' as const, photo }));
        const reviewPhotos = uploadedReviewPhotos.map(photo => ({ kind: 'review' as const, photo }));
        const merged = [
            ...(photoFilter === 'review' ? [] : placePhotos),
            ...(photoFilter === 'place' ? [] : reviewPhotos),
        ];

        return merged
            .filter(item => {
                if (!searchTerm.trim()) return true;
                const needle = searchTerm.trim().toLowerCase();
                if (item.kind === 'place') {
                    return item.photo.placeName.toLowerCase().includes(needle) ||
                        (item.photo.caption || '').toLowerCase().includes(needle);
                }
                return item.photo.itemName.toLowerCase().includes(needle) ||
                    (item.photo.placeName || '').toLowerCase().includes(needle);
            })
            .sort((a, b) => toMillis(b.photo.createdAt) - toMillis(a.photo.createdAt));
    }, [photoFilter, searchTerm, uploadedPlacePhotos, uploadedReviewPhotos]);

    const openPlacePhotoEdit = (photo: UploadedPlacePhoto) => {
        setOpenPhotoMenu(null);
        setEditingPlacePhoto(photo);
        setEditingCaption(photo.caption || '');
    };

    const openReviewPhotoEdit = (photo: UploadedReviewPhoto) => {
        setOpenPhotoMenu(null);
        setEditingReviewPhoto(photo);
    };

    const savePlacePhotoCaption = async () => {
        if (!editingPlacePhoto) return;
        try {
            const caption = editingCaption.trim();
            await updateDoc(makeDocRefFromPath(editingPlacePhoto.docPath), { caption });
            setUploadedPlacePhotos(prev => prev.map(photo =>
                photo.docPath === editingPlacePhoto.docPath
                    ? { ...photo, caption: caption || undefined }
                    : photo
            ));
            setEditingPlacePhoto(null);
            setEditingCaption('');
        } catch (error) {
            console.error('Error updating place photo caption', error);
            showToast({ variant: 'error', message: 'No se pudo editar la foto.' });
        }
    };

    const deleteUploadedPlacePhoto = async (photo: UploadedPlacePhoto) => {
        setOpenPhotoMenu(null);
        if (!await confirm({ title: '¿Borrar esta foto del sitio?', message: 'Dejará de verse en la ficha del sitio.', confirmLabel: 'Borrar', destructive: true })) return;
        try {
            if (photo.storagePath) {
                await deleteObject(ref(storage, photo.storagePath)).catch((error: any) => {
                    if (error?.code !== 'storage/object-not-found') throw error;
                });
            }
            await deleteDoc(makeDocRefFromPath(photo.docPath));
            setUploadedPlacePhotos(prev => prev.filter(item => item.docPath !== photo.docPath));
            setOpenPhotoMenu(null);
        } catch (error) {
            console.error('Error deleting uploaded place photo', error);
            showToast({ variant: 'error', message: 'No se pudo borrar la foto.' });
        }
    };

    const deleteUploadedReviewPhoto = async (photo: UploadedReviewPhoto) => {
        setOpenPhotoMenu(null);
        if (!await confirm({ title: '¿Borrar esta foto de la reseña?', confirmLabel: 'Borrar', destructive: true })) return;
        try {
            if (photo.storagePath) {
                await deleteObject(ref(storage, photo.storagePath)).catch((error: any) => {
                    if (error?.code !== 'storage/object-not-found') throw error;
                });
            }

            const reviewRef = makeDocRefFromPath(photo.docPath);
            const reviewSnap = await getDoc(reviewRef);
            if (!reviewSnap.exists()) {
                setUploadedReviewPhotos(prev => prev.filter(item => item.docPath !== photo.docPath || item.url !== photo.url));
                return;
            }

            const data = reviewSnap.data() as Record<string, any>;
            const existingUrls = Array.isArray(data.photoUrls) && data.photoUrls.length > 0
                ? data.photoUrls.filter((url: unknown): url is string => typeof url === 'string' && url.trim().length > 0)
                : (typeof data.photoUrl === 'string' && data.photoUrl.trim() ? [data.photoUrl] : []);
            const removeIndex = existingUrls.findIndex(url => url === photo.url);
            const nextUrls = removeIndex >= 0
                ? existingUrls.filter((_, index) => index !== removeIndex)
                : existingUrls.filter(url => url !== photo.url);

            const existingStoragePaths = Array.isArray(data.photoStoragePaths)
                ? data.photoStoragePaths.filter((path: unknown): path is string => typeof path === 'string' && path.trim().length > 0)
                : [];
            const nextStoragePaths = removeIndex >= 0
                ? existingStoragePaths.filter((_, index) => index !== removeIndex)
                : existingStoragePaths.filter(path => path !== photo.storagePath);

            await updateDoc(reviewRef, {
                photoUrl: nextUrls[0] || deleteField(),
                photoUrls: nextUrls.length > 0 ? nextUrls : deleteField(),
                photoStoragePaths: nextStoragePaths.length > 0 ? nextStoragePaths : deleteField(),
            });

            setUploadedReviewPhotos(prev => prev.filter(item => item.docPath !== photo.docPath || item.url !== photo.url));
            setOpenPhotoMenu(null);
        } catch (error) {
            console.error('Error deleting uploaded review photo', error);
            showToast({ variant: 'error', message: 'No se pudo borrar la foto.' });
        }
    };

    if (!user) return <div className="pt-safe-32 px-4 text-center text-sm text-[var(--lt-text-muted)]">Inicia sesión para ver tus colecciones.</div>;

    // ── VISTA MAPA ────────────────────────────────────────────────────────────
    if (viewMode === 'map') {
        return (
            <div className="fixed inset-0 z-[10000] bg-[var(--lt-bg)] flex flex-col">
                {/* Barra de arriba (fuera del mapa, para no tapar el zoom) */}
                <div className="pt-safe-top shrink-0 border-b border-[var(--lt-border)] bg-[var(--lt-bg)]">
                    <div className="flex items-center gap-2 px-3 py-2.5">
                        <IconButton label="Cerrar mapa" icon={<X className="w-5 h-5" />} variant="ghost" onClick={() => setViewMode('grid')} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-display font-bold text-[var(--lt-text)]">
                                {mapSelectedArchives.length === 1
                                    ? `${archives.find(a => a.id === mapSelectedArchives[0])?.emoji || '📁'} ${archives.find(a => a.id === mapSelectedArchives[0])?.name || ''}`
                                    : 'Tus guardados'}
                            </p>
                            <p className="text-[11px] text-[var(--lt-text-muted)]">
                                {loadingMap ? 'Buscando sitios…' : `${mapItems.length} ${mapItems.length === 1 ? 'sitio' : 'sitios'} en el mapa`}
                            </p>
                        </div>
                        {archives.length > 1 && (
                            <Button
                                onClick={() => setShowMapFilters(v => !v)}
                                variant={showMapFilters ? 'primary' : 'secondary'}
                                size="sm"
                                leftIcon={<Filter className="w-4 h-4" />}
                                className="rounded-full"
                            >
                                Colecciones
                            </Button>
                        )}
                    </div>
                </div>

                <div className="relative flex-1 w-full">
                    {loadingMap && (
                        <div className="absolute inset-0 z-[500] bg-[var(--lt-bg)]/50 flex items-center justify-center pointer-events-none">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--lt-accent-border)]" />
                        </div>
                    )}
                    {!loadingMap && mapItems.length === 0 && (
                        <div className="absolute inset-x-4 top-4 z-[500] rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] px-4 py-3 text-center text-xs font-medium text-[var(--lt-text-muted)] shadow-xl">
                            Aquí no hay sitios con ubicación. Las listas no salen en el mapa.
                        </div>
                    )}
                    <MapView items={mapItems} mode="global" showLayerControl={false} />
                </div>

                {/* Panel de filtro de colecciones */}
                {showMapFilters && (
                    <Card className="absolute left-4 right-4 z-[1001] flex max-h-[50vh] flex-col overflow-hidden shadow-2xl" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
                        <div className="px-4 py-3 border-b border-[var(--lt-border)] flex items-center justify-between">
                            <span className="text-[var(--lt-text)] font-bold text-sm">Qué colecciones ver</span>
                            <IconButton label="Cerrar filtros" icon={<X className="w-4 h-4" />} size="sm" variant="ghost" onClick={() => setShowMapFilters(false)} />
                        </div>
                        <div className="overflow-y-auto p-2">
                            {archives.map(arch => {
                                const active = mapSelectedArchives.includes(arch.id);
                                return (
                                    <button
                                        key={arch.id}
                                        onClick={() => setMapSelectedArchives(prev =>
                                            active ? prev.filter(x => x !== arch.id) : [...prev, arch.id]
                                        )}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl mb-1 transition-colors ${active ? 'bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)]' : 'hover:bg-[var(--lt-card)] border border-transparent'}`}
                                    >
                                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0" style={{ backgroundColor: arch.color || '#6366f1' }}>
                                            {arch.emoji || '📍'}
                                        </div>
                                        <span className="flex-1 min-w-0 text-left text-sm font-medium text-[var(--lt-text)] truncate">{arch.name}</span>
                                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${active ? 'bg-[var(--lt-accent)] border-transparent lt-on-accent' : 'border-[var(--lt-border-strong)]'}`}>
                                            {active && <Check className="w-3 h-3" />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </Card>
                )}
            </div>
        );
    }

    // ── VISTA GRID ────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[var(--lt-bg)] pt-safe-24 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-20 px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">

                {/* Header */}
                <header className="mb-5">
                    <div className="flex items-center gap-2 mb-4">
                        {openArchive ? (
                            <IconButton label="Volver a tus colecciones" icon={<ArrowLeft className="w-5 h-5" />} variant="ghost" onClick={closeCollection} />
                        ) : null}
                        <div className="min-w-0 flex-1">
                            <h1 className="text-2xl md:text-3xl font-display font-black leading-tight text-[var(--lt-text)] flex items-center gap-2">Guardados <HelpTip topic="guardados" /></h1>
                            {!openArchive && (
                                <p className="mt-0.5 text-xs font-medium text-[var(--lt-text-muted)]">
                                    {activeSection === 'photos'
                                        ? `${uploadedPlacePhotos.length + uploadedReviewPhotos.length} fotos subidas por ti`
                                        : archives.length > 0
                                            ? `${archives.length} ${archives.length === 1 ? 'colección' : 'colecciones'} · ${archives.reduce((sum, a) => sum + (a.itemCount || 0), 0)} guardados`
                                            : 'Tus sitios, platos y listas, a mano'}
                                </p>
                            )}
                        </div>
                        <IconButton
                            label="Buscar"
                            icon={<Search className="w-4 h-4" />}
                            size="sm"
                            variant={showSearch ? 'primary' : 'ghost'}
                            onClick={() => { setShowSearch(v => !v); if (showSearch) setSearchTerm(''); }}
                        />
                        {activeSection === 'collections' && archives.length > 0 && (
                            <button
                                type="button"
                                onClick={() => openMap(openArchive ? [openArchive.id] : undefined)}
                                className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--lt-accent)] hover:opacity-80 transition-opacity"
                            >
                                <MapIcon className="w-3.5 h-3.5" /> Mapa
                            </button>
                        )}
                    </div>

                    {!openArchive && (
                        <Tabs
                            value={activeSection}
                            options={SECTION_TABS}
                            onChange={(section) => { setActiveSection(section); setSearchTerm(''); }}
                            className="mb-3 bg-[var(--lt-card-strong)]"
                        />
                    )}

                    {showSearch && (
                        <div className="relative mb-3">
                            <Search className="w-4 h-4 text-[var(--lt-text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="search"
                                autoFocus
                                placeholder={activeSection === 'photos' ? 'Buscar en tus fotos…' : openArchive ? `Buscar en ${openArchive.name}…` : 'Buscar una colección…'}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-[var(--lt-card-strong)] border border-[var(--lt-border)] rounded-2xl pl-9 pr-4 py-2.5 text-[var(--lt-text)] text-sm placeholder:text-[var(--lt-text-muted)] focus:outline-none focus:border-[var(--lt-accent-border)] transition-colors"
                            />
                        </div>
                    )}

                    {activeSection === 'photos' && (
                        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-1.5 overflow-x-auto hide-scrollbar">
                            {PHOTO_FILTER_TABS.map(f => (
                                <button
                                    key={f.value}
                                    type="button"
                                    onClick={() => setPhotoFilter(f.value)}
                                    aria-pressed={photoFilter === f.value}
                                    className={`px-3.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition-colors ${photoFilter === f.value
                                        ? 'bg-[var(--lt-accent)] border-transparent lt-on-accent'
                                        : 'bg-[var(--lt-card-strong)] border-[var(--lt-border)] text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    )}
                </header>

                {activeSection === 'photos' && (
                    <Card className="overflow-hidden">
                        <div className="px-4 py-3 border-b border-[var(--lt-border)] flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="flex items-center gap-2 text-base font-display font-bold leading-tight text-[var(--lt-text)]">
                                    <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                                        <ImageIcon className="w-3.5 h-3.5" />
                                    </span>
                                    Fotos
                                </h2>
                                <p className="mt-0.5 text-xs text-[var(--lt-text-muted)]">Las que has subido a reseñas y sitios</p>
                            </div>
                            <span className="text-xs font-bold text-[var(--lt-accent)] bg-[var(--lt-accent-soft)] rounded-full px-2.5 py-1">
                                {uploadedPlacePhotos.length + uploadedReviewPhotos.length}
                            </span>
                        </div>
                        {loadingPlacePhotos || loadingReviewPhotos ? (
                            <div className="flex items-center justify-center gap-2 py-8 text-[var(--lt-text-muted)] text-sm">
                                <div className="animate-spin w-4 h-4 border-2 border-[var(--lt-accent-border)] border-t-transparent rounded-full" />
                                Cargando fotos...
                            </div>
                        ) : photosForGrid.length === 0 ? (
                            <div className="px-4 py-12 text-center">
                                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                                    <ImageIcon className="w-7 h-7" />
                                </div>
                                <p className="text-sm font-bold text-[var(--lt-text)]">No hay fotos que coincidan.</p>
                                <p className="mt-0.5 text-xs text-[var(--lt-text-muted)]">Sube alguna al valorar y aparecerá aquí.</p>
                            </div>
                        ) : (
                            <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                {photosForGrid.map(item => {
                                    const menuId = item.kind === 'place'
                                        ? `place:${item.photo.docPath}`
                                        : `review:${item.photo.docPath}:${item.photo.url}`;
                                    const title = item.kind === 'place' ? item.photo.placeName : item.photo.itemName;
                                    const subtitle = item.kind === 'place' ? item.photo.caption : item.photo.placeName;
                                    const route = item.kind === 'place'
                                        ? `/place/${item.photo.placeId}`
                                        : item.photo.placeId
                                            ? `/place/${item.photo.placeId}`
                                            : item.photo.listId
                                                ? `/list/${item.photo.listId}`
                                                : null;

                                    return (
                                        <div
                                            key={menuId}
                                            className="group relative rounded-2xl overflow-visible border border-[var(--lt-border)] hover:border-[var(--lt-border-strong)] transition-all bg-[var(--lt-card)] flex flex-col"
                                        >
                                            <Link to={route || ''} onClick={(event) => { if (!route) event.preventDefault(); }} className="lt-media-card aspect-square bg-[var(--lt-card-strong)] relative block rounded-t-2xl overflow-hidden">
                                                <UploadedPhotoImage photo={item.photo} kind={item.kind} alt={title} />
                                                <span className={`absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[9px] font-bold uppercase tracking-wide ${item.kind === 'place' ? 'text-emerald-300' : 'text-purple-300'}`}>
                                                    {item.kind === 'place' ? <MapPin className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                                                    {item.kind === 'place' ? 'Sitio' : 'Reseña'}
                                                </span>
                                            </Link>
                                            <div className="absolute top-1.5 right-1.5 z-20">
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        setOpenPhotoMenu(prev => prev === menuId ? null : menuId);
                                                    }}
                                                    className="p-1 rounded-md bg-black/65 text-gray-200 hover:text-white transition-colors"
                                                    title="Opciones"
                                                >
                                                    <MoreVertical className="w-3.5 h-3.5" />
                                                </button>
                                                {openPhotoMenu === menuId && (
                                                    <div className="absolute right-0 mt-1 w-32 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] shadow-2xl overflow-hidden">
                                                        <button
                                                            type="button"
                                                            onClick={() => item.kind === 'place'
                                                                ? openPlacePhotoEdit(item.photo)
                                                                : openReviewPhotoEdit(item.photo)}
                                                            className="w-full px-3 py-2 text-left text-xs font-bold text-[var(--lt-text)] hover:bg-[var(--lt-card)] flex items-center gap-2"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" /> Editar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => item.kind === 'place'
                                                                ? deleteUploadedPlacePhoto(item.photo)
                                                                : deleteUploadedReviewPhoto(item.photo)}
                                                            className="w-full px-3 py-2 text-left text-xs font-bold text-red-300 hover:bg-red-500/10 flex items-center gap-2"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" /> Eliminar
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <Link to={route || ''} onClick={(event) => { if (!route) event.preventDefault(); }} className="p-2 flex-1 min-w-0 hover:bg-[var(--lt-card-strong)] transition-colors rounded-b-2xl">
                                                <MarqueeText text={title} className="block text-[var(--lt-text)] text-xs font-semibold leading-tight" />
                                                {subtitle && <p className="text-[var(--lt-accent)] text-[10px] truncate mt-0.5">{subtitle}</p>}
                                            </Link>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                )}

                {/* Colecciones: portadas en rejilla; al tocar una, su contenido */}
                {activeSection === 'collections' && !openArchive && (archives.length === 0 ? (
                    <div className="text-center py-14 px-6 border-2 border-dashed border-[var(--lt-border)] rounded-3xl bg-[var(--lt-card)]">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--lt-accent-soft)] text-3xl">🔖</div>
                        <p className="text-base font-display font-bold text-[var(--lt-text)]">Aún no has guardado nada.</p>
                        <p className="mt-1 mb-5 text-xs text-[var(--lt-text-muted)]">Toca 🔖 en un sitio, un plato o una lista y aparecerá aquí.</p>
                        <button
                            onClick={openCreate}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full lt-on-accent font-bold text-sm shadow-lg shadow-[var(--lt-accent-shadow)] hover:opacity-90 transition-opacity"
                            style={{ background: 'var(--lt-accent-grad)' }}
                        >
                            <Plus className="w-4 h-4" /> Crear colección
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {visibleArchives.map(arch => {
                            const color = arch.color || '#6366f1';
                            const photos = covers[arch.id] || [];
                            return (
                                <button
                                    key={arch.id}
                                    type="button"
                                    onClick={() => openCollection(arch.id)}
                                    className="group text-left focus:outline-none"
                                >
                                    <div
                                        className="relative aspect-square overflow-hidden rounded-3xl border border-[var(--lt-border)] shadow-lg transition-transform group-hover:scale-[1.02] group-focus-visible:ring-2 group-focus-visible:ring-[var(--lt-accent)]"
                                        style={{ background: `linear-gradient(145deg, ${color}, ${color}33 70%)` }}
                                    >
                                        {photos.length > 0 && (
                                            <div className={`absolute inset-0 grid gap-0.5 ${photos.length > 1 ? 'grid-cols-2' : ''} ${photos.length > 2 ? 'grid-rows-2' : ''}`}>
                                                {photos.slice(0, 4).map((src, index) => (
                                                    <img
                                                        key={src}
                                                        src={src}
                                                        alt=""
                                                        loading="lazy"
                                                        className={`h-full w-full object-cover ${photos.length === 3 && index === 0 ? 'row-span-2' : ''}`}
                                                        onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                                        <span
                                            className={`absolute ${photos.length ? 'left-2.5 top-2.5 h-9 w-9 text-lg' : 'left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-4xl'} flex items-center justify-center rounded-2xl shadow-md`}
                                            style={{ backgroundColor: color }}
                                        >
                                            {arch.emoji || '📁'}
                                        </span>
                                        <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-md">
                                            {arch.itemCount || 0}
                                        </span>
                                    </div>
                                    <p className="mt-2 px-1 line-clamp-2 text-sm font-display font-bold leading-tight text-[var(--lt-text)]">{arch.name}</p>
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            onClick={openCreate}
                            className="text-left"
                        >
                            <div className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-3xl border-2 border-dashed border-[var(--lt-border)] text-[var(--lt-text-muted)] transition-colors hover:border-[var(--lt-accent-border)] hover:bg-[var(--lt-accent-soft)] hover:text-[var(--lt-accent)]">
                                <Plus className="h-7 w-7" />
                                <span className="text-xs font-bold">Nueva colección</span>
                            </div>
                        </button>
                    </div>
                ))}

                {/* Una colección abierta */}
                {activeSection === 'collections' && openArchive && (() => {
                    const items = archiveItems[openArchive.id] || [];
                    const filtered = getFilteredItems(items);
                    const kinds = Array.from(new Set(items.map(item => item.type)));
                    return (
                        <section>
                            <div className="mb-4 flex items-center gap-3">
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-md" style={{ backgroundColor: openArchive.color || '#6366f1' }}>
                                    {openArchive.emoji || '📁'}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <h2 className="line-clamp-2 text-lg font-display font-bold leading-tight text-[var(--lt-text)]">{openArchive.name}</h2>
                                    <p className="text-xs text-[var(--lt-text-muted)]">{openArchive.itemCount || 0} {(openArchive.itemCount || 0) === 1 ? 'guardado' : 'guardados'}</p>
                                </div>
                                <IconButton label={`Editar ${openArchive.name}`} icon={<Edit2 className="w-4 h-4" />} size="sm" variant="ghost" onClick={(event) => openEdit(event, openArchive)} />
                            </div>

                            {kinds.length > 1 && (
                                <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 hide-scrollbar">
                                    {COLLECTION_FILTER_TABS.filter(tab => tab.value === 'all' || kinds.includes(tab.value)).map(tab => (
                                        <button
                                            key={tab.value}
                                            type="button"
                                            onClick={() => setFilterType(tab.value)}
                                            aria-pressed={filterType === tab.value}
                                            className={`px-3.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition-colors ${filterType === tab.value
                                                ? 'bg-[var(--lt-accent)] border-transparent lt-on-accent'
                                                : 'bg-[var(--lt-card-strong)] border-[var(--lt-border)] text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {loadingItems[openArchive.id] && !items.length ? (
                                <div className="flex items-center justify-center gap-2 py-12 text-[var(--lt-text-muted)] text-sm">
                                    <div className="animate-spin w-4 h-4 border-2 border-[var(--lt-accent-border)] border-t-transparent rounded-full" />
                                    Cargando...
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center py-12 px-4">
                                    <div className="mx-auto mb-2 text-3xl">{items.length ? '🔍' : '🫙'}</div>
                                    <p className="text-sm font-bold text-[var(--lt-text)]">{items.length ? 'Nada coincide.' : 'Esta colección está vacía.'}</p>
                                    {!items.length && <p className="mt-0.5 text-xs text-[var(--lt-text-muted)]">Toca 🔖 en un sitio, un plato o una lista para guardarlo aquí.</p>}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {filtered.map(item => {
                                        const tc = TYPE_CONFIG[item.type] || TYPE_CONFIG['place'];
                                        const canOpen = Boolean(item.route && item.route !== '#');
                                        return (
                                            <div key={item.itemId} className="group relative">
                                                <button
                                                    type="button"
                                                    onClick={() => canOpen && navigate(item.route)}
                                                    className="lt-media-card relative block aspect-[4/5] w-full overflow-hidden rounded-2xl bg-[var(--lt-card-strong)] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lt-accent)]"
                                                >
                                                    <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
                                                        <ArchiveItemImage item={item} />
                                                    </div>
                                                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                                                    <span className={`absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[9px] font-bold uppercase tracking-wide ${tc.color}`}>
                                                        {tc.icon}{tc.label}
                                                    </span>
                                                    <div className="absolute inset-x-2.5 bottom-2.5 min-w-0">
                                                        <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow">{item.name}</h3>
                                                        {item.subtitle && <p className="mt-0.5 truncate text-[11px] font-medium text-gray-300">{item.subtitle}</p>}
                                                    </div>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setItemMenu({ item, archiveId: openArchive.id })}
                                                    aria-label={`Opciones de ${item.name}`}
                                                    className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1.5 text-gray-200 backdrop-blur-md hover:text-white"
                                                >
                                                    <MoreVertical className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    );
                })()}
            </div>

            {/* Modal crear/editar colección */}
            {showEditModal && (
                <Modal
                    isOpen={showEditModal}
                    onClose={() => setShowEditModal(false)}
                    title={editMode === 'create' ? 'Nueva colección' : 'Editar colección'}
                    className="sm:max-w-sm"
                >
                        <div className="hidden">
                            <h2 className="text-lg font-bold text-white">
                                {editMode === 'create' ? 'Nueva colección' : 'Editar colección'}
                            </h2>
                            <button onClick={() => setShowEditModal(false)} className="text-gray-500 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-5">
                            {/* Preview */}
                            <div className="flex items-center gap-3">
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 transition-all" style={{ backgroundColor: editColor }}>
                                    {editEmoji}
                                </div>
                                <input
                                    className="flex-1 bg-[var(--lt-card)] border border-white/10 rounded-xl px-4 py-3 text-[var(--lt-text)] focus:outline-none focus:border-[var(--lt-accent-border)] transition-colors text-sm"
                                    value={editName}
                                    placeholder="Nombre de la colección..."
                                    onChange={e => setEditName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && saveEdit()}
                                    autoFocus={editMode === 'create'}
                                />
                            </div>

                            {/* Emojis */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Icono</label>
                                <div className="grid grid-cols-9 gap-1">
                                    {EMOJI_OPTIONS.map(em => (
                                        <button
                                            key={em}
                                            onClick={() => setEditEmoji(em)}
                                            className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all ${editEmoji === em ? 'bg-[var(--lt-accent-soft)] ring-2 ring-[var(--lt-accent)] scale-110' : 'bg-white/5 hover:bg-white/10'}`}
                                        >
                                            {em}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Colores */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Color</label>
                                <div className="grid grid-cols-8 gap-1.5">
                                    {COLOR_OPTIONS.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setEditColor(color)}
                                            className={`w-8 h-8 rounded-lg transition-all ${editColor === color ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'}`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={saveEdit}
                                disabled={!editName.trim()}
                                className="w-full bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-all"
                            >
                                Guardar
                            </button>
                            {editMode === 'edit' && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const ok = await confirm({
                                            title: `¿Eliminar la colección "${editName}"?`,
                                            message: 'Se borra la colección y lo que tiene guardado. No se puede deshacer.',
                                            confirmLabel: 'Eliminar',
                                            destructive: true,
                                        });
                                        if (!ok) return;
                                        try {
                                            await deleteArchive(editId);
                                            setShowEditModal(false);
                                            if (openArchiveId === editId) closeCollection();
                                            showToast({ variant: 'success', message: 'Colección eliminada' });
                                        } catch {
                                            showToast({ variant: 'error', message: 'No se pudo eliminar la colección.' });
                                        }
                                    }}
                                    className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-[var(--lt-danger)] opacity-80 hover:opacity-100 hover:bg-[var(--lt-danger-soft)] transition-all"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Eliminar colección
                                </button>
                            )}
                        </div>
                </Modal>
            )}

            {/* Opciones de un guardado: moverlo o quitarlo */}
            {itemMenu && (
                <Modal isOpen onClose={() => setItemMenu(null)} title={itemMenu.item.name} className="sm:max-w-sm">
                    <div className="space-y-1">
                        {archives.length > 1 && (
                            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--lt-text-muted)]">Mover a</p>
                        )}
                        {archives.filter(a => a.id !== itemMenu.archiveId).map(a => (
                            <button
                                key={a.id}
                                type="button"
                                onClick={() => moveItem(itemMenu.item, itemMenu.archiveId, a.id)}
                                className="w-full flex items-center gap-3 rounded-xl p-2.5 hover:bg-[var(--lt-card)] transition-colors"
                            >
                                <span className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-base" style={{ backgroundColor: a.color || '#6366f1' }}>{a.emoji || '📁'}</span>
                                <span className="flex-1 min-w-0 truncate text-left text-sm font-medium text-[var(--lt-text)]">{a.name}</span>
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => removeItem(itemMenu.item, itemMenu.archiveId)}
                            className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-xl border border-[var(--lt-danger)]/30 py-2.5 text-sm font-bold text-[var(--lt-danger)] hover:bg-[var(--lt-danger-soft)] transition-colors"
                        >
                            <Trash2 className="w-4 h-4" /> Quitar de la colección
                        </button>
                    </div>
                </Modal>
            )}

            {editingPlacePhoto && (
                <Modal
                    isOpen={editingPlacePhoto !== null}
                    onClose={() => setEditingPlacePhoto(null)}
                    title="Editar foto"
                    className="sm:max-w-sm"
                >
                        <div className="hidden">
                            <h2 className="text-lg font-bold text-white">Editar foto</h2>
                            <button onClick={() => setEditingPlacePhoto(null)} className="text-gray-500 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="w-full aspect-video rounded-xl bg-gray-900 mb-4 overflow-hidden">
                            <UploadedPhotoImage photo={editingPlacePhoto} kind="place" alt={editingPlacePhoto.placeName} />
                        </div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Pie de foto</label>
                        <input
                            value={editingCaption}
                            maxLength={120}
                            onChange={event => setEditingCaption(event.target.value)}
                            className="w-full bg-[var(--lt-card)] border border-white/10 rounded-xl px-4 py-3 text-[var(--lt-text)] focus:outline-none focus:border-[var(--lt-accent-border)] transition-colors text-sm"
                            placeholder="Añade un pie de foto..."
                            autoFocus
                        />
                        <button
                            onClick={savePlacePhotoCaption}
                            className="mt-4 w-full bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white font-bold py-3 rounded-xl transition-all"
                        >
                            Guardar
                        </button>
                </Modal>
            )}

            {editingReviewPhoto && (
                <AddReviewForm
                    listId={editingReviewPhoto.listId || null}
                    editReviewId={editingReviewPhoto.reviewId}
                    lockList={false}
                    onClose={() => setEditingReviewPhoto(null)}
                    onSuccess={() => {
                        setEditingReviewPhoto(null);
                        setPhotoReloadKey(value => value + 1);
                    }}
                />
            )}
        </div>
    );
};

import React, { useState, useEffect, useMemo } from 'react';
import { useArchives, type SavedItemEntity } from '../hooks/useArchives';
import { Folder, MapPin, MessageSquare, List as ListIcon, Trash2, Map as MapIcon, X, Filter, Edit2, Search, Check, MoreVertical, Image as ImageIcon, ChevronRight, Plus } from 'lucide-react';
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
    const [expandedIds, setExpandedIds] = useState<string[]>([]);
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
        expandedIds.forEach(id => {
            if (!archiveItems[id] && !loadingItems[id]) fetchItemsForArchive(id);
        });
    }, [expandedIds]);

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

    const loadRawItems = async (archiveId: string): Promise<ArchiveSavedItem[]> => {
        if (!user) return [];
        const q = query(collection(db, 'users', user.uid, 'archives', archiveId, 'items'), orderBy('savedAt', 'desc'));
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

    // Carga el mapa: busca coords en el item, si no las tiene las busca en places/
    useEffect(() => {
        if (viewMode !== 'map') return;
        const load = async () => {
            setLoadingMap(true);
            const activeIds = mapSelectedArchives.length > 0 ? mapSelectedArchives : archives.map(a => a.id);
            if (mapSelectedArchives.length === 0) setMapSelectedArchives(archives.map(a => a.id));

            const result: MapItem[] = [];
            for (const archId of activeIds) {
                const arch = archives.find(a => a.id === archId);
                const raw = archiveItems[archId] ?? await loadRawItems(archId);

                for (const item of raw) {
                    if (item.type !== 'place' && item.type !== 'review') continue;
                    let lat = item.lat;
                    let lng = item.lng;

                    if ((!lat || !lng) && item.placeId) {
                        try {
                            const snap = await getDoc(doc(db, 'places', item.placeId));
                            if (snap.exists()) {
                                const coords = extractCoords(snap.data() as Record<string, any>);
                                if (coords) { lat = coords.lat; lng = coords.lng; }
                            }
                        } catch { /* sin coords, se ignora */ }
                    }

                    if (lat && lng) {
                        result.push({
                            id: item.itemId,
                            placeId: item.placeId,
                            lat, lng,
                            name: item.name,
                            photoUrl: item.photoUrl,
                            emoji: arch?.emoji || '📍',
                            color: arch?.color || '#6366f1',
                        });
                    }
                }
            }
            setMapItems(result);
            setLoadingMap(false);
        };
        load();
    }, [viewMode, mapSelectedArchives, archives]);

    const handleDragStart = (e: React.DragEvent, item: SavedItemEntity, sourceId: string) => {
        e.dataTransfer.setData('json/item', JSON.stringify(item));
        e.dataTransfer.setData('text/sourceArchiveId', sourceId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        const itemJson = e.dataTransfer.getData('json/item');
        const sourceId = e.dataTransfer.getData('text/sourceArchiveId');
        if (!itemJson || !sourceId || sourceId === targetId) return;
        const item = JSON.parse(itemJson) as SavedItemEntity;
        try {
            await toggleItemInArchive(targetId, { ...item, id: '', savedAt: null }, true);
            await toggleItemInArchive(sourceId, item, false);
            fetchItemsForArchive(targetId);
            fetchItemsForArchive(sourceId);
            if (!expandedIds.includes(targetId)) setExpandedIds(prev => [...prev, targetId]);
        } catch { showToast({ variant: 'error', message: 'No se pudo mover el elemento.' }); }
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
                {/* Header flotante */}
                <div className="absolute top-0 left-0 right-0 z-[1001] pt-safe-top">
                    <div className="flex items-center justify-between px-4 pb-3 pt-3 bg-gradient-to-b from-[var(--lt-bg)] to-transparent">
                        <IconButton
                            label="Cerrar mapa"
                            icon={<X className="w-5 h-5" />}
                            variant="secondary"
                            onClick={() => setViewMode('grid')}
                            className="rounded-full bg-black/60 text-white backdrop-blur-md"
                        />
                        <span className="rounded-full border border-white/10 bg-black/60 px-4 py-2 text-sm font-bold text-white backdrop-blur-md">
                            {mapItems.length} sitios
                        </span>
                        <Button
                            onClick={() => setShowMapFilters(v => !v)}
                            variant={showMapFilters ? 'primary' : 'secondary'}
                            size="sm"
                            leftIcon={<Filter className="w-4 h-4" />}
                            className={showMapFilters ? 'rounded-full backdrop-blur-md' : 'rounded-full bg-black/60 text-white backdrop-blur-md'}
                        >
                            Colecciones
                        </Button>
                    </div>
                </div>

                {/* Mapa sin botón de capas propio (ya está el del header) */}
                <div className="flex-1 w-full">
                    {loadingMap && (
                        <div className="absolute inset-0 z-10 bg-[var(--lt-bg)]/60 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--lt-accent-border)]" />
                        </div>
                    )}
                    <MapView items={mapItems} mode="global" showLayerControl={false} />
                </div>

                {/* Panel de filtro de colecciones */}
                {showMapFilters && (
                    <Card className="absolute left-4 right-4 z-[1001] flex max-h-[50vh] flex-col overflow-hidden shadow-2xl" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
                        <div className="px-4 py-3 border-b border-[var(--lt-border)] flex items-center justify-between">
                            <span className="text-[var(--lt-text)] font-bold text-sm">Filtrar colecciones</span>
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
                    <div className="flex justify-between items-end gap-3 mb-4">
                        <div className="min-w-0">
                            <h1 className="text-2xl md:text-3xl font-display font-black leading-tight text-[var(--lt-text)]">Guardados</h1>
                            <p className="mt-0.5 text-xs font-medium text-[var(--lt-text-muted)]">
                                {activeSection === 'photos'
                                    ? `${uploadedPlacePhotos.length + uploadedReviewPhotos.length} fotos subidas por ti`
                                    : archives.length > 0
                                        ? `${archives.length} ${archives.length === 1 ? 'colección' : 'colecciones'} · ${archives.reduce((sum, a) => sum + (a.itemCount || 0), 0)} guardados`
                                        : 'Tus sitios, platos y listas, a mano'}
                            </p>
                        </div>
                        {activeSection === 'collections' && (
                            <button
                                type="button"
                                onClick={() => setViewMode('map')}
                                className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--lt-accent)] hover:opacity-80 transition-opacity"
                            >
                                <MapIcon className="w-3.5 h-3.5" /> Mapa
                            </button>
                        )}
                    </div>

                    <Tabs
                        value={activeSection}
                        options={SECTION_TABS}
                        onChange={setActiveSection}
                        className="mb-4 bg-[var(--lt-card-strong)]"
                    />

                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-[var(--lt-text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                placeholder={activeSection === 'photos' ? 'Buscar en tus fotos...' : 'Buscar en tus colecciones...'}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-[var(--lt-card-strong)] border border-[var(--lt-border)] rounded-2xl pl-9 pr-4 py-2.5 text-[var(--lt-text)] text-sm placeholder:text-[var(--lt-text-muted)] focus:outline-none focus:border-[var(--lt-accent-border)] transition-colors"
                            />
                        </div>
                        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-1.5 overflow-x-auto hide-scrollbar shrink-0">
                            {(activeSection === 'photos' ? [
                                { id: 'all', label: 'Todas' },
                                { id: 'place', label: 'Sitios' },
                                { id: 'review', label: 'Reseñas' },
                            ] : [
                                { id: 'all', label: 'Todo' },
                                { id: 'place', label: 'Sitios' },
                                { id: 'list', label: 'Listas' },
                                { id: 'group', label: 'Platos' },
                                { id: 'review', label: 'Reseñas' },
                            ]).map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => activeSection === 'photos' ? setPhotoFilter(f.id as any) : setFilterType(f.id as any)}
                                    aria-pressed={(activeSection === 'photos' ? photoFilter : filterType) === f.id}
                                    className={`px-3.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition-colors ${(activeSection === 'photos' ? photoFilter : filterType) === f.id
                                        ? 'bg-[var(--lt-accent)] border-transparent lt-on-accent shadow-md shadow-[var(--lt-accent-shadow)]'
                                        : 'bg-[var(--lt-card-strong)] border-[var(--lt-border)] text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
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

                {/* Colecciones */}
                {activeSection === 'collections' && (archives.length === 0 ? (
                    <div className="text-center py-14 px-6 border-2 border-dashed border-[var(--lt-border)] rounded-3xl bg-[var(--lt-card)]">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--lt-accent-soft)] text-3xl">📁</div>
                        <p className="text-base font-display font-bold text-[var(--lt-text)]">No tienes colecciones aún.</p>
                        <p className="mt-1 mb-5 text-xs text-[var(--lt-text-muted)]">Guarda sitios, platos y listas para tenerlos a mano.</p>
                        <button
                            onClick={openCreate}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full lt-on-accent font-bold text-sm shadow-lg shadow-[var(--lt-accent-shadow)] hover:opacity-90 transition-opacity"
                            style={{ background: 'var(--lt-accent-grad)' }}
                        >
                            <Plus className="w-4 h-4" /> Crear colección
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Botón nueva colección */}
                        <button
                            onClick={openCreate}
                            className="w-full py-3 border-2 border-dashed border-[var(--lt-border)] rounded-2xl text-[var(--lt-text-muted)] hover:text-[var(--lt-accent)] hover:bg-[var(--lt-accent-soft)] hover:border-[var(--lt-accent-border)] transition-all font-bold flex justify-center items-center gap-1.5 text-sm"
                        >
                            <Plus className="w-4 h-4" /> Nueva colección
                        </button>

                        {archives.map(arch => {
                            const isExpanded = expandedIds.includes(arch.id);
                            const items = archiveItems[arch.id] || [];
                            const filtered = getFilteredItems(items);

                            return (
                                <div
                                    key={arch.id}
                                    className={`relative overflow-hidden bg-[var(--lt-card-strong)] rounded-3xl border transition-all ${isExpanded ? 'border-[var(--lt-border-strong)] shadow-lg' : 'border-[var(--lt-border)] hover:border-[var(--lt-border-strong)]'}`}
                                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                    onDrop={e => handleDrop(e, arch.id)}
                                >
                                    {/* Cabecera de colección */}
                                    <div
                                        onClick={() => setExpandedIds(prev =>
                                            prev.includes(arch.id) ? prev.filter(i => i !== arch.id) : [...prev, arch.id]
                                        )}
                                        aria-expanded={isExpanded}
                                        className="relative p-3.5 cursor-pointer flex items-center gap-3"
                                    >
                                        {/* Tinte suave con el color de la colección */}
                                        <div
                                            aria-hidden
                                            className="pointer-events-none absolute inset-0 opacity-[0.14]"
                                            style={{ background: `linear-gradient(90deg, ${arch.color || '#6366f1'}, transparent 70%)` }}
                                        />
                                        <div
                                            className="relative w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-md"
                                            style={{ backgroundColor: arch.color || '#6366f1' }}
                                        >
                                            {arch.emoji || '📁'}
                                        </div>
                                        <div className="relative flex-1 min-w-0">
                                            <MarqueeText as="h3" text={arch.name} className="block text-[var(--lt-text)] font-display font-bold text-base leading-tight" />
                                            <span className="mt-1 inline-flex items-center rounded-full bg-[var(--lt-card)] border border-[var(--lt-border)] px-2 py-0.5 text-[11px] font-bold text-[var(--lt-text-muted)]">
                                                {arch.itemCount || 0} {(arch.itemCount || 0) === 1 ? 'elemento' : 'elementos'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={e => openEdit(e, arch)}
                                            aria-label={`Editar ${arch.name}`}
                                            className="relative p-2 text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] hover:bg-[var(--lt-card)] rounded-full transition-all"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <ChevronRight className={`relative w-5 h-5 shrink-0 text-[var(--lt-text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    </div>

                                    {/* Contenido expandido */}
                                    {isExpanded && (
                                        <div className="border-t border-[var(--lt-border)] bg-[var(--lt-bg-deep)]/40 p-3 sm:p-4">
                                            {loadingItems[arch.id] ? (
                                                <div className="flex items-center justify-center gap-2 py-8 text-[var(--lt-text-muted)] text-sm">
                                                    <div className="animate-spin w-4 h-4 border-2 border-[var(--lt-accent-border)] border-t-transparent rounded-full" />
                                                    Cargando...
                                                </div>
                                            ) : filtered.length === 0 ? (
                                                <div className="text-center py-8 px-4">
                                                    <div className="mx-auto mb-2 text-2xl">{items.length ? '🔍' : '🫙'}</div>
                                                    <p className="text-sm font-bold text-[var(--lt-text)]">{items.length ? 'Nada coincide con el filtro.' : 'Esta colección está vacía.'}</p>
                                                    {!items.length && <p className="mt-0.5 text-xs text-[var(--lt-text-muted)]">Arrastra elementos aquí o guárdalos desde la app.</p>}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                                    {filtered.map(item => {
                                                        const tc = TYPE_CONFIG[item.type] || TYPE_CONFIG['place'];
                                                        return (
                                                            <div
                                                                key={item.itemId}
                                                                draggable
                                                                onDragStart={e => handleDragStart(e, item, arch.id)}
                                                                onClick={() => item.route && item.route !== '#' && navigate(item.route)}
                                                                onKeyDown={(event) => {
                                                                    if ((event.key === 'Enter' || event.key === ' ') && item.route && item.route !== '#') {
                                                                        event.preventDefault();
                                                                        navigate(item.route);
                                                                    }
                                                                }}
                                                                role="link"
                                                                tabIndex={0}
                                                                className="lt-media-card group relative rounded-2xl overflow-hidden border border-[var(--lt-border)] hover:border-[var(--lt-border-strong)] transition-all cursor-pointer bg-[var(--lt-card-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lt-accent)]"
                                                            >
                                                                {/* Imagen con el nombre encima */}
                                                                <div className="aspect-[4/5] relative">
                                                                    <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
                                                                        <ArchiveItemImage item={item} />
                                                                    </div>
                                                                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                                                                    {/* Badge de tipo */}
                                                                    <span className={`absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[9px] font-bold uppercase tracking-wide ${tc.color}`}>
                                                                        {tc.icon}{tc.label}
                                                                    </span>
                                                                    {/* Botón eliminar */}
                                                                    <button
                                                                        onClick={async e => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            if (await confirm({ title: '¿Quitar de la colección?', message: `"${item.name}" dejará de estar en ${arch.name}.`, confirmLabel: 'Quitar', destructive: true })) {
                                                                                try {
                                                                                    await toggleItemInArchive(arch.id, item, false);
                                                                                    fetchItemsForArchive(arch.id);
                                                                                } catch {
                                                                                    showToast({ variant: 'error', message: 'No se pudo quitar el elemento.' });
                                                                                }
                                                                            }
                                                                        }}
                                                                        aria-label="Quitar de la colección"
                                                                        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/60 backdrop-blur-md text-gray-200 hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                                                                    >
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>

                                                                    {/* Nombre */}
                                                                    <div className="absolute inset-x-2 bottom-2 min-w-0 text-left">
                                                                        <MarqueeText as="h3" text={item.name} className="block text-white text-xs font-bold leading-tight drop-shadow" />
                                                                        {item.subtitle && <MarqueeText text={item.subtitle} className="block text-gray-300 text-[10px] font-medium mt-0.5" />}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            <div className="mt-4 pt-3 border-t border-[var(--lt-border)] flex justify-end">
                                                <button
                                                    onClick={async () => {
                                                        const ok = await confirm({
                                                            title: `¿Eliminar la colección "${arch.name}"?`,
                                                            message: 'Se borra la colección y lo que tiene guardado. No se puede deshacer.',
                                                            confirmLabel: 'Eliminar',
                                                            destructive: true,
                                                        });
                                                        if (!ok) return;
                                                        try {
                                                            await deleteArchive(arch.id);
                                                            showToast({ variant: 'success', message: 'Colección eliminada' });
                                                        } catch {
                                                            showToast({ variant: 'error', message: 'No se pudo eliminar la colección.' });
                                                        }
                                                    }}
                                                    className="text-xs font-bold text-[var(--lt-danger)] opacity-70 hover:opacity-100 flex items-center gap-1 rounded-full px-2.5 py-1 hover:bg-[var(--lt-danger-soft)] transition-all"
                                                >
                                                    <Trash2 className="w-3 h-3" /> Eliminar colección
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
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
                                    autoFocus
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

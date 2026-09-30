import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc, setDoc, query, where, getDocs, deleteDoc, Timestamp } from 'firebase/firestore';
import { db, storage, functions } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject, getBlob } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Loader2, X, MapPin as MapPinIcon, CheckCircle2, Lock, Trash2, Star } from 'lucide-react';
import { PhotoEditorModal, type ProcessedPhoto } from './PhotoEditorModal';
import { PlaceSearch } from './PlaceSearch';
import { PlaceService, type PlaceResult } from '../services/PlaceService';
import { ListSearch } from './ListSearch';
import { useQueryClient } from '@tanstack/react-query';
import { isGooglePlacePhotoUrl } from '../utils/placeImages';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { IMMUTABLE_UPLOAD_CACHE_CONTROL } from '../lib/storageCache';
import { computeReviewScore, isComputingCriterion } from '../lib/scoring';
import { formatScore, SCORE_BADGE, SCORE_BAND_EMOJI, SCORE_BAND_LABEL, scoreBand, scoreTextColor } from '../lib/scoreScale';
import { CriterionRating } from './CriterionRating';
import { orderedCriteriaEntries } from '../lib/criteria';

interface AddReviewFormProps {
    listId: string | null;
    onListChange?: (id: string) => void;
    prefillPlaceId?: string;
    prefillItemName?: string;
    editReviewId?: string;
    lockList?: boolean;
    onClose: () => void;
    onSuccess: () => void;
    suggestedListIds?: string[]; // IDs of lists where this place is already present
}

const REVIEW_CREATE_TOASTS = [
    'Tu veredicto ya está en la mesa.',
    'Valoración publicada: criterio fino y sin titubeos.',
    'Nuevo punto en el mapa del buen gusto.',
    'Anotado. El ranking acaba de ponerse interesante.',
] as const;

const REVIEW_EDIT_TOASTS = [
    'Cambios guardados. Ajuste de precisión aplicado.',
    'Revisión lista: tu ranking respira más orden.',
    'Actualización hecha. El criterio subió un nivel.',
    'Editado con éxito: caos bajo control.',
] as const;

const pickRandom = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

interface ReviewCriterion {
    id: string;
    label?: string;
    min?: number;
    max?: number;
    step?: number;
    ponderable?: boolean;
    isPonderable?: boolean;
    labelMin?: string;
    labelMax?: string;
    type?: string;
}

interface ListMetadata {
    name?: string;
    parentListId?: string | null;
    visibility?: string;
    criteriaDefinition?: ReviewCriterion[] | Record<string, ReviewCriterion>;
    availableTags?: string[];
}

interface ReviewFormData {
    itemName?: string;
    comment?: string;
    overallRating?: number;
    scores?: Record<string, number>;
    tags?: string[];
    userTags?: string[];
    photoUrl?: string;
    photoUrls?: string[];
    photoStoragePaths?: string[];
    listId?: string;
    parentListId?: string;
    placeId?: string;
    placeName?: string;
    placeAddress?: string;
    placeLat?: number;
    placeLng?: number;
}

interface UserProfileData {
    username?: string;
    displayName?: string;
    photoUrl?: string;
    userType?: string | string[];
}

interface ReviewCacheItem extends Record<string, unknown> {
    id: string;
}

interface ListDetailsCache extends Record<string, unknown> {
    reviews?: ReviewCacheItem[];
}

interface ReviewsPageCache extends Record<string, unknown> {
    reviews: ReviewCacheItem[];
}

interface InfiniteReviewsCache extends Record<string, unknown> {
    pages?: ReviewsPageCache[];
}

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }
    return fallback;
};

const isFetchableImageUrl = (url: string): boolean => {
    if (url.startsWith(window.location.origin)) return true;
    return url.includes('firebasestorage.googleapis.com') || url.includes('storage.googleapis.com');
};

interface ImportedReviewPhotoResult {
    url: string;
    storagePath: string;
    contentType?: string;
    size?: number;
}

const importExternalReviewPhoto = async (url: string): Promise<ImportedReviewPhotoResult> => {
    const callable = httpsCallable<{ url: string }, ImportedReviewPhotoResult>(functions, 'importExternalReviewPhoto');
    const result = await callable({ url });
    if (!result.data?.url || !result.data?.storagePath) {
        throw new Error('No se pudo importar la foto externa.');
    }
    return result.data;
};

const fileFromExistingPhoto = async (url: string, index: number, storagePath?: string): Promise<File> => {
    let blob: Blob;

    if (storagePath) {
        blob = await getBlob(ref(storage, storagePath));
    } else {
        if (!isFetchableImageUrl(url)) {
            throw new Error('external-image-not-editable');
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`No se pudo cargar la foto ${index + 1}`);
        blob = await response.blob();
    }

    const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
    const extension = type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    return new File([blob], `review-photo-${index + 1}.${extension}`, { type });
};

export const AddReviewForm: React.FC<AddReviewFormProps> = ({ listId, onListChange, prefillPlaceId, prefillItemName, editReviewId, lockList = false, onClose, onSuccess, suggestedListIds }) => {
    useBodyScrollLock(true);
    const { user } = useAuth();
    const { showToast } = useToast();
    const queryClient = useQueryClient();

    // Core Data
    // Core Data
    const [itemName, setItemName] = useState(prefillItemName || '');
    const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
    const itemNameRef = useRef(itemName);
    const prefillItemNameRef = useRef(prefillItemName);

    const [comment, setComment] = useState('');
    // Nota guardada al editar (solo se usa si la valoración antigua no tiene puntuaciones).
    const [storedOverallRating, setStoredOverallRating] = useState<number | null>(null);

    // Changed: Store full definition list to preserve ORDER
    const [criteriaList, setCriteriaList] = useState<ReviewCriterion[]>([]);
    const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>({});

    // Extras
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [processedPhotos, setProcessedPhotos] = useState<ProcessedPhoto[]>([]);
    const [existingPhotoUrls, setExistingPhotoUrls] = useState<string[]>([]);
    const [existingPhotoStoragePaths, setExistingPhotoStoragePaths] = useState<string[]>([]);
    const [isPhotoEditorOpen, setIsPhotoEditorOpen] = useState(false);
    const [selectedFilesForEditor, setSelectedFilesForEditor] = useState<File[]>([]);
    const [loadingExistingPhotosForEditor, setLoadingExistingPhotosForEditor] = useState(false);
    const [customTags, setCustomTags] = useState<string[]>([]);
    const [listAvailableTags, setListAvailableTags] = useState<string[]>([]);

    const [initLoading, setInitLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [listData, setListData] = useState<ListMetadata | null>(null); // Store full list data for lineage
    const [reviewPath, setReviewPath] = useState<string | null>(null);

    const [internalListId, setInternalListId] = useState<string | null>(listId);

    // UX States
    const [originalData, setOriginalData] = useState<string>(''); // JSON string for deep comparison

    const scrollRef = useRef<HTMLDivElement>(null);
    const handlePointerDown = (e: React.PointerEvent) => {
        // If the user taps on something that is NOT a text input/textarea, blur the active element.
        // This dismisses the mobile keyboard immediately and prevents browser scroll jumps.
        if (e.target instanceof HTMLElement) {
            const tag = e.target.tagName;
            const type = (e.target as HTMLInputElement).type;
            const isTextInput = tag === 'TEXTAREA' || (tag === 'INPUT' && (type === 'text' || type === 'url' || type === 'search'));
            if (!isTextInput && document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
        }
    };

    // Update internalListId if prop changes
    useEffect(() => {
        if (listId) setInternalListId(listId);
    }, [listId]);

    const isNew = !editReviewId;

    useEffect(() => {
        itemNameRef.current = itemName;
        prefillItemNameRef.current = prefillItemName;
    }, [itemName, prefillItemName]);

    // Draft Logic: Restore
    useEffect(() => {
        if (isNew) {
            const draftStr = localStorage.getItem(`listopic_review_draft_${internalListId || 'global'}`);
            if (draftStr) {
                try {
                    const draft = JSON.parse(draftStr);
                    if (draft.itemName && !prefillItemName) setItemName(draft.itemName);
                    if (draft.comment) setComment(draft.comment);
                    // Los borradores antiguos (sin v: 2) traían un 5 en todos los
                    // criterios aunque no se hubieran tocado: esas notas no se recuperan.
                    if (draft.v === 2 && draft.criteriaScores && typeof draft.criteriaScores === 'object') {
                        setCriteriaScores(draft.criteriaScores);
                    }
                } catch {
                    // Ignore malformed local drafts.
                }
            }
        }
    }, [isNew, internalListId, prefillItemName]);

    // Draft Logic: Save
    useEffect(() => {
        if (!isNew || (Object.keys(criteriaScores).length === 0 && !itemName && !comment)) return;
        const timeout = setTimeout(() => {
            const draft = { v: 2, itemName, comment, criteriaScores };
            localStorage.setItem(`listopic_review_draft_${internalListId || 'global'}`, JSON.stringify(draft));
        }, 500);
        return () => clearTimeout(timeout);
    }, [itemName, comment, criteriaScores, isNew, internalListId]);

    // Nota en vivo: media de los criterios que cuentan (lib/scoring).
    const scoreSummary = useMemo(() => computeReviewScore(criteriaScores, criteriaList), [criteriaScores, criteriaList]);
    const overallRating = scoreSummary.score ?? storedOverallRating;
    const criteriaLoaded = criteriaList.length > 0;
    const hasComputingCriteria = scoreSummary.requiredCount > 0;

    const isValid = useMemo(() => {
        // 1. Place is required
        if (!selectedPlace) return false;

        // 2. Name is required
        if (!itemName.trim()) return false;

        // 3. List is required (use internal state)
        if (!internalListId) return false;

        // 4. Todos los criterios que cuentan para la nota, puntuados a propósito
        if (!criteriaLoaded || !scoreSummary.complete || overallRating === null) return false;

        return true;
    }, [selectedPlace, itemName, internalListId, criteriaLoaded, scoreSummary.complete, overallRating]);

    const isDirty = useMemo(() => {
        if (isNew) return true; // Always dirty if new (until saved)
        const currentData = JSON.stringify({
            itemName,
            comment,
            criteriaScores,
            customTags,
            existingPhotoUrls,
            processedPhotoCount: processedPhotos.length,
            listId: internalListId // Include listId in comparison structure
        });

        return currentData !== originalData;
    }, [isNew, itemName, comment, criteriaScores, customTags, existingPhotoUrls, processedPhotos.length, originalData, internalListId]);

    // Fetch Review Data for Editing
    useEffect(() => {
        const fetchReviewData = async () => {
            if (!editReviewId) return;

            const hydrateReviewState = async (data: ReviewFormData, resolvedListId?: string, resolvedPath?: string) => {
                setItemName(data.itemName || '');
                setComment(data.comment || '');
                setStoredOverallRating(typeof data.overallRating === 'number' ? data.overallRating : null);
                if (data.scores) setCriteriaScores(data.scores);
                const reviewTags = data.tags ?? data.userTags ?? [];
                setCustomTags(reviewTags);
                const photoUrls = Array.isArray(data.photoUrls) ? data.photoUrls : [];
                const photoStoragePaths = Array.isArray(data.photoStoragePaths)
                    ? data.photoStoragePaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
                    : [];
                if (photoUrls.length > 0) {
                    setExistingPhotoUrls(photoUrls);
                    setExistingPhotoStoragePaths(photoStoragePaths);
                    setImagePreview(photoUrls[0]);
                } else if (data.photoUrl) {
                    setImagePreview(data.photoUrl);
                    setExistingPhotoUrls(data.photoUrl ? [data.photoUrl] : []);
                    setExistingPhotoStoragePaths(photoStoragePaths);
                }

                const effectiveListId = resolvedListId || data.listId || data.parentListId || listId || null;
                if (effectiveListId) {
                    setInternalListId(effectiveListId);
                }
                if (resolvedPath) {
                    setReviewPath(resolvedPath);
                }

                setOriginalData(JSON.stringify({
                    itemName: data.itemName || '',
                    comment: data.comment || '',
                    criteriaScores: data.scores || {},
                    customTags: data.tags || data.userTags || [],
                    existingPhotoUrls: photoUrls.length > 0 ? photoUrls : (data.photoUrl ? [data.photoUrl] : []),
                    processedPhotoCount: 0,
                    listId: effectiveListId
                }));

                if (!data.placeId) return;

                setSelectedPlace({
                    id: data.placeId,
                    name: data.placeName || data.itemName || 'Lugar',
                    address: data.placeAddress || '',
                    lat: data.placeLat || 0,
                    lng: data.placeLng || 0
                });
            };

            try {
                const candidateListIds = Array.from(new Set(
                    [listId, internalListId].filter((value): value is string => !!value)
                ));

                for (const candidateListId of candidateListIds) {
                    const subRef = doc(db, 'lists', candidateListId, 'reviews', editReviewId);
                    const subSnap = await getDoc(subRef);
                    if (!subSnap.exists()) continue;

                    await hydrateReviewState(
                        subSnap.data() as ReviewFormData,
                        candidateListId,
                        `lists/${candidateListId}/reviews/${editReviewId}`
                    );
                    return;
                }

                const rootRef = doc(db, 'reviews', editReviewId);
                const rootSnap = await getDoc(rootRef);
                if (!rootSnap.exists()) return;

                const rootData = rootSnap.data() as ReviewFormData;
                const rootListCandidates = Array.from(new Set(
                    [rootData.listId, rootData.parentListId, listId, internalListId]
                        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                ));

                for (const candidateListId of rootListCandidates) {
                    const subRef = doc(db, 'lists', candidateListId, 'reviews', editReviewId);
                    const subSnap = await getDoc(subRef);
                    if (!subSnap.exists()) continue;

                    await hydrateReviewState(
                        subSnap.data() as ReviewFormData,
                        candidateListId,
                        `lists/${candidateListId}/reviews/${editReviewId}`
                    );
                    return;
                }

                await hydrateReviewState(
                    rootData,
                    rootData.listId || rootData.parentListId,
                    `reviews/${editReviewId}`
                );
            } catch (e) {
                console.error("Error fetching review for edit:", e);
                setError("Error cargando la valoración para editar");
            }
        };

        if (editReviewId) {
            fetchReviewData();
        }
    }, [editReviewId, listId, internalListId]);

    // Hydrate Place from PREFILL (Group Page Context)
    useEffect(() => {
        const hydratePrefillPlace = async () => {
            if (prefillPlaceId && !editReviewId && !selectedPlace) {
                try {
                    const placeRef = doc(db, 'places', prefillPlaceId);
                    const snap = await getDoc(placeRef);

                    if (snap.exists()) {
                        const data = snap.data();
                        setSelectedPlace({
                            id: data.id || data.googlePlaceId || prefillPlaceId,
                            name: data.name,
                            address: data.address,
                            lat: data.location?.latitude || data.lat || 0,
                            lng: data.location?.longitude || data.lng || 0,
                            types: data.types || []
                        });
                    } else {
                        setSelectedPlace({
                            id: prefillPlaceId,
                            name: 'Lugar Seleccionado',
                            address: '',
                            lat: 0,
                            lng: 0
                        });
                    }
                } catch (e) {
                    console.warn("Error hydrating prefill place", e);
                }
            }
        };
        hydratePrefillPlace();
    }, [prefillPlaceId, editReviewId, selectedPlace]);


    // Fetch List Metadata
    useEffect(() => {
        const fetchListMetadata = async () => {
            // If editing, we rely on internalListId rather than prop listId primarily
            const targetListId = internalListId || listId;

            if (!targetListId) {
                setListData(null);
                setInitLoading(false);
                return;
            }
            try {
                const docRef = doc(db, 'lists', targetListId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data() as ListMetadata;
                    setListData(data);

                    if (data.name && !itemNameRef.current && !prefillItemNameRef.current && !editReviewId) {
                        setItemName(data.name);
                    }

                    const criteriaDefinition = data.criteriaDefinition;
                    if (criteriaDefinition) {
                        let cList: ReviewCriterion[] = [];

                        // Logic: Convert whatever is in DB to an ordered Array
                        if (Array.isArray(criteriaDefinition)) {
                            cList = criteriaDefinition.map((c) => ({
                                ...c,
                                min: 0,
                                max: 10,
                                step: c.step || 0.1,
                                ponderable: c.isPonderable !== false // normalize to boolean (default true)
                            }));
                        } else {
                            // Mapa id → definición: orden por `order` y, si no hay, por nombre.
                            cList = orderedCriteriaEntries(criteriaDefinition).map(([k, def]) => {
                                return {
                                    ...def,
                                    id: k,
                                    label: def.label || k,
                                    min: def.min ?? 0,
                                    max: def.max ?? 10,
                                    step: def.step ?? 0.1,
                                    ponderable: def.ponderable !== false,
                                };
                            });
                        }

                        // Valoración nueva: ningún criterio viene puntuado. Solo se
                        // conservan notas de esta lista (p. ej. de un borrador).
                        if (!editReviewId) {
                            const ids = new Set(cList.map(c => c.id));
                            setCriteriaScores(prev => Object.fromEntries(
                                Object.entries(prev).filter(([key, value]) => ids.has(key) && typeof value === 'number')
                            ));
                        }
                        setCriteriaList(cList);
                    }

                    if (data.availableTags && Array.isArray(data.availableTags)) {
                        setListAvailableTags(Array.from(new Set(
                            data.availableTags
                                .filter((tag): tag is string => typeof tag === 'string')
                                .map((tag) => tag.trim())
                                .filter(Boolean)
                        )));
                    }
                }
            } catch (e) {
                console.error("Error fetching list definition", e);
            } finally {
                setInitLoading(false);
            }
        };
        fetchListMetadata();
    }, [internalListId, listId, editReviewId]); // Re-run if list changes

    // Handlers
    const toggleTag = (tag: string) => {
        if (customTags.includes(tag)) {
            setCustomTags(customTags.filter(t => t !== tag));
        } else {
            setCustomTags([...customTags, tag]);
        }
    };

    const openExistingPhotosInEditor = async () => {
        if (existingPhotoUrls.length === 0) return;
        setLoadingExistingPhotosForEditor(true);
        setError(null);
        try {
            const files: File[] = [];
            const temporaryImportsToDelete: string[] = [];

            for (let i = 0; i < existingPhotoUrls.slice(0, 3).length; i++) {
                let url = existingPhotoUrls[i];
                let storagePath = existingPhotoStoragePaths[i];

                if (!storagePath && !isFetchableImageUrl(url)) {
                    const imported = await importExternalReviewPhoto(url);
                    url = imported.url;
                    storagePath = imported.storagePath;
                    temporaryImportsToDelete.push(imported.storagePath);
                }

                files.push(await fileFromExistingPhoto(url, i, storagePath));
            }

            setSelectedFilesForEditor(files);
            setIsPhotoEditorOpen(true);
            if (temporaryImportsToDelete.length > 0) {
                showToast({
                    variant: 'success',
                    title: 'Fotos preparadas',
                    message: 'Las fotos externas se han copiado temporalmente para poder editarlas.',
                });
                void Promise.allSettled(temporaryImportsToDelete.map(path => deleteObject(ref(storage, path))));
            }
        } catch (err) {
            console.error('Could not open existing review photos in editor', err);
            setError(getErrorMessage(err, 'No se pudieron cargar las fotos actuales para editarlas.'));
        } finally {
            setLoadingExistingPhotosForEditor(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent | null, directPhotos?: ProcessedPhoto[]) => {
        e?.preventDefault();
        const photosToUpload = directPhotos ?? processedPhotos;
        if (!user || !listId) {
            // START AUTOMATION LOGIC: If no list selected, or even if selected, check for automation
            // If listId IS present, we respect it. But we must also check if we are fulfilling a "Quiero ir" item.
        }
        if (!user) return; // Safety

        if (!itemName.trim()) {
            setError("El nombre del item es obligatorio");
            return;
        }

        if (itemName.trim().length > 150) {
            setError("El nombre del item no puede superar los 150 caracteres");
            return;
        }

        if (comment.length > 2000) {
            setError("La opinión no puede superar los 2000 caracteres");
            return;
        }

        if (!scoreSummary.complete || overallRating === null) {
            setError(`Puntúa todos los criterios que cuentan para la nota (${scoreSummary.scoredCount} de ${scoreSummary.requiredCount}).`);
            return;
        }

        if (!selectedPlace && !prefillPlaceId && !editReviewId) {
            setError("Elige un sitio (restaurante, playa…)");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // --- AUTOMATION: "Quiero ir" -> "Ya fui" (ARCHIVES) ---
            // Requirement: "si hacemos una reseña de ... elemento en Quiero ir, se pase automáticamente a ya fui" (in Archives)

            // 1. Ensure "Ya fui" archive exists
            let yaFuiArchiveId: string | null = null;
            let quieroIrArchiveId: string | null = null;

            try {
                // Determine user archive IDs
                const qArchives = query(collection(db, 'users', user.uid, 'archives'));
                const snapArchives = await getDocs(qArchives);

                snapArchives.forEach(doc => {
                    const data = doc.data();
                    if (data.name === 'Ya fui') yaFuiArchiveId = doc.id;
                    if (data.name === 'Quiero ir') quieroIrArchiveId = doc.id;
                });

                // Auto-create "Ya fui" if missing
                if (!yaFuiArchiveId) {
                    const newRef = await addDoc(collection(db, 'users', user.uid, 'archives'), {
                        name: 'Ya fui',
                        createdAt: serverTimestamp(),
                        itemCount: 0
                    });
                    yaFuiArchiveId = newRef.id;
                }
                // Auto-create "Quiero ir" if missing (for consistency)
                if (!quieroIrArchiveId) {
                    const newRef = await addDoc(collection(db, 'users', user.uid, 'archives'), {
                        name: 'Quiero ir',
                        createdAt: serverTimestamp(),
                        itemCount: 0
                    });
                    quieroIrArchiveId = newRef.id;
                }

                // 2. Check if the current place is in "Quiero ir"
                // Place ID is critical here.
                let finalPlaceId = selectedPlace?.id || prefillPlaceId || 'unknown';
                if (selectedPlace) finalPlaceId = selectedPlace.id; // Correct preference

                if (quieroIrArchiveId && finalPlaceId !== 'unknown') {
                    // Los sitios guardados desde su ficha usan el placeId como id del
                    // documento (y los antiguos no tienen campo placeId); los platos
                    // guardados sí llevan placeId.
                    const quieroIrItems = collection(db, 'users', user.uid, 'archives', quieroIrArchiveId, 'items');
                    const directItem = await getDoc(doc(quieroIrItems, finalPlaceId));
                    const matchRef = directItem.exists()
                        ? directItem.ref
                        : (await getDocs(query(quieroIrItems, where('placeId', '==', finalPlaceId)))).docs[0]?.ref;

                    if (matchRef) {
                        // Move logic:
                        // A. Delete from Quiero ir
                        await deleteDoc(matchRef);
                        await updateDoc(doc(db, 'users', user.uid, 'archives', quieroIrArchiveId!), { itemCount: increment(-1) });

                        // B. Add to Ya fui (As a Place Item)
                        const placeName = selectedPlace?.name || prefillItemName || 'Lugar';
                        const subtitle = selectedPlace?.address || '';
                        // Nunca guardar una imagen en base64 dentro del documento.
                        const photo = imagePreview && /^https?:/.test(imagePreview) ? imagePreview : '';

                        // We use the Place ID as the doc ID in the new archive for uniqueness
                        await setDoc(doc(db, 'users', user.uid, 'archives', yaFuiArchiveId!, 'items', finalPlaceId), {
                            itemId: finalPlaceId,
                            placeId: finalPlaceId,
                            type: 'place',
                            name: placeName,
                            subtitle: subtitle,
                            photoUrl: photo,
                            savedAt: serverTimestamp(),
                            route: `/place/${finalPlaceId}`
                        });
                        await updateDoc(doc(db, 'users', user.uid, 'archives', yaFuiArchiveId!), { itemCount: increment(1) });
                    }
                }

            } catch (autoErr) {
                console.error("Archive automation error:", autoErr);
                // Non-blocking
            }

            // --- END AUTOMATION ---

            const placeName = selectedPlace?.name || 'Lugar Desconocido';

            // New logic: Only use the selected/synced place for ID and address.
            // DO NOT create a new place document here. PlaceService handles that.
            let finalPlaceId = selectedPlace?.id || prefillPlaceId || 'unknown';
            let finalPlaceAddress = selectedPlace?.address || '';
            let finalPlaceLat = selectedPlace?.lat || 0;
            let finalPlaceLng = selectedPlace?.lng || 0;
            let finalPhotoUrl = ''; // Declared here
            let finalPhotoUrls: string[] = [];
            const finalPhotoStoragePaths: string[] = [];
            let replacedPhotoStoragePaths: string[] = [];

            if (selectedPlace) {
                // Transform Place Data
                finalPlaceId = selectedPlace.id;
                finalPlaceAddress = selectedPlace.address || '';
                finalPlaceLat = selectedPlace.lat || 0;
                finalPlaceLng = selectedPlace.lng || 0;

                // Handle Image Upload (multi-photo or legacy single)
                if (photosToUpload.length > 0) {
                    try {
                        for (let pi = 0; pi < photosToUpload.length; pi++) {
                            const fileName = `${user.uid}_${Date.now()}_${pi}.jpg`;
                            const storagePath = `reviews/${user.uid}/${fileName}`;
                            const storageRef = ref(storage, storagePath);
                            const snapshot = await uploadBytes(storageRef, photosToUpload[pi].blob, { contentType: 'image/jpeg', cacheControl: IMMUTABLE_UPLOAD_CACHE_CONTROL });
                            finalPhotoUrls.push(await getDownloadURL(snapshot.ref));
                            finalPhotoStoragePaths.push(storagePath);
                        }
                    } catch (uploadErr) {
                        console.error("Upload failed", uploadErr);
                        setError("Error al subir la imagen. Intenta de nuevo.");
                        setLoading(false);
                        return;
                    }
                } else if (existingPhotoUrls.length > 0) {
                    for (let pi = 0; pi < existingPhotoUrls.length; pi++) {
                        const existingUrl = existingPhotoUrls[pi];
                        const existingStoragePath = existingPhotoStoragePaths[pi];

                        if (existingStoragePath || isFetchableImageUrl(existingUrl)) {
                            finalPhotoUrls.push(existingUrl);
                            if (existingStoragePath) finalPhotoStoragePaths.push(existingStoragePath);
                            continue;
                        }

                        const imported = await importExternalReviewPhoto(existingUrl);
                        finalPhotoUrls.push(imported.url);
                        finalPhotoStoragePaths.push(imported.storagePath);
                    }
                } else if (imagePreview && imagePreview.startsWith('http')) {
                    if (isFetchableImageUrl(imagePreview)) {
                        finalPhotoUrls = [imagePreview];
                    } else {
                        const imported = await importExternalReviewPhoto(imagePreview);
                        finalPhotoUrls = [imported.url];
                        finalPhotoStoragePaths.push(imported.storagePath);
                    }
                }
                finalPhotoUrl = finalPhotoUrls[0] || '';
                replacedPhotoStoragePaths = editReviewId
                    ? existingPhotoStoragePaths.filter(path => path && !finalPhotoStoragePaths.includes(path))
                    : [];

                try {
                    console.log(`Ensuring place ${finalPlaceId} exists via backend...`);
                    const idToken = await user.getIdToken();
                    const syncedPlace = await PlaceService.ensurePlaceSyncedWithBackend(finalPlaceId, idToken);

                    if (syncedPlace) {
                        console.log("Place synced successfully:", syncedPlace.name);
                        // Update local snapshot vars with the authoritative data from backend
                        finalPlaceAddress = syncedPlace.address || syncedPlace.formatted_address || finalPlaceAddress;

                        // Use location (object) or coordinates (object) or fallback to lat/lng if available
                        if (syncedPlace.location && typeof syncedPlace.location === 'object') {
                            finalPlaceLat = syncedPlace.location.latitude;
                            finalPlaceLng = syncedPlace.location.longitude;
                        } else if (syncedPlace.coordinates && typeof syncedPlace.coordinates === 'object') {
                            finalPlaceLat = syncedPlace.coordinates.latitude;
                            finalPlaceLng = syncedPlace.coordinates.longitude;
                        }
                    }
                } catch (placeErr) {
                    console.error("Failed to sync place with backend via new logic:", placeErr);
                    // Fallback: Si el backend falla o da timeout, creamos un documento básico desde el frontend para que la reseña no quede "huérfana".
                    try {
                        const placeRef = doc(db, 'places', finalPlaceId);
                        const placeSnap = await getDoc(placeRef);
                        if (!placeSnap.exists()) {
                            await setDoc(placeRef, {
                                name: selectedPlace.name,
                                name_normalized: selectedPlace.name.toLowerCase(),
                                address: finalPlaceAddress,
                                address_normalized: finalPlaceAddress.toLowerCase(),
                                location: { latitude: finalPlaceLat, longitude: finalPlaceLng },
                                coordinates: { latitude: finalPlaceLat, longitude: finalPlaceLng },
                                googlePlaceId: finalPlaceId,
                                types: selectedPlace.types || (selectedPlace.type ? [selectedPlace.type] : ['establishment']),
                                createdAt: serverTimestamp(),
                                updatedAt: serverTimestamp(),
                                followersCount: 0,
                                reviewsCount: 0,
                                averageRating: null
                            });
                            console.log("Created fallback place document directly from frontend.");
                        }
                    } catch (fallbackErr) {
                        console.error("Fallback place creation failed:", fallbackErr);
                    }
                }
            }
            const isSublist = !!listData?.parentListId;
            const finalListId = isSublist ? (listData?.parentListId || internalListId) : internalListId;
            const sublistId = isSublist ? internalListId : null;
            const visibility = listData?.visibility === 'private' ? 'private' : 'public';

            if (!finalListId) {
                setError('Selecciona una lista válida antes de guardar.');
                setLoading(false);
                return;
            }

            const userProfileSnap = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
            const userProfile = userProfileSnap && userProfileSnap.exists() ? userProfileSnap.data() as UserProfileData : null;
            const authorUsername = typeof userProfile?.username === 'string' ? userProfile.username.trim() : '';
            const authorDisplayName = typeof userProfile?.displayName === 'string'
                ? userProfile.displayName.trim()
                : (user.displayName || '').trim();
            const authorNameToPersist = authorUsername || authorDisplayName || 'Anónimo';
            const authorPhotoToPersist = userProfile?.photoUrl || user.photoURL || '';

            const reviewData = {
                // New Fields structure
                listId: finalListId,
                parentListId: isSublist ? listData.parentListId : finalListId,
                sublistId: sublistId,
                visibility,

                // Author / Ownership Fields
                userId: user.uid,
                authorName: authorNameToPersist,
                authorPhoto: authorPhotoToPersist,
                authorUserType: userProfile?.userType ?? [],

                // Item details
                itemName: itemName.trim(),
                itemNameLower: itemName.trim().toLowerCase(),
                comment: comment.trim(),
                overallRating,
                scores: criteriaScores,

                // User input / Tags / Interactions
                tags: customTags,
                reactionCounts: { like: 0, dislike: 0 },
                photoUrl: finalPhotoUrl,
                photoUrls: finalPhotoUrls.length > 0 ? finalPhotoUrls : (finalPhotoUrl ? [finalPhotoUrl] : []),
                photoStoragePaths: finalPhotoStoragePaths,
                updatedAt: serverTimestamp(),

                // Location Details
                placeId: finalPlaceId,
                placeName: selectedPlace?.name || placeName,
                placeAddress: finalPlaceAddress,
                placeLat: finalPlaceLat,
                placeLng: finalPlaceLng,
            };

            let newReviewId: string | undefined;

            if (editReviewId) {
                // Canonical write path: lists/{listId}/reviews/{reviewId}
                const targetSubRef = doc(db, 'lists', finalListId, 'reviews', editReviewId);
                let createdAtToKeep: unknown = null;

                // Preserve original createdAt and clean up old location if needed.
                if (reviewPath?.startsWith('lists/')) {
                    const parts = reviewPath.split('/');
                    if (parts.length >= 4) {
                        const previousListId = parts[1];
                        const previousRef = doc(db, 'lists', previousListId, 'reviews', editReviewId);
                        const previousSnap = await getDoc(previousRef);
                        if (previousSnap.exists()) {
                            createdAtToKeep = previousSnap.data().createdAt || null;
                            if (previousListId !== finalListId) {
                                await deleteDoc(previousRef);
                            }
                        }
                    }
                } else if (reviewPath?.startsWith('reviews/')) {
                    const legacyRootRef = doc(db, 'reviews', editReviewId);
                    const legacyRootSnap = await getDoc(legacyRootRef);
                    if (legacyRootSnap.exists()) {
                        createdAtToKeep = legacyRootSnap.data().createdAt || null;
                        await deleteDoc(legacyRootRef);
                    }
                }

                const existingTargetSnap = await getDoc(targetSubRef);
                if (existingTargetSnap.exists() && !createdAtToKeep) {
                    createdAtToKeep = existingTargetSnap.data().createdAt || null;
                }

                await setDoc(targetSubRef, {
                    ...reviewData,
                    createdAt: createdAtToKeep || serverTimestamp(),
                    updatedAt: serverTimestamp()
                }, { merge: true });

                if (replacedPhotoStoragePaths.length > 0) {
                    await Promise.allSettled(
                        replacedPhotoStoragePaths.map(path => deleteObject(ref(storage, path)))
                    );
                }
            } else {
                // Create in the list subcollection (legacy/canonical path).
                const newDocRef = await addDoc(collection(db, 'lists', finalListId, 'reviews'), {
                    ...reviewData,
                    createdAt: serverTimestamp()
                });
                newReviewId = newDocRef.id;
            }

            // Los contadores de la lista y de la minilista los recalculan Cloud
            // Functions a partir de las reseñas (antes el cliente además sumaba
            // +1 por reseña, contando dos veces y con itemCount incorrecto).

            // Si el lugar no tiene portada, usamos la primera foto de reseña del usuario.
            if (finalPlaceId && finalPhotoUrl) {
                try {
                    const placeRef = doc(db, 'places', finalPlaceId);
                    const placeSnap = await getDoc(placeRef);
                    const currentMainImageUrl = placeSnap.exists() ? ((placeSnap.data() as Record<string, unknown>)?.mainImageUrl as string | undefined) : undefined;
                    const currentUserPhotoUrl = placeSnap.exists() ? ((placeSnap.data() as Record<string, unknown>)?.userPhotoUrl as string | undefined) : undefined;
                    if (!currentUserPhotoUrl && (!currentMainImageUrl || isGooglePlacePhotoUrl(currentMainImageUrl))) {
                        await setDoc(placeRef, {
                            userPhotoUrl: finalPhotoUrl,
                            lastUserPhotoAt: serverTimestamp()
                        }, { merge: true });
                    }
                } catch (placeImageErr) {
                    console.warn("No se pudo establecer portada del lugar desde la reseña:", placeImageErr);
                }
            }

            // Optimistic cache update — avoids Firestore local-cache latency on refetch
            const optimisticReview = {
                id: newReviewId ?? editReviewId ?? '',
                ...reviewData,
                createdAt: Timestamp.now(),
                listName: listData?.name,
                criteriaDefinition: listData?.criteriaDefinition,
                placeName: selectedPlace?.name || placeName,
                placeAddress: finalPlaceAddress,
                lat: finalPlaceLat,
                lng: finalPlaceLng,
            };

            if (finalListId) {
                queryClient.setQueryData(['listDetails', finalListId], (old: ListDetailsCache | undefined) => {
                    if (!old) return old;
                    if (newReviewId) {
                        return { ...old, reviews: [optimisticReview, ...(old.reviews ?? [])] };
                    } else if (editReviewId) {
                        return {
                            ...old,
                            reviews: (old.reviews ?? []).map((r) =>
                                r.id === editReviewId ? { ...r, ...optimisticReview } : r
                            ),
                        };
                    }
                    return old;
                });
            }

            if (newReviewId) {
                queryClient.setQueriesData({ queryKey: ['reviews'] }, (old: InfiniteReviewsCache | undefined) => {
                    if (!old?.pages) return old;
                    return {
                        ...old,
                        pages: old.pages.map((page, idx) =>
                            idx === 0 ? { ...page, reviews: [optimisticReview, ...page.reviews] } : page
                        ),
                    };
                });
            }

            // Mark stale for lazy background refetch (won't immediately re-fetch)
            if (finalListId) queryClient.invalidateQueries({ queryKey: ['listDetails', finalListId], refetchType: 'none' });
            queryClient.invalidateQueries({ queryKey: ['reviews'], refetchType: 'none' });
            if (finalPlaceId) queryClient.invalidateQueries({ queryKey: ['placeDetails', finalPlaceId], refetchType: 'none' });
            if (finalListId) queryClient.invalidateQueries({ queryKey: ['doc', 'lists', finalListId], refetchType: 'none' });

            showToast({
                variant: 'success',
                title: isNew ? 'Valoración publicada' : 'Cambios guardados',
                message: isNew ? pickRandom(REVIEW_CREATE_TOASTS) : pickRandom(REVIEW_EDIT_TOASTS),
            });
            localStorage.removeItem(`listopic_review_draft_${finalListId || 'global'}`);
            onSuccess();
            onClose();

        } catch (err: unknown) {
            console.error("Error adding review:", err);
            setError("Error al guardar: " + getErrorMessage(err, 'Error desconocido'));
            showToast({
                variant: 'error',
                title: 'No se pudo guardar',
                message: 'Hubo un problema al guardar la valoración. Inténtalo de nuevo en unos segundos.',
            });
        } finally {
            setLoading(false);
        }
    };

    if (initLoading && isNew) {
        return (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <Loader2 className="w-10 h-10 text-[var(--lt-accent)] animate-spin" />
            </div>
        );
    }

    // Criterios que cuentan para la nota (obligatorios) y detalles opcionales.
    const ponderableCriteria = criteriaList.filter(c => isComputingCriterion(c));
    const nonPonderableCriteria = criteriaList.filter(c => !isComputingCriterion(c));
    const setCriterionScore = (criterionId: string, value: number | undefined) => {
        setCriteriaScores(prev => {
            const next = { ...prev };
            if (value === undefined) delete next[criterionId];
            else next[criterionId] = value;
            return next;
        });
    };
    const overallBand = scoreBand(overallRating);
    const overallBadge = SCORE_BADGE[overallBand];
    const scoringProgress = scoreSummary.requiredCount > 0 ? scoreSummary.scoredCount / scoreSummary.requiredCount : 0;

    return createPortal(
        <>
            <div className="fixed top-0 left-0 w-full h-[100dvh] z-[10000] lt-mobile-overlay bg-black/70 backdrop-blur-md animate-fade-in flex items-center justify-center sm:p-6">
                <div
                    className="flex flex-col w-full h-full max-w-2xl bg-[var(--lt-bg)] sm:rounded-2xl overflow-hidden shadow-2xl"
                    style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.06)' }}
                >
                    {/* ── Header ─────────────────────────────────────── */}
                    <div
                        className="relative flex items-center justify-between p-5 shrink-0 overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, var(--lt-card-strong) 0%, var(--lt-bg) 100%)' }}
                    >
                        {/* Decorative blobs */}
                        <div className="absolute -top-8 -left-8 w-28 h-28 rounded-full opacity-25 pointer-events-none"
                            style={{ background: 'radial-gradient(circle, var(--lt-accent), transparent 70%)' }} />
                        <div className="absolute -top-6 right-12 w-20 h-20 rounded-full opacity-20 pointer-events-none"
                            style={{ background: 'radial-gradient(circle, var(--lt-warning), transparent 70%)' }} />

                        <div className="relative flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                                style={{ background: 'var(--lt-accent-grad)' }}
                            >
                                {isNew ? '✍️' : '✏️'}
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-white font-display leading-tight">
                                    {isNew ? 'Nueva valoración' : 'Editar valoración'}
                                </h2>
                                {listData?.name && (
                                    <p className="text-xs text-[var(--lt-accent)]/60 mt-0.5">en {listData.name}</p>
                                )}
                            </div>
                        </div>

                        <button
                            aria-label="Cerrar"
                            onClick={onClose}
                            className="relative p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:scale-105 active:scale-95"
                        >
                            <X className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>

                    {/* ── Scrollable body ────────────────────────────── */}
                    <div ref={scrollRef} className="overflow-y-auto flex-1 custom-scrollbar" onPointerDown={handlePointerDown}>

                        {/* ── Sección: ¿En qué lista? ─────────────────── */}
                        <div className="px-4 pt-4">
                            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--lt-accent)] flex items-center gap-1.5">
                                    <span>📋</span> ¿En qué lista?
                                </p>
                                {(!lockList && !editReviewId) ? (
                                    <ListSearch
                                        onSelect={(id) => {
                                            setInternalListId(id);
                                            if (onListChange) onListChange(id);
                                        }}
                                        selectedListId={internalListId}
                                        placeName={selectedPlace?.name || itemName}
                                        placeTypes={selectedPlace?.types}
                                        suggestedListIds={suggestedListIds}
                                    />
                                ) : internalListId ? (
                                    <div className="flex items-center gap-3 bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] p-3 rounded-xl">
                                        <div className="p-1.5 bg-[var(--lt-accent-soft)] rounded-lg shrink-0">
                                            <Lock className="w-3.5 h-3.5 text-[var(--lt-accent)]" />
                                        </div>
                                        <span className="text-sm text-white font-semibold truncate">
                                            {listData?.name || 'Lista seleccionada'}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="p-3 border border-dashed border-red-500/30 text-red-400 text-xs rounded-xl">
                                        Sin lista seleccionada
                                    </div>
                                )}
                            </div>
                        </div>

                        <form id="review-form" onSubmit={handleSubmit} className="px-4 pb-4 pt-3 space-y-3">

                            {/* ── Sección: ¿Dónde? ────────────────────── */}
                            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                                <p className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors duration-300 ${(selectedPlace || prefillPlaceId) ? 'text-[var(--lt-success)]' : 'text-[var(--lt-warning)]'}`}>
                                    <span>{(selectedPlace || prefillPlaceId) ? '✅' : '📍'}</span> ¿Dónde?
                                </p>
                                {prefillPlaceId ? (
                                    <div className="flex items-center gap-3 bg-[var(--lt-warning)]/10 border border-[var(--lt-warning)]/20 p-3 rounded-xl">
                                        <div className="p-2 bg-[var(--lt-warning)]/20 rounded-xl shrink-0">
                                            <MapPinIcon className="w-4 h-4 text-[var(--lt-warning)]" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-white truncate">{selectedPlace?.name || 'Cargando...'}</p>
                                            <p className="text-xs text-gray-500 truncate">{selectedPlace?.address || ''}</p>
                                        </div>
                                        <Lock className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <PlaceSearch
                                            onSelect={setSelectedPlace}
                                            prefillValue={selectedPlace?.name || prefillItemName}
                                            placeholder="Busca el restaurante, bar, café... 🔍"
                                        />
                                        {selectedPlace && (
                                            <div className="flex items-center gap-2 text-xs text-[var(--lt-success)] bg-[var(--lt-success)]/10 border border-[var(--lt-success)]/20 px-3 py-2 rounded-xl animate-fade-in">
                                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                                <span className="font-semibold truncate">{selectedPlace.name}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── Sección: ¿Qué probaste? ─────────────── */}
                            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--lt-success)] flex items-center gap-1.5">
                                    <span>🍽️</span> ¿Qué probaste?
                                </p>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={itemName}
                                        onChange={e => setItemName(e.target.value)}
                                        maxLength={150}
                                        placeholder="Ej: Pizza Margherita, Tacos al pastor..."
                                        disabled={!!prefillItemName}
                                        className={`w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all placeholder:text-gray-600
                                        ${prefillItemName
                                                ? 'bg-white/5 border border-white/10 cursor-not-allowed opacity-70'
                                                : 'bg-white/5 border border-white/10 focus:border-[var(--lt-accent-border)] focus:bg-[var(--lt-accent-soft)] focus:ring-1 focus:ring-[var(--lt-accent)]'
                                            }`}
                                    />
                                    {prefillItemName && (
                                        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                                    )}
                                </div>
                            </div>

                            {/* ── Sección: Valoración ─────────────────── */}
                            {criteriaLoaded && hasComputingCriteria ? (
                                <div className="rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] p-4 space-y-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--lt-accent)] flex items-center gap-1.5">
                                            <span aria-hidden>⭐</span> Valoración
                                        </p>
                                        <span
                                            className={`text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full ${scoreSummary.complete
                                                ? 'bg-emerald-500/15 text-[var(--lt-score-top)]'
                                                : 'bg-[var(--lt-border)] text-[var(--lt-text-muted)]'}`}
                                            aria-live="polite"
                                        >
                                            {scoreSummary.complete ? '✓ ' : ''}{scoreSummary.scoredCount} de {scoreSummary.requiredCount} criterios
                                        </span>
                                    </div>

                                    {/* Nota en vivo */}
                                    <div
                                        className="flex items-center gap-4 p-4 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-bg)] transition-colors duration-300"
                                        style={scoreSummary.scoredCount > 0 ? { borderColor: overallBadge.bg } : undefined}
                                    >
                                        <div
                                            className="min-w-[4.5rem] text-center text-5xl font-black font-display tabular-nums transition-colors duration-300"
                                            style={{ color: scoreSummary.scoredCount > 0 ? scoreTextColor(overallRating) : 'var(--lt-text-muted)' }}
                                        >
                                            {scoreSummary.scoredCount > 0 ? formatScore(overallRating) : '—'}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            {scoreSummary.scoredCount === 0 ? (
                                                <>
                                                    <div className="text-sm font-bold text-[var(--lt-text)]">Tu nota</div>
                                                    <div className="text-[11px] text-[var(--lt-text-muted)] mt-0.5">
                                                        Puntúa cada criterio: la nota es su media.
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-sm font-bold text-[var(--lt-text)] flex items-center gap-1.5">
                                                        <span aria-hidden>{SCORE_BAND_EMOJI[overallBand]}</span>
                                                        {scoreSummary.complete ? SCORE_BAND_LABEL[overallBand] : 'Nota provisional'}
                                                    </div>
                                                    <div className="text-[11px] text-[var(--lt-text-muted)] mt-0.5">
                                                        {scoreSummary.complete
                                                            ? `Media de ${scoreSummary.requiredCount} ${scoreSummary.requiredCount === 1 ? 'criterio' : 'criterios'}`
                                                            : `Faltan ${scoreSummary.requiredCount - scoreSummary.scoredCount} por puntuar`}
                                                    </div>
                                                </>
                                            )}
                                            <div className="mt-2 h-1 rounded-full bg-[var(--lt-border)] overflow-hidden" aria-hidden>
                                                <div
                                                    className="h-full rounded-full bg-[var(--lt-accent)] transition-[width] duration-300 motion-reduce:transition-none"
                                                    style={{ width: `${Math.round(scoringProgress * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Criterios que cuentan: todos obligatorios */}
                                    <div className="space-y-6">
                                        {ponderableCriteria.map((criterion) => (
                                            <CriterionRating
                                                key={criterion.id}
                                                criterion={criterion}
                                                value={criteriaScores[criterion.id]}
                                                counts
                                                onChange={(value) => setCriterionScore(criterion.id, value)}
                                            />
                                        ))}
                                    </div>

                                    {/* Detalles opcionales: no cuentan para la nota */}
                                    {nonPonderableCriteria.length > 0 && (
                                        <div className="border-t border-[var(--lt-border)] pt-5 space-y-6">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">
                                                Otros detalles <span className="normal-case font-normal tracking-normal">· opcionales, no cuentan para la nota</span>
                                            </p>
                                            {nonPonderableCriteria.map((criterion) => (
                                                <CriterionRating
                                                    key={criterion.id}
                                                    criterion={criterion}
                                                    value={criteriaScores[criterion.id]}
                                                    counts={false}
                                                    onChange={(value) => setCriterionScore(criterion.id, value)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : criteriaLoaded ? (
                                <div role="status" className="rounded-2xl border border-dashed border-[var(--lt-border-strong)] p-6 text-center space-y-2">
                                    <div className="text-2xl" aria-hidden>⭐</div>
                                    <p className="text-sm font-semibold text-[var(--lt-text)]">Esta lista no tiene criterios que cuenten para la nota.</p>
                                    <p className="text-xs text-[var(--lt-text-muted)]">Quien la creó puede marcar al menos uno como «cuenta para la nota» al editarla.</p>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-[var(--lt-border-strong)] p-6 text-center space-y-2">
                                    <div className="text-2xl" aria-hidden>⭐</div>
                                    <p className="text-[var(--lt-text-muted)] text-sm">
                                        {internalListId ? 'Cargando criterios...' : 'Elige una lista para ver sus criterios.'}
                                    </p>
                                </div>
                            )}

                            {/* ── Sección: Tu opinión ─────────────────── */}
                            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--lt-accent)] flex items-center gap-1.5">
                                    <span>💬</span> Tu opinión
                                </p>
                                <textarea
                                    value={comment}
                                    onChange={e => setComment(e.target.value)}
                                    maxLength={2000}
                                    placeholder="¿Qué te pareció? Los detalles que hacen la diferencia..."
                                    rows={3}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-gray-600 resize-none"
                                />
                                {comment.length > 0 && (
                                    <p className={`text-right text-[10px] ${comment.length > 1800 ? 'text-amber-500' : 'text-gray-600'}`}>{comment.length}/2000</p>
                                )}
                            </div>

                            {/* ── Sección: Fotos ──────────────────────── */}
                            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--lt-accent-2)] flex items-center gap-1.5">
                                    <span>📸</span> Fotos
                                    <span className="normal-case font-normal tracking-normal text-gray-600 ml-1">(opcional · hasta 3)</span>
                                </p>

                                {processedPhotos.length > 0 ? (
                                    <div className="space-y-2">
                                        {/* Miniaturas */}
                                        <div className="flex gap-2">
                                            {processedPhotos.map((p, i) => (
                                                <div key={i} className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 ${i === 0 ? 'border-[var(--lt-accent-border)]' : 'border-white/10'}`}>
                                                    <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
                                                    {i === 0 && (
                                                        <div className="absolute top-1 left-1 bg-amber-500 rounded-full p-0.5">
                                                            <Star className="w-2.5 h-2.5 fill-current text-white" />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedFilesForEditor(processedPhotos.map((p, i) => new File([p.blob], `photo-${i}.jpg`, { type: 'image/jpeg' })));
                                                    setIsPhotoEditorOpen(true);
                                                }}
                                                className="flex-1 py-2 bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] text-[var(--lt-accent)] text-xs font-semibold rounded-xl hover:bg-[var(--lt-accent)]/20 transition-all"
                                            >
                                                ✏️ Editar fotos
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setProcessedPhotos([]);
                                                    setImagePreview(null);
                                                    setExistingPhotoUrls([]);
                                                    setExistingPhotoStoragePaths([]);
                                                }}
                                                className="py-2 px-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl hover:bg-red-500/20 transition-all"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ) : existingPhotoUrls.length > 0 ? (
                                    /* Foto existente (modo edición legacy) */
                                    <div className="relative w-full h-44 rounded-xl overflow-hidden border border-white/10 group">
                                        <img src={existingPhotoUrls[0]} alt="Preview" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                        {existingPhotoUrls.length > 1 && (
                                            <div className="absolute top-3 left-3 bg-black/70 px-2 py-1 rounded-lg text-white text-[11px] font-bold">
                                                {existingPhotoUrls.length} fotos
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={openExistingPhotosInEditor}
                                            disabled={loadingExistingPhotosForEditor}
                                            className="absolute bottom-3 left-3 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent-2)] px-3 py-1.5 rounded-lg text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-70"
                                        >
                                            {loadingExistingPhotosForEditor && <Loader2 className="w-3 h-3 animate-spin" />}
                                            Editar fotos
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setImagePreview(null); setExistingPhotoUrls([]); setExistingPhotoStoragePaths([]); }}
                                            className="absolute bottom-3 right-3 bg-red-500 hover:bg-red-400 px-3 py-1.5 rounded-lg text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
                                        >
                                            <Trash2 className="w-3 h-3" /> Eliminar
                                        </button>
                                    </div>
                                ) : (
                                    <div
                                        className="relative w-full h-28 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[var(--lt-accent-border)] hover:bg-[var(--lt-accent-soft)] transition-all group"
                                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-[var(--lt-accent-border)]', 'bg-[var(--lt-accent-soft)]'); }}
                                        onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-[var(--lt-accent-border)]', 'bg-[var(--lt-accent-soft)]'); }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            e.currentTarget.classList.remove('border-[var(--lt-accent-border)]', 'bg-[var(--lt-accent-soft)]');
                                            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).slice(0, 3);
                                            if (files.length > 0) { setSelectedFilesForEditor(files); setIsPhotoEditorOpen(true); }
                                        }}
                                        onClick={() => document.getElementById('review-photo-upload')?.click()}
                                    >
                                        <div className="text-2xl mb-1 group-hover:scale-110 transition-transform">📷</div>
                                        <p className="text-xs font-semibold text-gray-400">Arrastra o haz clic para subir</p>
                                        <p className="text-[10px] text-gray-600 mt-0.5">JPG · PNG · WEBP · hasta 3 fotos</p>
                                        <input
                                            id="review-photo-upload"
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            multiple
                                            onChange={(e) => {
                                                const files = Array.from(e.target.files || []).slice(0, 3);
                                                if (files.length > 0) { setSelectedFilesForEditor(files); setIsPhotoEditorOpen(true); }
                                                e.target.value = '';
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* ── Sección: Etiquetas ──────────────────── */}
                            {listAvailableTags.length > 0 && (
                                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--lt-success)] flex items-center gap-1.5">
                                        <span>🏷️</span> Etiquetas
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {listAvailableTags.map(tag => (
                                            <button
                                                type="button"
                                                key={tag}
                                                onClick={() => toggleTag(tag)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border active:scale-95 ${customTags.includes(tag)
                                                    ? 'bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-white shadow-lg shadow-[var(--lt-accent-shadow)] scale-[1.03]'
                                                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-[var(--lt-accent-border)] hover:text-gray-200'
                                                    }`}
                                            >
                                                {customTags.includes(tag) ? '✓ ' : ''}{tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl animate-fade-in">
                                    <span className="shrink-0">⚠️</span>
                                    <span>{error}</span>
                                </div>
                            )}

                        </form>
                    </div>

                    {/* ── Footer ─────────────────────────────────────── */}
                    <div
                        className="px-4 py-3 border-t border-white/5 shrink-0"
                        style={{ background: 'var(--lt-bg-deep)' }}
                    >
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-gray-400 hover:text-white hover:bg-white/5 border border-white/5 hover:border-white/10 transition-all active:scale-95"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                form="review-form"
                                disabled={loading || !isValid || (!isNew && !isDirty)}
                                className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]
                                ${loading || !isValid || (!isNew && !isDirty)
                                        ? 'bg-white/5 border border-white/5 text-gray-500 cursor-not-allowed'
                                        : 'btn-primary'
                                    }`}
                            >
                                {loading
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                                    : isNew ? '✨ Publicar valoración' : '💾 Guardar Cambios'
                                }
                            </button>
                        </div>
                        {!isValid && !loading && (
                            <p className="text-center text-[11px] text-[var(--lt-text-muted)] mt-2">
                                {[
                                    (!selectedPlace && !prefillPlaceId) && '📍 Elige un sitio',
                                    !itemName.trim() && '🍽️ Añade qué probaste',
                                    !internalListId && '📋 Elige una lista',
                                    criteriaLoaded && hasComputingCriteria && !scoreSummary.complete
                                        && `⭐ Puntúa todos los criterios (${scoreSummary.scoredCount}/${scoreSummary.requiredCount})`,
                                ].filter(Boolean).join(' · ')}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Editor de fotos (paso 2 / última pantalla antes de publicar) ── */}
            {isPhotoEditorOpen && (
                <PhotoEditorModal
                    initialFiles={selectedFilesForEditor}
                    onConfirm={(photos) => {
                        setProcessedPhotos(photos);
                        setIsPhotoEditorOpen(false);
                    }}
                    onClose={() => setIsPhotoEditorOpen(false)}
                />
            )}
        </>,
        document.body
    );
};

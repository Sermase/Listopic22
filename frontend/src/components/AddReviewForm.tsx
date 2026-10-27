import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HelpTip } from './HelpTip';
import { createPortal } from 'react-dom';
import { moveVisitedPlace } from '../lib/visitArchives';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc, getDocs, setDoc, deleteDoc, Timestamp, query, where } from 'firebase/firestore';
import { db, storage, functions } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject, getBlob } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { APT_CONTRIBUTE_KEYS, APT_QUESTIONS, type AptAnswer, type AptKey } from '../lib/aptFor';
import { useToast } from '../context/ToastContext';
import { Loader2, X, MapPin as MapPinIcon, CheckCircle2, Lock, Trash2, Star } from 'lucide-react';
import { PhotoEditorModal, type ProcessedPhoto } from './PhotoEditorModal';
import { PlaceSearch } from './PlaceSearch';
import { PlaceService, type PlaceResult } from '../services/PlaceService';
import { ListSearch } from './ListSearch';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isGooglePlacePhotoUrl } from '../utils/placeImages';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useBackToClose } from '../hooks/useSheetDismiss';
import { IMMUTABLE_UPLOAD_CACHE_CONTROL } from '../lib/storageCache';
import { computeReviewScore, criterionWeight, isComputingCriterion } from '../lib/scoring';
import { formatScore, SCORE_BADGE, SCORE_BAND_EMOJI, SCORE_BAND_LABEL, scoreBand, scoreTextColor } from '../lib/scoreScale';
import { CriterionRating } from './CriterionRating';
import { orderedCriteriaEntries } from '../lib/criteria';
import { isDefaultVegetarian, listTagsWithDiet } from '../lib/categoryTags';
import { CategoryService } from '../services/CategoryService';
import { parseReviewDraft, reviewDraftKey, REVIEW_DRAFT_VERSION, shouldRestoreReviewDraft } from '../lib/reviewDraft';
import { usePlaceElementsInList } from '../hooks/usePlaceElementsInList';
import { itemNameKey } from '../lib/placeItems';
import { findSameElementReview } from '../lib/reviewUniqueness';
import { useAppConfig } from '../context/AppConfigContext';
import { useTheme } from '../context/ThemeContext';
import { celebrateReview } from './surprises/celebrateReview';
import { haptic } from '../utils/haptics';

interface AddReviewFormProps {
    listId: string | null;
    onListChange?: (id: string) => void;
    prefillPlaceId?: string;
    prefillItemName?: string;
    editReviewId?: string;
    lockList?: boolean;
    /** «Atrás» cierra el formulario (false cuando es una página, no una ventana). */
    closeOnBack?: boolean;
    onClose: () => void;
    onSuccess: () => void;
    suggestedListIds?: string[]; // IDs of lists where this place is already present
}

const REVIEW_CREATE_TOASTS = [
    'Tu veredicto ya está en la mesa.',
    'Reseña publicada: criterio fino y sin titubeos.',
    'Nuevo punto en el mapa del buen gusto.',
    'Anotado. El ranking acaba de ponerse interesante.',
] as const;

const REVIEW_EDIT_TOASTS = [
    'Cambios guardados. Ajuste de precisión aplicado.',
    'Revisión lista: tu ranking respira más orden.',
    'Actualización hecha. El criterio subió un nivel.',
    'Editado con éxito: caos bajo control.',
] as const;

/** Tus reseñas de un sitio en una lista (las reglas dejan leer las propias sin filtrar visibilidad). */
const fetchOwnReviewsAtPlace = async (listId: string, placeId: string, uid: string) => {
    const snap = await getDocs(query(
        collection(db, 'lists', listId, 'reviews'),
        where('userId', '==', uid),
        where('placeId', '==', placeId),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; itemName?: string }));
};

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
    isPublic?: boolean;
    criteriaDefinition?: ReviewCriterion[] | Record<string, ReviewCriterion>;
    scoringWeights?: Record<string, number>;
    availableTags?: string[];
    categoryId?: string;
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
    sublistId?: string | null;
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

export const AddReviewForm: React.FC<AddReviewFormProps> = ({ listId, onListChange, prefillPlaceId, prefillItemName, editReviewId: editReviewIdProp, lockList = false, closeOnBack = true, onClose, onSuccess, suggestedListIds }) => {
    useBodyScrollLock(true);
    useBackToClose(closeOnBack, onClose);
    const { user } = useAuth();
    // Editable aquí: si ya tienes reseña de ese plato, «Editar la mía» la abre en este mismo formulario.
    const [editReviewId, setEditReviewId] = useState<string | undefined>(editReviewIdProp);
    useEffect(() => { setEditReviewId(editReviewIdProp); }, [editReviewIdProp]);
    // «Apto para»: solo para quien aporta en algo (Mis preferencias). Respuestas privadas.
    const { prefs } = usePreferences();
    const contributeKeys = APT_CONTRIBUTE_KEYS.filter((key) => prefs.contribute.includes(key));
    const [aptAnswers, setAptAnswers] = useState<Partial<Record<AptKey, AptAnswer>>>({});
    const { showToast } = useToast();
    const queryClient = useQueryClient();

    // Core Data
    // Core Data
    const [itemName, setItemName] = useState(prefillItemName || '');
    const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);

    const [comment, setComment] = useState('');
    // Nota guardada al editar (solo se usa si la reseña antigua no tiene puntuaciones).
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
    const commentRef = useRef<HTMLTextAreaElement>(null);
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
    const appConfig = useAppConfig();
    const abuela = useTheme().theme === 'abuela';

    // Borrador: va atado a lista + sitio y solo se recupera al elegir ese mismo
    // sitio (lib/reviewDraft). Antes salía en cualquier reseña de la lista.
    const selectedPlaceId = selectedPlace?.id || null;
    const draftCheckedFor = useRef<string | null>(null);
    useEffect(() => {
        if (!isNew || !internalListId || !selectedPlaceId) return;
        const target = `${internalListId}|${selectedPlaceId}`;
        if (draftCheckedFor.current === target) return;
        draftCheckedFor.current = target;
        let raw: string | null = null;
        try { raw = localStorage.getItem(reviewDraftKey(internalListId)); } catch { return; }
        const draft = parseReviewDraft(raw);
        if (!draft) {
            // Borradores antiguos (sin sitio) o caducados: fuera.
            if (raw) try { localStorage.removeItem(reviewDraftKey(internalListId)); } catch { /* sin almacenamiento */ }
            return;
        }
        if (!shouldRestoreReviewDraft(draft, {
            placeId: selectedPlaceId,
            lockedItemName: prefillItemName,
            hasScores: Object.keys(criteriaScores).length > 0,
            comment,
        })) return;
        if (draft.itemName && !prefillItemName && !itemName.trim()) setItemName(draft.itemName);
        if (draft.comment) setComment(draft.comment);
        if (Object.keys(draft.criteriaScores).length > 0) setCriteriaScores(draft.criteriaScores);
        showToast({ variant: 'success', title: 'Borrador recuperado', message: 'Seguimos donde lo dejaste en este sitio.' });
        // Solo al cambiar de lista o de sitio.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isNew, internalListId, selectedPlaceId]);

    useEffect(() => {
        if (!isNew || !internalListId || !selectedPlaceId) return;
        if (Object.keys(criteriaScores).length === 0 && !itemName.trim() && !comment.trim()) return;
        const timeout = setTimeout(() => {
            const draft = { v: REVIEW_DRAFT_VERSION, placeId: selectedPlaceId, itemName, comment, criteriaScores, savedAt: Date.now() };
            try { localStorage.setItem(reviewDraftKey(internalListId), JSON.stringify(draft)); } catch { /* sin almacenamiento */ }
        }, 500);
        return () => clearTimeout(timeout);
    }, [itemName, comment, criteriaScores, isNew, internalListId, selectedPlaceId]);

    // Elementos que el sitio ya tiene en la lista: se eligen con un toque o se
    // escribe uno nuevo. No aplica al editar ni con el plato fijado desde la carta.
    const offerExistingElements = isNew && !prefillItemName;
    const { data: placeElements = [] } = usePlaceElementsInList(internalListId, listData, selectedPlaceId, offerExistingElements);
    const elementOptions = offerExistingElements ? placeElements : [];
    const [writeNewItem, setWriteNewItem] = useState(false);
    const [showAllElements, setShowAllElements] = useState(false);
    useEffect(() => {
        setWriteNewItem(false);
        setShowAllElements(false);
    }, [internalListId, selectedPlaceId]);
    const chosenElementKey = itemName.trim() ? itemNameKey(itemName) : '';
    const chosenElement = elementOptions.find((element) => itemNameKey(element.name) === chosenElementKey) || null;
    const showItemNameInput = elementOptions.length === 0 || writeNewItem || (Boolean(chosenElementKey) && !chosenElement);
    // Una reseña por persona y plato (lib/reviewUniqueness): las tuyas de ese sitio en la lista.
    const reviewListId = listData?.parentListId || internalListId;
    const reviewVisibility = listData?.visibility === 'private' ? 'private' : 'public';
    const reviewSublistId = listData?.parentListId ? internalListId : null;
    const { data: ownReviewsHere = [] } = useQuery({
        queryKey: ['ownReviewsAtPlace', reviewListId, selectedPlaceId, user?.uid],
        enabled: Boolean(user?.uid && reviewListId && selectedPlaceId && listData),
        staleTime: 60 * 1000,
        queryFn: () => fetchOwnReviewsAtPlace(reviewListId!, selectedPlaceId!, user!.uid),
    });
    const sameElementReview = findSameElementReview(
        { userId: user?.uid, listId: reviewListId, sublistId: reviewSublistId, visibility: reviewVisibility, placeId: selectedPlaceId, itemName },
        ownReviewsHere,
        editReviewId,
    );
    const ELEMENT_CHIPS_LIMIT = 6;
    const visibleElements = showAllElements ? elementOptions : elementOptions.slice(0, ELEMENT_CHIPS_LIMIT);
    const hiddenElementsCount = elementOptions.length - visibleElements.length;

    // Nota en vivo: media de los criterios que cuentan (lib/scoring).
    // Pesos de la lista (hoy ×1 / ×0); en listas antiguas sin ellos se usa `ponderable`.
    const scoringOptions = useMemo(() => ({ weights: listData?.scoringWeights ?? null }), [listData?.scoringWeights]);
    const scoreSummary = useMemo(() => computeReviewScore(criteriaScores, criteriaList, scoringOptions), [criteriaScores, criteriaList, scoringOptions]);
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

    // Respuestas «Apto para» que ya dio en esta reseña.
    useEffect(() => {
        if (!editReviewId || !user?.uid) return;
        let cancelled = false;
        getDoc(doc(db, 'users', user.uid, 'aptReports', editReviewId))
            .then((snap) => {
                const answers = snap.exists() ? snap.data().answers : null;
                if (!cancelled && answers && typeof answers === 'object') setAptAnswers(answers as Partial<Record<AptKey, AptAnswer>>);
            })
            .catch(() => { /* opcional */ });
        return () => { cancelled = true; };
    }, [editReviewId, user?.uid]);

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

                // Las reseñas de una Minilista viven en lists/{padre}/reviews con
                // `sublistId`: hay que seleccionar la Minilista, no la padre, o al
                // guardar se cambiaría el destino y las reglas lo rechazan.
                const storedSublistId = typeof data.sublistId === 'string' && data.sublistId.trim() ? data.sublistId : null;
                const effectiveListId = storedSublistId || resolvedListId || data.listId || data.parentListId || listId || null;
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
                const baseCandidates = [listId, internalListId].filter((value): value is string => !!value);
                // Desde una Minilista la reseña está en la lista padre.
                const parentCandidates = await Promise.all(baseCandidates.map(async (id) => {
                    const listSnap = await getDoc(doc(db, 'lists', id)).catch(() => null);
                    const parentId = listSnap?.exists() ? listSnap.data().parentListId : null;
                    return typeof parentId === 'string' && parentId ? parentId : null;
                }));
                const candidateListIds = Array.from(new Set(
                    [...baseCandidates, ...parentCandidates].filter((value): value is string => !!value)
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
                setError("Error cargando la reseña para editar");
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

                        // Reseña nueva: ningún criterio viene puntuado. Solo se
                        // conservan notas de esta lista (p. ej. de un borrador).
                        if (!editReviewId) {
                            const ids = new Set(cList.map(c => c.id));
                            setCriteriaScores(prev => Object.fromEntries(
                                Object.entries(prev).filter(([key, value]) => ids.has(key) && typeof value === 'number')
                            ));
                        }
                        setCriteriaList(cList);
                    }

                    // Las fijas de la categoría (Vegetariano, Sin gluten… en «Hmm...») salen
                    // siempre, también en listas creadas antes de fijarlas.
                    const categoryTags = await CategoryService.getFixedTags(data.categoryId);
                    setListAvailableTags(listTagsWithDiet(categoryTags, data.availableTags, isDefaultVegetarian(data)));
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

        // Una reseña por persona y plato: se comprueba otra vez contra el servidor.
        if (selectedPlaceId && reviewListId) {
            const fresh = await fetchOwnReviewsAtPlace(reviewListId, selectedPlaceId, user.uid).catch(() => []);
            const duplicate = findSameElementReview(
                { userId: user.uid, listId: reviewListId, sublistId: reviewSublistId, visibility: reviewVisibility, placeId: selectedPlaceId, itemName },
                fresh,
                editReviewId,
            );
            if (duplicate) {
                setError(`Ya tienes una reseña de «${duplicate.itemName || itemName.trim()}» aquí. Edita la tuya en vez de crear otra.`);
                return;
            }
        }

        setLoading(true);
        setError(null);

        try {

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

                const existingData = existingTargetSnap.exists() ? existingTargetSnap.data() : null;
                const sameTarget = !!existingData && (existingData.sublistId || null) === (sublistId || null);
                if (existingData && !sameTarget) {
                    // Pasa a otra Minilista de la misma lista: se recrea en su sitio.
                    await deleteDoc(targetSubRef);
                }
                if (sameTarget) {
                    // Misma reseña en el mismo sitio: solo se cambia el contenido.
                    // Destino, autoría, visibilidad y contadores se conservan (las
                    // reglas no dejan cambiarlos y reactionCounts se reiniciaba).
                    const contentData: Record<string, unknown> = { ...reviewData };
                    for (const key of ['listId', 'parentListId', 'sublistId', 'visibility', 'userId', 'reactionCounts']) {
                        delete contentData[key];
                    }
                    await updateDoc(targetSubRef, {
                        ...contentData,
                        updatedAt: serverTimestamp()
                    });
                } else {
                    await setDoc(targetSubRef, {
                        ...reviewData,
                        reactionCounts: existingData?.reactionCounts ?? reviewData.reactionCounts,
                        createdAt: createdAtToKeep || serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                }

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

            // «Apto para»: la respuesta privada; el servidor la suma sin nombres en el sitio.
            const savedReviewId = newReviewId ?? editReviewId;
            if (user?.uid && savedReviewId && finalListId && (contributeKeys.length > 0 || editReviewId)) {
                const aptRef = doc(db, 'users', user.uid, 'aptReports', savedReviewId);
                try {
                    if (Object.keys(aptAnswers).length > 0) {
                        await setDoc(aptRef, { listId: finalListId, answers: aptAnswers, updatedAt: serverTimestamp() });
                    } else if (editReviewId) {
                        await deleteDoc(aptRef);
                    }
                } catch (aptErr) {
                    console.warn('No se pudo guardar «Apto para»:', aptErr);
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

            haptic('success');
            showToast({
                variant: 'success',
                title: isNew ? (abuela ? '¡Muy bien, hijo!' : 'Reseña publicada') : 'Cambios guardados',
                message: isNew ? pickRandom(REVIEW_CREATE_TOASTS) : pickRandom(REVIEW_EDIT_TOASTS),
            });
            // El borrador se guarda con la lista elegida (en una Minilista no es finalListId).
            try { localStorage.removeItem(reviewDraftKey(internalListId)); } catch { /* sin almacenamiento */ }
            queryClient.invalidateQueries({ queryKey: ['placeElementsInList', internalListId] });
            // «Quiero ir» → «Ya fui»: lo guardado de este sitio cambia de colección (sin bloquear).
            if (isNew && finalPlaceId && finalPlaceId !== 'unknown') {
                void moveVisitedPlace(db, user.uid, finalPlaceId)
                    .then((moved) => {
                        if (moved) showToast({ variant: 'success', message: '🧭 Lo tenías en «Quiero ir»: ya está en «Ya fui».' });
                    })
                    .catch((autoErr) => console.error('Archive automation error:', autoErr));
            }
            celebrateReview(appConfig, {
                overallRating,
                criteria: criteriaList,
                scores: criteriaScores,
                listName: listData?.name,
                itemName,
                tags: customTags,
                abuela,
            }, isNew);
            onSuccess();
            onClose();

        } catch (err: unknown) {
            console.error("Error adding review:", err);
            setError("Error al guardar: " + getErrorMessage(err, 'Error desconocido'));
            showToast({
                variant: 'error',
                title: 'No se pudo guardar',
                message: 'Hubo un problema al guardar la reseña. Inténtalo de nuevo en unos segundos.',
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
    const ponderableCriteria = criteriaList.filter(c => isComputingCriterion(c, scoringOptions));
    const nonPonderableCriteria = criteriaList.filter(c => !isComputingCriterion(c, scoringOptions));
    const setCriterionScore = (criterionId: string, value: number | undefined) => {
        setCriteriaScores(prev => {
            const next = { ...prev };
            if (value === undefined) delete next[criterionId];
            else next[criterionId] = value;
            return next;
        });
    };
    const setAptAnswer = (key: AptKey, value: AptAnswer) => setAptAnswers((prev) => {
        const next = { ...prev };
        if (next[key] === value) delete next[key];
        else next[key] = value;
        return next;
    });
    const aptAnswered = contributeKeys.filter((key) => aptAnswers[key]).length;
    const aptBlock = contributeKeys.length > 0 && user ? (
        <details open={aptAnswered > 0} className="group rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
                <span className="flex-1 text-sm font-bold text-[var(--lt-text)]">✍️ Apto para</span>
                {aptAnswered > 0 && <span className="rounded-full bg-[var(--lt-accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--lt-accent)]">{aptAnswered}</span>}
                <span className="text-xs text-[var(--lt-text-muted)]">opcional</span>
            </summary>
            <div className="space-y-3 px-4 pb-4">
                <p className="text-xs leading-snug text-[var(--lt-text-muted)]">🔒 Privado: nadie ve tu respuesta, solo el recuento sin nombres. Ayuda a quien busca lo mismo que tú.</p>
                {contributeKeys.map((key) => {
                    const q = APT_QUESTIONS[key];
                    return (
                        <div key={key}>
                            <p className="mb-1.5 text-sm font-semibold text-[var(--lt-text)]"><span aria-hidden="true">{q.emoji}</span> {q.question}</p>
                            <div className="flex flex-wrap gap-1.5" role="group" aria-label={q.question}>
                                {(['yes', 'no'] as const).map((value) => {
                                    const on = aptAnswers[key] === value;
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => setAptAnswer(key, value)}
                                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-text)]' : 'border-[var(--lt-border)] text-[var(--lt-text-muted)]'}`}
                                        >
                                            {value === 'yes' ? `✅ ${q.yes}` : `⚠️ ${q.no}`}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </details>
    ) : null;

    const opinionBlock = (
        <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--lt-accent)] flex items-center gap-1.5">
                <span>💬</span> Tu opinión <span className="normal-case font-normal tracking-normal text-[var(--lt-text-muted)]">· opcional, pero es lo que más se lee al decidir</span>
            </p>
            <textarea
                ref={commentRef}
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
    );
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
                                    {isNew ? (abuela ? '¿Qué has comido, hijo?' : 'Nueva reseña') : 'Editar reseña'}
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
                                {elementOptions.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-[var(--lt-text-muted)]">
                                            Ya en esta lista{selectedPlace?.name ? ` en ${selectedPlace.name}` : ''}:
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {visibleElements.map((element) => {
                                                const selected = chosenElement?.name === element.name && !writeNewItem;
                                                return (
                                                    <button
                                                        key={element.name}
                                                        type="button"
                                                        aria-pressed={selected}
                                                        onClick={() => { setItemName(element.name); setWriteNewItem(false); }}
                                                        className={`max-w-full flex items-center gap-1.5 px-3 py-2 rounded-full border text-sm font-semibold transition-colors ${selected
                                                            ? 'bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)] text-[var(--lt-text)]'
                                                            : 'bg-white/5 border-white/10 text-gray-300 hover:border-white/20'}`}
                                                    >
                                                        {selected && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[var(--lt-accent)]" />}
                                                        <span className="truncate">{element.name}</span>
                                                        <span className="text-[10px] font-bold tabular-nums text-[var(--lt-text-muted)]" title={`${element.count} ${element.count === 1 ? 'reseña' : 'reseñas'}`}>
                                                            {element.count}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                            {hiddenElementsCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAllElements(true)}
                                                    className="px-3 py-2 rounded-full border border-white/10 text-sm font-semibold text-[var(--lt-text-muted)] hover:text-white"
                                                >
                                                    +{hiddenElementsCount} más
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                aria-pressed={showItemNameInput}
                                                onClick={() => {
                                                    if (chosenElement) setItemName('');
                                                    setWriteNewItem(true);
                                                }}
                                                className={`px-3 py-2 rounded-full border border-dashed text-sm font-semibold transition-colors ${showItemNameInput
                                                    ? 'border-[var(--lt-accent-border)] text-[var(--lt-accent)]'
                                                    : 'border-white/20 text-gray-400 hover:text-white'}`}
                                            >
                                                ＋ Otro
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {showItemNameInput && (
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={itemName}
                                        onChange={e => setItemName(e.target.value)}
                                        maxLength={150}
                                        placeholder="Ej: Pizza Margherita, Tacos al pastor..."
                                        autoFocus={writeNewItem}
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
                                )}
                            </div>

                            {sameElementReview && (
                                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                                    <span className="min-w-0 flex-1">
                                        ✋ Ya valoraste <strong>{sameElementReview.itemName || itemName.trim()}</strong> aquí. Solo cabe una reseña por plato.
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => { setError(null); setEditReviewId(sameElementReview.id); }}
                                        className="shrink-0 rounded-full bg-amber-400/20 px-3 py-1.5 text-xs font-bold text-amber-50 hover:bg-amber-400/30"
                                    >
                                        ✏️ Editar la mía
                                    </button>
                                </div>
                            )}

                            {/* ── Sección: Reseña ─────────────────── */}
                            {criteriaLoaded && hasComputingCriteria ? (
                                <div className="rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] p-4 space-y-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--lt-accent)] flex items-center gap-1.5">
                                            <span aria-hidden>⭐</span> Reseña <HelpTip topic="nota" />
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
                                                weight={criterionWeight(criterion, scoringOptions)}
                                                onChange={(value) => setCriterionScore(criterion.id, value)}
                                            />
                                        ))}
                                    </div>

                                    {/* La opinión, justo después de las notas que cuentan */}
                                    <div className="border-t border-[var(--lt-border)] pt-5">{opinionBlock}</div>

                                    {aptBlock}

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

                            {/* ── Sección: Tu opinión (si la lista no tiene criterios que cuenten) ── */}
                            {!(criteriaLoaded && hasComputingCriteria) && (
                                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">{opinionBlock}</div>
                            )}
                            {!(criteriaLoaded && hasComputingCriteria) && aptBlock}

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
                                disabled={loading || !isValid || (!isNew && !isDirty) || Boolean(sameElementReview)}
                                className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]
                                ${loading || !isValid || (!isNew && !isDirty) || sameElementReview
                                        ? 'bg-white/5 border border-white/5 text-gray-500 cursor-not-allowed'
                                        : 'btn-primary'
                                    }`}
                            >
                                {loading
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                                    : isNew ? '✨ Publicar reseña' : '💾 Guardar Cambios'
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

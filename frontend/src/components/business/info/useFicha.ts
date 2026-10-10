import { useCallback, useEffect, useRef, useState } from 'react';
import {
    getBusinessInfoForManager,
    updateBusinessInfoSection,
    type BusinessInfoSectionsResponse,
} from '../../../services/BusinessInfoService';
import { useToast } from '../../../context/ToastContext';
import type { BusinessInfoDocument, BusinessInfoSection, BusinessSectionData } from '../../../types/businessInfo';
import { businessErrorCopy, type BusinessErrorCopy } from '../kit/errors';
import {
    adjustedFields,
    buildSavePayload,
    emptySections,
    joinSpanish,
    normalizeSections,
    sectionDirty,
    sectionInvalidReason,
    type FichaSections,
} from './fichaModel';
import { SECTION_ORDER, firstIncompleteSection } from './sectionMeta';

// Estado de la Ficha (spec §5.3): copia guardada (`saved`) y borrador (`draft`)
// por sección. Guardar solo con cambios (cuota de 30 al día), y después se lee
// otra vez del servidor para enseñar lo que de verdad quedó guardado.

export type FichaLoadStatus = 'loading' | 'error' | 'ready';

interface FichaModel {
    saved: FichaSections;
    draft: FichaSections;
}

type SectionMap<T> = Partial<Record<BusinessInfoSection, T>>;

const withSection = (sections: FichaSections, doc: BusinessInfoDocument): FichaSections => ({
    ...sections,
    [doc.section]: doc,
});

export interface SaveOptions {
    /** Guardar aunque no haya cambios: la primera vez, para marcar «revisado». */
    allowClean?: boolean;
}

/**
 * @param initialInfo Respuesta de getBusinessInfoForManager que ya tenga la
 *   página: se usa al montar y no se vuelve a pedir. Sin ella, se carga aquí.
 */
export function useFicha(placeId: string, initialInfo?: BusinessInfoSectionsResponse | null) {
    const { showToast } = useToast();
    // Solo cuenta lo que llega al montar (luego la Ficha manda en sus datos).
    const [preloaded] = useState(() => (initialInfo ? normalizeSections(initialInfo) : null));
    const [status, setStatus] = useState<FichaLoadStatus>(preloaded ? 'ready' : 'loading');
    const [model, setModel] = useState<FichaModel>(() => {
        const sections = preloaded ?? emptySections();
        return { saved: sections, draft: sections };
    });
    const [initialSection, setInitialSection] = useState<BusinessInfoSection>(() => (
        (preloaded && firstIncompleteSection(preloaded)) || 'identity'
    ));
    const [saving, setSaving] = useState<BusinessInfoSection | null>(null);
    const [reloading, setReloading] = useState(false);
    const [errors, setErrors] = useState<SectionMap<BusinessErrorCopy>>({});
    /** Sube al descartar, guardar o recargar: los formularios se montan de nuevo (estado local limpio). */
    const [resets, setResets] = useState<SectionMap<number>>({});
    const [savedInSession, setSavedInSession] = useState(false);
    const requestRef = useRef(0);
    const mountedRef = useRef(true);
    /** El último estado pintado (para decidir al recargar qué borradores se conservan). */
    const modelRef = useRef(model);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        modelRef.current = model;
    }, [model]);

    const bump = (sections: BusinessInfoSection[]) => setResets((prev) => {
        const next = { ...prev };
        sections.forEach((section) => {
            next[section] = (next[section] || 0) + 1;
        });
        return next;
    });

    const clearError = useCallback((section: BusinessInfoSection) => {
        setErrors((prev) => {
            if (!prev[section]) return prev;
            const next = { ...prev };
            delete next[section];
            return next;
        });
    }, []);

    const showToastRef = useRef(showToast);
    useEffect(() => {
        showToastRef.current = showToast;
    }, [showToast]);

    /**
     * initial: todo lo del servidor. reload: lo guardado se pone al día en
     * todas las secciones (versiones incluidas); el borrador vuelve a lo del
     * servidor en `target` y en las que no tenían cambios, y las demás
     * conservan lo que se estaba escribiendo.
     */
    const fetchInfo = useCallback(async (mode: 'initial' | 'reload', target?: BusinessInfoSection) => {
        requestRef.current += 1;
        const request = requestRef.current;
        try {
            const info = await getBusinessInfoForManager(placeId);
            if (!mountedRef.current || request !== requestRef.current) return;
            const sections = normalizeSections(info);
            const current = modelRef.current;
            const replaced = mode === 'initial'
                ? SECTION_ORDER
                : SECTION_ORDER.filter((section) => section === target || !sectionDirty(current.saved[section], current.draft[section]));
            setModel((prev) => {
                let draft = prev.draft;
                replaced.forEach((section) => {
                    draft = withSection(draft, sections[section]);
                });
                return { saved: sections, draft };
            });
            setErrors({});
            setResets((prev) => {
                const next = { ...prev };
                replaced.forEach((section) => {
                    next[section] = (next[section] || 0) + 1;
                });
                return next;
            });
            if (mode === 'initial') setInitialSection(firstIncompleteSection(sections) || 'identity');
            setStatus('ready');
        } catch (error) {
            if (!mountedRef.current || request !== requestRef.current) return;
            console.error('BusinessInfoTab: load failed', error);
            if (mode === 'initial') setStatus('error');
            else showToastRef.current({ variant: 'error', title: '😕 No se pudo recargar', message: 'Inténtalo de nuevo en un momento.' });
        } finally {
            if (mode === 'reload' && mountedRef.current && request === requestRef.current) setReloading(false);
        }
    }, [placeId]);

    useEffect(() => {
        if (preloaded) return;
        void fetchInfo('initial');
    }, [fetchInfo, preloaded]);

    /** Tras un error de carga. */
    const retry = () => {
        setStatus('loading');
        void fetchInfo('initial');
    };

    /**
     * «Recargar» tras «Alguien cambió estos datos»: `section` vuelve a lo del
     * servidor; las otras secciones con cambios los conservan.
     */
    const reload = (section?: BusinessInfoSection) => {
        setReloading(true);
        void fetchInfo('reload', section);
    };

    const updateData = useCallback(<S extends BusinessInfoSection>(section: S, patch: Partial<BusinessSectionData[S]>) => {
        setModel((prev) => {
            const current = prev.draft[section] as BusinessInfoDocument<S>;
            return {
                ...prev,
                draft: withSection(prev.draft, { ...current, data: { ...current.data, ...patch } } as BusinessInfoDocument),
            };
        });
    }, []);

    const setHidden = useCallback((section: BusinessInfoSection, field: string, hidden: boolean) => {
        setModel((prev) => {
            const current = prev.draft[section];
            const set = new Set(current.hiddenFields || []);
            if (hidden) set.add(field);
            else set.delete(field);
            return { ...prev, draft: withSection(prev.draft, { ...current, hiddenFields: Array.from(set) }) };
        });
    }, []);

    /** El borrador de estas secciones vuelve a lo guardado. */
    const discard = useCallback((sections: BusinessInfoSection | BusinessInfoSection[]) => {
        const list = Array.isArray(sections) ? sections : [sections];
        if (list.length === 0) return;
        setModel((prev) => {
            let draft = prev.draft;
            list.forEach((section) => {
                draft = withSection(draft, prev.saved[section]);
            });
            return { ...prev, draft };
        });
        bump(list);
        list.forEach(clearError);
    }, [clearError]);

    const save = async (section: BusinessInfoSection, options: SaveOptions = {}): Promise<boolean> => {
        if (saving) return false;
        const savedDoc = model.saved[section];
        const draftDoc = model.draft[section];
        if (!sectionDirty(savedDoc, draftDoc) && !options.allowClean) return false;
        if (sectionInvalidReason(draftDoc)) return false;

        const payload = buildSavePayload(draftDoc);
        setSaving(section);
        clearError(section);
        try {
            const result = await updateBusinessInfoSection({
                placeId,
                section,
                data: payload.data,
                hiddenFields: payload.hiddenFields,
                version: savedDoc.version,
            });
            // Lo que de verdad quedó guardado (el servidor limpia y completa).
            let serverDoc: BusinessInfoDocument | null = null;
            try {
                serverDoc = normalizeSections(await getBusinessInfoForManager(placeId))[section];
            } catch (error) {
                console.warn('BusinessInfoTab: refetch after save failed', error);
            }
            if (!mountedRef.current) return true;
            const nextDoc: BusinessInfoDocument = serverDoc ?? {
                ...draftDoc,
                data: payload.data,
                hiddenFields: payload.hiddenFields,
                version: typeof result?.version === 'number' ? result.version : savedDoc.version + 1,
            } as BusinessInfoDocument;
            setModel((prev) => ({ saved: withSection(prev.saved, nextDoc), draft: withSection(prev.draft, nextDoc) }));
            bump([section]);
            setSavedInSession(true);
            showToast({ variant: 'success', title: '✅ Guardado', message: 'Ya se ve en tu ficha.' });
            if (serverDoc) {
                const adjusted = adjustedFields(section, payload.data, serverDoc.data);
                if (adjusted.length > 0) {
                    showToast({
                        variant: 'info',
                        title: '⚠️ Hemos ajustado algunos datos',
                        message: `Revisa ${joinSpanish(adjusted)}.`,
                        durationMs: 7000,
                    });
                }
            }
            return true;
        } catch (error) {
            console.error('BusinessInfoTab: save failed', error);
            if (mountedRef.current) setErrors((prev) => ({ ...prev, [section]: businessErrorCopy(error) }));
            return false;
        } finally {
            if (mountedRef.current) setSaving(null);
        }
    };

    return {
        status,
        saved: model.saved,
        draft: model.draft,
        initialSection,
        saving,
        reloading,
        errors,
        resets,
        savedInSession,
        retry,
        reload,
        updateData,
        setHidden,
        discard,
        save,
        clearError,
    };
}

export type FichaState = ReturnType<typeof useFicha>;

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc as firestoreDoc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import type { BusinessInfoSectionsResponse } from '../../../services/BusinessInfoService';
import type { BusinessInfoDocument, BusinessInfoSection } from '../../../types/businessInfo';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Skeleton } from '../../Skeleton';
import {
    PanelError,
    ProgressMeter,
    SectionHeader,
    SoftCard,
    StatusPill,
    StickySaveBar,
    kit,
    prefersReducedMotion,
    useCelebrateOnce,
    useReportDirty,
} from '../kit';
import { REVIEWED_ON_SAVE, sectionDirty, sectionInvalidReason } from './fichaModel';
import type { FichaFormContext } from './formTypes';
import { fichaPlaceInfoFromDoc, type FichaPlaceInfo } from './placeInfo';
import { SectionForm } from './SectionForm';
import { SectionNavList, SectionOverviewCards } from './SectionNavList';
import {
    SECTION_META,
    SECTION_ORDER,
    SECTION_STATUS_META,
    completionPercent,
    firstIncompleteSection,
    sectionStatus,
} from './sectionMeta';
import { useFicha, type FichaState } from './useFicha';
import { useIsDesktop } from './useMediaQuery';

export interface BusinessInfoTabProps {
    placeId: string;
    /**
     * Datos de Google del lugar (nombre, teléfono y web) para los placeholders y
     * «Google muestra: …». Si no se pasa, se leen de `places/{placeId}`.
     */
    place?: FichaPlaceInfo | null;
    /**
     * Respuesta de getBusinessInfoForManager si la página ya la tiene: se usa
     * al montar y no se pide otra vez. Sin ella, la Ficha la carga sola.
     */
    initialInfo?: BusinessInfoSectionsResponse | null;
    /** Cambiar a otra pestaña de la gestión (la página ya pregunta si hay cambios). Sin él, se cambia `?tab=`. */
    onGoToTab?: (tab: 'items') => void;
}

const LEGAL_LINE = 'Al guardar confirmas que es correcto y actual.';

const parseSection = (value: string | null): BusinessInfoSection | null => (
    value && (SECTION_ORDER as string[]).includes(value) ? value as BusinessInfoSection : null
);

const sectionLabel = (section: BusinessInfoSection) => `${SECTION_META[section].emoji} ${SECTION_META[section].title}`;

const levelFor = (percent: number): string => {
    if (percent >= 100) return '🏆 Completa';
    if (percent >= 70) return '🚀 Casi lista';
    if (percent >= 30) return '🛠️ En marcha';
    return '🌱 Empezando';
};

/** Teléfono, web y nombre de Google: los que pasa la página o, si no, del documento del lugar. */
const usePlaceGoogleInfo = (placeId: string, place: FichaPlaceInfo | null | undefined): FichaPlaceInfo | null => {
    const [loaded, setLoaded] = useState<FichaPlaceInfo | null>(null);
    const needsFetch = place === undefined;
    useEffect(() => {
        if (!needsFetch) return;
        let cancelled = false;
        getDoc(firestoreDoc(db, 'places', placeId))
            .then((snap) => {
                if (!cancelled && snap.exists()) setLoaded(fichaPlaceInfoFromDoc(snap.data() as Record<string, unknown>));
            })
            .catch((error) => console.warn('BusinessInfoTab: place info failed', error));
        return () => {
            cancelled = true;
        };
    }, [placeId, needsFetch]);
    return needsFetch ? loaded : place ?? null;
};

const FichaSkeleton: React.FC<{ desktop: boolean }> = ({ desktop }) => (
    <div aria-busy="true" aria-label="Cargando tu ficha" className={desktop ? 'grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]' : 'space-y-5'}>
        <SoftCard className="space-y-3 p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <div className="flex gap-1.5">{Array.from({ length: 10 }, (_, index) => <Skeleton key={index} variant="circular" className="h-8 w-8" />)}</div>
        </SoftCard>
        <div className={desktop ? 'space-y-4' : 'grid gap-3 sm:grid-cols-2'}>
            {Array.from({ length: desktop ? 2 : 6 }, (_, index) => (
                <SoftCard key={index} className="space-y-3 p-4">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-2xl" />
                        <Skeleton className="h-5 w-1/2" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    {desktop && <Skeleton className="h-24 w-full" />}
                </SoftCard>
            ))}
        </div>
    </div>
);

/** «👌 ¿Nada de esto aplica?»: guardar vacío para que cuente como revisada (solo la primera vez). */
const ReviewedEmptyNote: React.FC<{ onSave: () => void; saving: boolean }> = ({ onSave, saving }) => (
    <div className={cn(kit.inset, 'flex flex-wrap items-center gap-3 p-3')}>
        <span aria-hidden="true" className="text-2xl leading-none">👌</span>
        <p className="min-w-0 flex-1 text-sm text-[var(--lt-text-muted)]">
            <span className="font-semibold text-[var(--lt-text)]">¿Nada de esto aplica a tu local?</span> Guárdalo así y contará como revisado.
        </p>
        <Button
            variant="secondary"
            onClick={onSave}
            loading={saving}
            className="min-h-11 border-[var(--lt-border-strong)] bg-[var(--lt-glass)] hover:bg-[var(--lt-accent-soft)]"
        >
            Guardar así
        </Button>
    </div>
);

const PrevNext: React.FC<{ section: BusinessInfoSection; onGo: (section: BusinessInfoSection) => void }> = ({ section, onGo }) => {
    const index = SECTION_ORDER.indexOf(section);
    const prev = index > 0 ? SECTION_ORDER[index - 1] : null;
    const next = index < SECTION_ORDER.length - 1 ? SECTION_ORDER[index + 1] : null;
    const linkClass = cn('inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-[var(--lt-text-muted)] hover:bg-[var(--lt-glass)] hover:text-[var(--lt-text)]', kit.focus);
    return (
        <nav aria-label="Otras secciones" className="flex items-center justify-between gap-3 border-t border-[var(--lt-border)] pt-3">
            {prev ? (
                <button type="button" className={linkClass} onClick={() => onGo(prev)}>
                    ← <span aria-hidden="true">{SECTION_META[prev].emoji}</span> {SECTION_META[prev].title}
                </button>
            ) : <span />}
            {next ? (
                <button type="button" className={cn(linkClass, 'text-right')} onClick={() => onGo(next)}>
                    <span aria-hidden="true">{SECTION_META[next].emoji}</span> {SECTION_META[next].title} →
                </button>
            ) : <span />}
        </nav>
    );
};

/** El formulario de una sección con su aviso de «revisado», anterior/siguiente y (opcional) su barra de guardar. */
const SectionEditorBody: React.FC<{
    section: BusinessInfoSection;
    ficha: FichaState;
    ctx: FichaFormContext;
    onGo: (section: BusinessInfoSection) => void;
}> = ({ section, ficha, ctx, onGo }) => {
    const saved = ficha.saved[section] as BusinessInfoDocument;
    const dirty = sectionDirty(saved, ficha.draft[section] as BusinessInfoDocument);
    const isSaving = ficha.saving === section;
    return (
        <div className="space-y-6">
            <fieldset disabled={isSaving} className="m-0 min-w-0 border-0 p-0">
                <SectionForm
                    key={`${section}:${ficha.resets[section] || 0}`}
                    section={section}
                    draft={ficha.draft}
                    onChange={ficha.updateData}
                    onHiddenChange={ficha.setHidden}
                    ctx={ctx}
                />
            </fieldset>
            {REVIEWED_ON_SAVE.has(section) && saved.version === 0 && !dirty && (
                <ReviewedEmptyNote saving={isSaving} onSave={() => void ficha.save(section, { allowClean: true })} />
            )}
            <PrevNext section={section} onGo={onGo} />
        </div>
    );
};

const SectionSaveBar: React.FC<{ section: BusinessInfoSection; ficha: FichaState; placement: 'sticky' | 'footer' }> = ({ section, ficha, placement }) => {
    const draft = ficha.draft[section] as BusinessInfoDocument;
    const dirty = sectionDirty(ficha.saved[section] as BusinessInfoDocument, draft);
    const error = ficha.errors[section];
    return (
        <StickySaveBar
            placement={placement}
            dirty={dirty}
            saving={ficha.saving === section}
            error={error?.message}
            errorAction={error?.action === 'reload'
                ? { label: ficha.reloading ? 'Recargando…' : 'Recargar', onClick: () => ficha.reload(section) }
                : undefined}
            invalidReason={dirty ? sectionInvalidReason(draft) ?? undefined : undefined}
            onSave={() => void ficha.save(section)}
            onDiscard={() => ficha.discard(section)}
            legal={LEGAL_LINE}
        />
    );
};

const BusinessInfoTabView: React.FC<BusinessInfoTabProps> = ({ placeId, place, initialInfo, onGoToTab }) => {
    const ficha = useFicha(placeId, initialInfo);
    const isDesktop = useIsDesktop();
    const confirm = useConfirm();
    const { showToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const googleInfo = usePlaceGoogleInfo(placeId, place);
    const editorRef = useRef<HTMLElement>(null);
    const titleId = useId();

    const requested = parseSection(searchParams.get('section'));
    const activeSection = requested ?? ficha.initialSection;
    const ready = ficha.status === 'ready';

    const dirtyBySection = useMemo(() => Object.fromEntries(SECTION_ORDER.map((section) => [
        section,
        sectionDirty(ficha.saved[section] as BusinessInfoDocument, ficha.draft[section] as BusinessInfoDocument),
    ])) as Record<BusinessInfoSection, boolean>, [ficha.saved, ficha.draft]);
    const dirtySections = SECTION_ORDER.filter((section) => dirtyBySection[section]);

    // Para el aviso al cambiar de pestaña o cerrar la página (BusinessDirtyProvider de la página).
    useReportDirty('ficha', dirtySections.length > 0, dirtySections.map(sectionLabel).join(', '), () => ficha.discard(dirtySections));

    const percent = completionPercent(ficha.saved);
    useCelebrateOnce(`ficha:${placeId}`, ready && ficha.savedInSession && percent === 100, () => showToast({
        variant: 'success',
        title: '🏆 ¡Ficha completa!',
        message: 'Tu local aparece con toda la información.',
        durationMs: 5000,
    }));

    /** Antes de dejar una sección con cambios: «¿Salir sin guardar?». «Salir» descarta. */
    const confirmLeaveSection = async (section: BusinessInfoSection | null): Promise<boolean> => {
        if (!section || !dirtyBySection[section]) return true;
        const ok = await confirm({
            title: '¿Salir sin guardar?',
            message: `Perderás los cambios en ${sectionLabel(section)}.`,
            confirmLabel: 'Salir',
            cancelLabel: 'Seguir editando',
            destructive: true,
        });
        if (ok) ficha.discard(section);
        return ok;
    };

    const setSectionParam = (section: BusinessInfoSection | null) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (section) next.set('section', section);
            else next.delete('section');
            return next;
        }, { replace: true });
    };

    const scrollToEditor = () => {
        const element = editorRef.current;
        if (!element || typeof element.getBoundingClientRect !== 'function') return;
        const top = element.getBoundingClientRect().top;
        // Solo si el principio del editor se ha quedado por encima de la pantalla.
        if (top >= 0) return;
        window.scrollTo({ top: window.scrollY + top - 160, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    };

    const current = isDesktop ? activeSection : requested;

    const openSection = async (section: BusinessInfoSection) => {
        if (section === current) return;
        if (!(await confirmLeaveSection(current))) return;
        if (current) ficha.clearError(current);
        setSectionParam(section);
        if (isDesktop) scrollToEditor();
    };

    const closeModal = async () => {
        if (!requested) return;
        if (!(await confirmLeaveSection(requested))) return;
        ficha.clearError(requested);
        setSectionParam(null);
    };

    const goToCarta = async () => {
        if (onGoToTab) {
            onGoToTab('items');
            return;
        }
        for (const section of dirtySections) {
            if (!(await confirmLeaveSection(section))) return;
        }
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', 'items');
            next.delete('section');
            return next;
        }, { replace: true });
    };

    const ctx: FichaFormContext = {
        placeId,
        placeName: googleInfo?.name,
        googlePhone: googleInfo?.phone,
        googleWebsite: googleInfo?.website,
        goToSection: (section) => void openSection(section),
        goToCarta: () => void goToCarta(),
    };

    if (ficha.status === 'loading') return <FichaSkeleton desktop={isDesktop} />;
    if (ficha.status === 'error') {
        return (
            <PanelError
                what="tu ficha"
                detail="Comprueba que sigues siendo gestor del negocio o inténtalo de nuevo."
                onRetry={ficha.retry}
            />
        );
    }

    const nextSection = firstIncompleteSection(ficha.saved);
    const progress = (
        <ProgressMeter
            compact={isDesktop}
            value={percent}
            title={<><span aria-hidden="true">🎯 </span>Tu ficha está al {`${percent}\u00A0%`}</>}
            // En la columna estrecha de escritorio el nivel no cabe junto al título.
            level={isDesktop ? undefined : levelFor(percent)}
            dots={SECTION_ORDER.map((section) => ({
                emoji: SECTION_META[section].emoji,
                label: SECTION_META[section].title,
                done: sectionStatus(ficha.saved[section] as BusinessInfoDocument) === 'complete',
            }))}
            next={nextSection ? (
                <button
                    type="button"
                    onClick={() => void openSection(nextSection)}
                    className={cn('rounded text-left font-semibold text-[var(--lt-accent)] underline-offset-4 hover:underline', kit.focus)}
                >
                    <span aria-hidden="true">{SECTION_META[nextSection].emoji} </span>
                    {SECTION_META[nextSection].title}: {SECTION_META[nextSection].nudge}
                </button>
            ) : undefined}
        />
    );

    if (isDesktop) {
        const meta = SECTION_META[activeSection];
        const status = SECTION_STATUS_META[sectionStatus(ficha.saved[activeSection] as BusinessInfoDocument)];
        return (
            <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="h-fit lg:sticky lg:top-36">
                    <SoftCard className="space-y-5 p-4 lg:max-h-[calc(100vh_-_10rem)] lg:overflow-y-auto">
                        {progress}
                        <SectionNavList saved={ficha.saved} dirty={dirtyBySection} active={activeSection} onSelect={(section) => void openSection(section)} />
                    </SoftCard>
                </aside>
                <SoftCard as="section" ref={editorRef} aria-labelledby={titleId} className="min-w-0 space-y-6 p-5 sm:p-6">
                    <SectionHeader
                        id={titleId}
                        emoji={meta.emoji}
                        title={meta.title}
                        help={meta.help}
                        right={<StatusPill emoji={status.emoji} label={status.label} tone={status.tone} />}
                    />
                    <SectionEditorBody section={activeSection} ficha={ficha} ctx={ctx} onGo={(section) => void openSection(section)} />
                    <SectionSaveBar section={activeSection} ficha={ficha} placement="sticky" />
                </SoftCard>
            </div>
        );
    }

    const modalMeta = requested ? SECTION_META[requested] : null;
    return (
        <div className="space-y-5">
            <SoftCard className="p-4">{progress}</SoftCard>
            <SectionOverviewCards saved={ficha.saved} dirty={dirtyBySection} onSelect={(section) => void openSection(section)} />
            <Modal
                isOpen={Boolean(requested)}
                onClose={() => void closeModal()}
                size="lg"
                title={modalMeta ? <span><span aria-hidden="true">{modalMeta.emoji} </span>{modalMeta.title}</span> : undefined}
                footer={requested ? <SectionSaveBar section={requested} ficha={ficha} placement="footer" /> : undefined}
            >
                {requested && modalMeta && (
                    <div className="space-y-5">
                        <p className="text-sm text-[var(--lt-text-muted)]">{modalMeta.help}</p>
                        <SectionEditorBody section={requested} ficha={ficha} ctx={ctx} onGo={(section) => void openSection(section)} />
                    </div>
                )}
            </Modal>
        </div>
    );
};

/**
 * 📝 Ficha (pestaña `general` de la gestión del negocio).
 *
 *   <BusinessInfoTab placeId={placeId} />
 *   <BusinessInfoTab placeId={placeId} place={fichaPlaceInfoFromDoc(placeData)}
 *     initialInfo={infoYaCargada} onGoToTab={goToTab} />
 *
 * Carga (si no recibe `initialInfo`) y guarda sola (getBusinessInfoForManager /
 * updateBusinessInfoSection).
 * Necesita ToastProvider y ConfirmProvider (App) y, para avisar al cambiar de
 * pestaña, un BusinessDirtyProvider por encima (clave «ficha»). Lee y escribe
 * `?section=` en la URL.
 */
export const BusinessInfoTab: React.FC<BusinessInfoTabProps> = (props) => <BusinessInfoTabView key={props.placeId} {...props} />;

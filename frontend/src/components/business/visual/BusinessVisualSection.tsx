/**
 * 🎨 Imagen: «Tu escaparate en Listopic» (spec §6).
 *
 * Cuatro pasos (📸 portada, 💬 frase, 🎨 color, 🖌️ estilo) con la cabecera
 * pública real al lado (o arriba en móvil). Se guarda todo junto con
 * «Guardar y publicar», comparando con lo último guardado; lo que se ve
 * después es lo que devolvió el servidor. Si la carga falla no hay formulario
 * (un guardado con datos vacíos borraría la portada, la frase y el color).
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { useConfirm } from '../../../context/ConfirmContext';
import { cn } from '../../../lib/utils';
import {
    EMPTY_VISUAL_DATA,
    getBusinessVisual,
    updateBusinessVisual,
    uploadBusinessHeroImage,
    type BusinessVisualData,
} from '../../../services/BusinessProService';
import { Skeleton } from '../../Skeleton';
import { Button } from '../../ui/Button';
import {
    PanelError,
    SectionHeader,
    SoftCard,
    StickySaveBar,
    businessErrorCopy,
    isDeepEqual,
    kit,
    prefersReducedMotion,
    useCelebrateOnce,
    useDirtyState,
    useReportDirty,
    type BusinessErrorCopy,
} from '../kit';
import { ColorStep, type ColorMode } from './ColorStep';
import { CoverStep } from './CoverStep';
import { PhraseStep } from './PhraseStep';
import { ShowcasePreview } from './ShowcasePreview';
import { StepCard } from './StepCard';
import { StyleStep } from './StyleStep';
import { MAX_UPLOAD_BYTES, uploadErrorCopy } from './coverMedia';
import { useMediaQuery } from './useMediaQuery';
import { usePlaceShowcase } from './usePlaceShowcase';
import {
    CUSTOM_COLOR,
    HEX_ERROR,
    VISUAL_STEPS,
    colorChoiceOf,
    countStepsDone,
    isStandardLook,
    normalizeHex,
    stepSummary,
    visualStepsDone,
    type VisualStepId,
} from './visualMeta';

export interface BusinessVisualSectionProps {
    placeId: string;
    placeName?: string;
    /** La foto que enseña la ficha sin portada. Si no llega, se busca (doc del lugar y sus fotos). */
    fallbackPhotoUrl?: string;
    /** Tras publicar, con lo que guardó el servidor (la página refresca la miniatura de la cabecera). */
    onSaved?: (data: BusinessVisualData) => void;
}

type LoadStatus = 'loading' | 'error' | 'ready';

interface ColorUi {
    mode: ColorMode;
    hexText: string;
    touched: boolean;
}

const colorUiFor = (accentColor: string): ColorUi => {
    const custom = colorChoiceOf(accentColor) === CUSTOM_COLOR;
    return { mode: custom ? 'custom' : 'swatch', hexText: custom ? accentColor : '', touched: false };
};

const firstOpenStep = (data: BusinessVisualData): VisualStepId => {
    const done = visualStepsDone(data);
    return VISUAL_STEPS.find((step) => !done[step.id])?.id ?? 'cover';
};

const PUBLISHED_BANNER_MS = 4000;

export const BusinessVisualSection: React.FC<BusinessVisualSectionProps> = ({ placeId, placeName, fallbackPhotoUrl, onSaved }) => {
    const confirm = useConfirm();
    const showcase = usePlaceShowcase(placeId);
    const isDesktop = useMediaQuery('(min-width: 1024px)');
    const headingId = useId();

    const [status, setStatus] = useState<LoadStatus>('loading');
    const [attempt, setAttempt] = useState(0);
    const [saved, setSaved] = useState<BusinessVisualData>(EMPTY_VISUAL_DATA);
    const [draft, setDraft] = useState<BusinessVisualData>(EMPTY_VISUAL_DATA);
    const [colorUi, setColorUi] = useState<ColorUi>(() => colorUiFor(''));
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<BusinessErrorCopy | null>(null);
    const [published, setPublished] = useState(false);
    const [savedInSession, setSavedInSession] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
    const [openStep, setOpenStep] = useState<VisualStepId | null>('cover');
    const [previewOpen, setPreviewOpen] = useState(true);

    const sourceFilesRef = useRef(new Map<string, File>());
    const coverStartRef = useRef<HTMLButtonElement>(null);

    // ── Carga ──
    useEffect(() => {
        let cancelled = false;
        getBusinessVisual(placeId)
            .then((data) => {
                if (cancelled) return;
                setSaved(data);
                setDraft(data);
                setColorUi(colorUiFor(data.accentColor));
                setOpenStep(firstOpenStep(data));
                setStatus('ready');
            })
            .catch((error) => {
                console.error('BusinessVisualSection: load failed', error);
                if (!cancelled) setStatus('error');
            });
        return () => {
            cancelled = true;
        };
    }, [placeId, attempt]);

    // Reintentar la carga (o «Recargar» si otro cambió los datos): se parte de lo guardado.
    const retry = () => {
        setSaveError(null);
        setUploadError(null);
        setPublished(false);
        setStatus('loading');
        setAttempt((value) => value + 1);
    };

    // ── Borrador ──
    const { dirty } = useDirtyState(saved, draft);

    const patch = useCallback((changes: Partial<BusinessVisualData>) => {
        setDraft((prev) => ({ ...prev, ...changes }));
        setPublished(false);
    }, []);

    const resetTo = useCallback((data: BusinessVisualData) => {
        setDraft(data);
        setColorUi(colorUiFor(data.accentColor));
        setSaveError(null);
        setUploadError(null);
    }, []);

    const discard = useCallback(() => resetTo(saved), [resetTo, saved]);
    useReportDirty('visual', dirty, '🎨 Imagen', discard);

    // El aviso «¡Publicado!» se va solo a los 4 s (o al editar, en patch).
    useEffect(() => {
        if (!published) return;
        const timer = setTimeout(() => setPublished(false), PUBLISHED_BANNER_MS);
        return () => clearTimeout(timer);
    }, [published]);

    useCelebrateOnce(`visual:${placeId}`, status === 'ready' && savedInSession && countStepsDone(saved) === 4);

    // ── Portada ──
    const coverBroken = Boolean(draft.heroImageUrl) && brokenUrl === draft.heroImageUrl;
    const placePhoto = fallbackPhotoUrl || showcase.photoUrl;
    const heroImage = draft.heroImageUrl && !coverBroken ? draft.heroImageUrl : placePhoto;

    const onCoverError = useCallback((url: string) => setBrokenUrl(url), []);

    const upload = async (blob: Blob, source: File) => {
        // Storage no acepta fotos de 10 MB o más (storage.rules).
        if (blob.size >= MAX_UPLOAD_BYTES) {
            setUploadError('📦 Esta foto pesa demasiado (10 MB como máximo). Recórtala más o prueba con otra.');
            return;
        }
        setUploading(true);
        setUploadError(null);
        try {
            const url = await uploadBusinessHeroImage(placeId, blob);
            sourceFilesRef.current.set(url, source);
            patch({ heroImageUrl: url });
        } catch (error) {
            console.error('BusinessVisualSection: upload failed', error);
            setUploadError(uploadErrorCopy(error));
        } finally {
            setUploading(false);
        }
    };

    // ── Color ──
    const pickSwatch = (value: string) => {
        setColorUi({ mode: 'swatch', hexText: '', touched: false });
        patch({ accentColor: value });
    };
    const pickCustom = () => {
        setColorUi((prev) => (prev.mode === 'custom' ? prev : { mode: 'custom', hexText: draft.accentColor, touched: false }));
    };
    const typeHex = (text: string) => {
        setColorUi((prev) => ({ ...prev, mode: 'custom', hexText: text }));
        const hex = normalizeHex(text);
        if (hex) patch({ accentColor: hex });
    };
    const blurHex = () => {
        setColorUi((prev) => {
            const hex = normalizeHex(prev.hexText);
            return { ...prev, touched: true, hexText: hex ?? prev.hexText };
        });
    };

    // ── Guardar ──
    const invalidReason = uploading
        ? 'Espera a que termine de subir tu portada'
        : colorUi.mode === 'custom' && !normalizeHex(colorUi.hexText)
            ? (colorUi.hexText.trim() ? HEX_ERROR : 'Escribe tu color o elige una muestra')
            : coverBroken && draft.heroImageUrl !== saved.heroImageUrl
                ? 'Tu portada no se puede ver: cámbiala o quítala'
                : undefined;

    const save = async () => {
        if (!dirty || invalidReason || saving || status !== 'ready') return;
        const payload = draft;
        setSaving(true);
        setSaveError(null);
        try {
            const stored = (await updateBusinessVisual(placeId, payload)) ?? payload;
            setSaved(stored);
            // Lo que se ve es lo que guardó el servidor (salvo que se siguiera editando).
            setDraft((current) => (isDeepEqual(current, payload) ? stored : current));
            if (stored.accentColor !== payload.accentColor) setColorUi(colorUiFor(stored.accentColor));
            setPublished(true);
            setSavedInSession(true);
            onSaved?.(stored);
        } catch (error) {
            console.error('BusinessVisualSection: save failed', error);
            setSaveError(businessErrorCopy(error, '😕 No se pudo publicar. Inténtalo de nuevo.'));
        } finally {
            setSaving(false);
        }
    };

    const backToStandard = async () => {
        const ok = await confirm({
            title: '¿Volver al look estándar?',
            message: 'Se quitarán portada, frase, color y estilo. Se publica al guardar.',
            confirmLabel: 'Volver al estándar',
            cancelLabel: 'Seguir con el mío',
            destructive: true,
        });
        if (!ok) return;
        resetTo(EMPTY_VISUAL_DATA);
        setPublished(false);
    };

    const startWithCover = () => {
        setOpenStep('cover');
        requestAnimationFrame(() => {
            const target = coverStartRef.current;
            target?.scrollIntoView?.({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
            target?.focus({ preventScroll: true });
        });
    };

    // ── Pintar ──
    if (status === 'loading') return <VisualSkeleton />;

    if (status === 'error') {
        return (
            <section aria-labelledby={headingId} className="space-y-5">
                <SectionHeader as="h2" id={headingId} emoji="🎨" title="Tu escaparate en Listopic" />
                <PanelError what="tu escaparate" onRetry={retry} detail="No cambiamos nada hasta poder leer lo que tienes guardado." />
            </section>
        );
    }

    const done = visualStepsDone(draft);
    const doneCount = countStepsDone(draft);
    const name = placeName || showcase.name || 'Tu negocio';
    const firstTime = isStandardLook(saved) && isStandardLook(draft);
    const collapsible = !isDesktop;

    const progress = (
        <div className="flex items-center gap-2" aria-label={`${doneCount} de 4 pasos listos`} role="group">
            <ul className="flex gap-1" aria-hidden="true">
                {VISUAL_STEPS.map((step) => (
                    <li
                        key={step.id}
                        title={`${step.title}: ${done[step.id] ? 'listo' : 'pendiente'}`}
                        className={cn(
                            'grid h-7 w-7 place-items-center rounded-full border text-sm leading-none',
                            done[step.id]
                                ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]'
                                : 'border-[var(--lt-border)] bg-[var(--lt-glass)] opacity-60 grayscale',
                        )}
                    >
                        {step.emoji}
                    </li>
                ))}
            </ul>
            <span aria-hidden="true" className="whitespace-nowrap text-sm font-bold text-[var(--lt-text)]">
                {doneCount} de 4 listos{doneCount > 0 ? ' ✨' : ''}
            </span>
        </div>
    );

    const preview = (compact: boolean) => (
        <ShowcasePreview
            placeId={placeId}
            data={draft}
            name={name}
            address={showcase.address}
            rating={showcase.rating}
            imageUrl={heroImage}
            onImageError={() => {
                if (heroImage && heroImage === draft.heroImageUrl) onCoverError(heroImage);
            }}
            maxHeight={compact ? 210 : undefined}
            showTitle={!compact}
        />
    );

    const stepProps = (id: VisualStepId) => {
        const meta = VISUAL_STEPS.find((step) => step.id === id) ?? VISUAL_STEPS[0];
        return {
            id: `visual-step-${id}`,
            emoji: meta.emoji,
            title: meta.title,
            help: meta.help,
            done: done[id],
            summary: stepSummary(id, draft),
            collapsible,
            open: openStep === id,
            onToggle: () => setOpenStep((current) => (current === id ? null : id)),
        };
    };

    return (
        <section aria-labelledby={headingId} className="space-y-5">
            <SectionHeader
                as="h2"
                id={headingId}
                emoji="🎨"
                title="Tu escaparate en Listopic"
                help="Dale a tu página la cara de tu local. Lo que cambies aquí lo ves al momento."
            />
            <div className="sm:pl-[52px]">{progress}</div>

            {firstTime && (
                <SoftCard tone="accent" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--lt-text)]">
                        <span aria-hidden="true">✨ </span>
                        Tu página aún lleva el look estándar. En 2 minutos le das tu toque
                    </p>
                    <Button onClick={startWithCover} className="min-h-11 shrink-0" leftIcon={<span aria-hidden="true">📸</span>}>
                        Empezar por la portada
                    </Button>
                </SoftCard>
            )}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
                {!isDesktop && (
                    <SoftCard as="section" aria-label="Vista previa" className="p-3 sm:p-4">
                        <h3 className="m-0">
                            <button
                                type="button"
                                aria-expanded={previewOpen}
                                onClick={() => setPreviewOpen((open) => !open)}
                                className={cn('flex min-h-11 w-full items-center gap-2 rounded-xl px-1 text-left text-base font-black text-[var(--lt-text)]', kit.focus)}
                            >
                                <span aria-hidden="true">👁️</span>
                                <span className="flex-1">Vista previa</span>
                                <ChevronDown aria-hidden="true" className={cn('h-5 w-5 text-[var(--lt-text-muted)] transition-transform motion-reduce:transition-none', previewOpen && 'rotate-180')} />
                            </button>
                        </h3>
                        {previewOpen && <div className="mt-2">{preview(true)}</div>}
                    </SoftCard>
                )}

                <div className="min-w-0 space-y-4">
                    <StepCard {...stepProps('cover')}>
                        <CoverStep
                            value={draft.heroImageUrl}
                            onChange={(url) => {
                                setUploadError(null);
                                patch({ heroImageUrl: url });
                            }}
                            onUpload={(blob, source) => void upload(blob, source)}
                            uploading={uploading}
                            uploadError={uploadError}
                            broken={coverBroken}
                            onImageError={onCoverError}
                            getSourceFile={(url) => sourceFilesRef.current.get(url)}
                            photos={showcase.photos}
                            photosLoading={showcase.loading}
                            photosFailed={showcase.photosFailed}
                            placePhotoUrl={placePhoto}
                            startRef={coverStartRef}
                        />
                    </StepCard>

                    <StepCard {...stepProps('phrase')}>
                        <PhraseStep value={draft.heroText} onChange={(heroText) => patch({ heroText })} />
                    </StepCard>

                    <StepCard {...stepProps('color')}>
                        <ColorStep
                            value={draft.accentColor}
                            mode={colorUi.mode}
                            hexText={colorUi.hexText}
                            hexTouched={colorUi.touched}
                            onPickSwatch={pickSwatch}
                            onPickCustom={pickCustom}
                            onHexText={typeHex}
                            onHexBlur={blurHex}
                        />
                    </StepCard>

                    <StepCard {...stepProps('style')}>
                        <StyleStep
                            value={draft.visualStyle}
                            onChange={(visualStyle) => patch({ visualStyle })}
                            imageUrl={heroImage}
                            name={name}
                        />
                    </StepCard>

                    {!isStandardLook(draft) && (
                        <button
                            type="button"
                            onClick={() => void backToStandard()}
                            className={cn('min-h-11 rounded-lg px-1 text-sm font-semibold text-[var(--lt-text-muted)] underline-offset-4 hover:text-[var(--lt-text)] hover:underline', kit.focus)}
                        >
                            <span aria-hidden="true">↺ </span>Volver al look estándar de Listopic
                        </button>
                    )}

                    {published && !dirty ? (
                        <div className="sticky bottom-0 z-20 pb-[env(safe-area-inset-bottom)] pt-3">
                            <div
                                role="status"
                                className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-[var(--lt-success)]/40 bg-[var(--lt-card-strong)] px-4 py-3 text-sm font-semibold text-[var(--lt-text)] shadow-2xl"
                            >
                                <span className="min-w-0 flex-1">
                                    <span aria-hidden="true">🎉 </span>¡Publicado! Así te ven ya en Listopic
                                </span>
                                <a
                                    href={`/place/${encodeURIComponent(placeId)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 font-bold text-[var(--lt-success)] underline-offset-4 hover:underline', kit.focus)}
                                >
                                    Ver mi página
                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span className="sr-only">(se abre en otra pestaña)</span>
                                </a>
                            </div>
                        </div>
                    ) : (
                        <StickySaveBar
                            dirty={dirty}
                            saving={saving}
                            error={saveError?.message}
                            errorAction={saveError?.action === 'reload' ? { label: 'Recargar', onClick: retry } : undefined}
                            invalidReason={invalidReason}
                            onSave={() => void save()}
                            onDiscard={discard}
                            saveLabel={<><span aria-hidden="true">🚀 </span>Guardar y publicar</>}
                        />
                    )}
                </div>

                {isDesktop && (
                    <aside aria-label="Vista previa" className="lg:sticky lg:top-[calc(env(safe-area-inset-top)+9.5rem)]">
                        <SoftCard className="p-4">{preview(false)}</SoftCard>
                    </aside>
                )}
            </div>
        </section>
    );
};

const VisualSkeleton: React.FC = () => (
    <div aria-hidden="true" className="space-y-5">
        <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-2xl" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="space-y-4">
                {Array.from({ length: 4 }, (_, index) => (
                    <SoftCard key={index} className="space-y-3 p-4">
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-10 w-10 rounded-2xl" />
                            <Skeleton className="h-5 w-1/3" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                    </SoftCard>
                ))}
            </div>
            <Skeleton className="hidden aspect-[4/5] w-full rounded-2xl lg:block" />
        </div>
    </div>
);

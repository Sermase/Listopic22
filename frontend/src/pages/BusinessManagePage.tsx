import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Building2 } from 'lucide-react';
import { db } from '../firebase';
import { BUSINESS_PRO_ENFORCED } from '../config/features';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/utils';
import { placeRating, type PlaceRating } from '../lib/placeRating';
import { BusinessProUpsellCard, RequireBusinessPro, type BusinessProUpsellCopy } from '../components/RequireBusinessPro';
import { Skeleton } from '../components/Skeleton';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Tabs, type TabOption } from '../components/ui/Tabs';
import {
    formatPlanExpiry,
    getBusinessPlanFromPlace,
    PLAN_SOURCE_LABELS,
    type BusinessPlan,
} from '../utils/businessPlan';
import { getBusinessInfoForManager, type BusinessInfoSectionsResponse } from '../services/BusinessInfoService';
import { getBusinessVisual } from '../services/BusinessProService';
import {
    BusinessItemsSection,
    BusinessSponsoredSection,
    BusinessStatsSection,
    BusinessVisualSection,
} from '../components/business/BusinessProSections';
import { BusinessInfoTab, fichaPlaceInfoFromDoc, type FichaPlaceInfo } from '../components/business/info';
import {
    BusinessDirtyProvider,
    EmptyState,
    SoftCard,
    StatusPill,
    kit,
    prefersReducedMotion,
    toneClass,
    useLeaveGuard,
} from '../components/business/kit';

// ── Pestañas (los ids no cambian: ?tab=general|visual|items|sponsored|stats) ──

const BUSINESS_MANAGE_TABS = ['general', 'visual', 'items', 'sponsored', 'stats'] as const;
type BusinessManageTab = typeof BUSINESS_MANAGE_TABS[number];

const TAB_META: Record<BusinessManageTab, { emoji: string; label: string; pro: boolean; upsell?: BusinessProUpsellCopy }> = {
    general: { emoji: '📝', label: 'Ficha', pro: false },
    visual: {
        emoji: '🎨',
        label: 'Imagen',
        pro: true,
        upsell: { emoji: '🎨', title: 'Tu escaparate es de Business Pro', text: 'Pon tu portada, tu color y tu frase para que tu ficha se vea como tu local.' },
    },
    items: {
        emoji: '📖',
        label: 'Carta',
        pro: true,
        upsell: { emoji: '📖', title: 'Tu carta oficial es de Business Pro', text: 'Publica tus platos con precio y alérgenos, ordenados por secciones.' },
    },
    sponsored: {
        emoji: '📣',
        label: 'Promos',
        pro: true,
        upsell: { emoji: '📣', title: 'Las promos son de Business Pro', text: 'Crea ofertas y destaca tus platos. Siempre se muestran como patrocinadas.' },
    },
    stats: {
        emoji: '📊',
        label: 'Estadísticas',
        pro: true,
        upsell: { emoji: '📊', title: 'Tus estadísticas son de Business Pro', text: 'Mira cuánta gente visita tu ficha, de dónde llega y qué opina.' },
    },
};

const parseTab = (value: string | null): BusinessManageTab => (
    BUSINESS_MANAGE_TABS.includes(value as BusinessManageTab) ? value as BusinessManageTab : 'general'
);

/**
 * La URL al cambiar a `tab`: conserva el resto (impulsos, item…), añade `set`
 * y quita lo que solo vale en su pestaña: `section` (📝 Ficha) y `sub` (📣 Promos).
 */
const withTabParams = (prev: URLSearchParams, tab: BusinessManageTab, set: Record<string, string> = {}): URLSearchParams => {
    const next = new URLSearchParams(prev);
    next.set('tab', tab);
    Object.entries(set).forEach(([key, value]) => next.set(key, value));
    if (tab !== 'general') next.delete('section');
    if (tab !== 'sponsored') next.delete('sub');
    return next;
};

// ── Datos del lugar para la cabecera ──

type PlaceHeader = {
    name?: string;
    address?: string;
    mainImageUrl?: string;
    userPhotoUrl?: string;
    /** Tipos de Google: la Carta los usa para sugerir listas. */
    types?: string[];
    /** Nota pública del lugar (para 📊 Estadísticas). */
    rating: PlaceRating;
};

const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);

const placeHeaderFrom = (data: Record<string, unknown>): PlaceHeader => ({
    name: str(data.name),
    address: str(data.address) ?? str(data.formattedAddress),
    mainImageUrl: str(data.mainImageUrl),
    userPhotoUrl: str(data.userPhotoUrl),
    types: Array.isArray(data.types) ? data.types.filter((type): type is string => typeof type === 'string') : undefined,
    rating: placeRating(data),
});

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; place: PlaceHeader; plan: BusinessPlan; fichaPlace: FichaPlaceInfo };

// ── Piezas de la cabecera ──

const linkButtonClass = cn(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--lt-border-strong)] bg-[var(--lt-glass)] px-4 text-sm font-bold text-[var(--lt-text)] transition-colors hover:bg-[var(--lt-accent-soft)]',
    kit.focus,
);

/**
 * Enlace que, si hay cambios sin guardar en alguna pestaña, pregunta antes de
 * salir (la app usa BrowserRouter, así que no hay useBlocker).
 */
const GuardedLink: React.FC<{ to: string; className?: string; children: React.ReactNode }> = ({ to, className, children }) => {
    const { confirmLeave, dirty } = useLeaveGuard();
    const navigate = useNavigate();
    const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!dirty || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void confirmLeave().then((ok) => {
            if (ok) navigate(to);
        });
    };
    return <Link to={to} className={className} onClick={onClick}>{children}</Link>;
};

const BackLink: React.FC = () => (
    <GuardedLink
        to="/businesses"
        className={cn('-ml-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]', kit.focus)}
    >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Mis negocios
    </GuardedLink>
);

const HeaderThumb: React.FC<{ url: string }> = ({ url }) => {
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const showImage = Boolean(url) && failedUrl !== url;
    return (
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] text-[var(--lt-accent)] sm:size-18">
            {showImage ? (
                <img src={url} alt="" className="h-full w-full object-cover" onError={() => setFailedUrl(url)} />
            ) : (
                <Building2 className="h-8 w-8" aria-hidden="true" />
            )}
        </div>
    );
};

const ManageHeader: React.FC<{
    placeId: string;
    place: PlaceHeader;
    plan: BusinessPlan;
    thumbUrl: string;
    onOpenUpsell?: () => void;
}> = ({ placeId, place, plan, thumbUrl, onOpenUpsell }) => {
    const expiry = formatPlanExpiry(plan.expiresAt);
    const planDetail = plan.isPro && plan.source && plan.source !== 'stripe'
        ? `${PLAN_SOURCE_LABELS[plan.source]}${expiry ? ` hasta ${expiry}` : ''}`
        : null;
    return (
        <header className={cn(kit.surface, 'p-4 sm:p-5')}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center sm:gap-4">
                    <HeaderThumb url={thumbUrl} />
                    <div className="min-w-0 flex-1">
                        <h1 className="break-words text-xl font-black leading-tight text-[var(--lt-text)] sm:text-2xl">
                            {place.name || 'Tu negocio'}
                        </h1>
                        {place.address && <p className="mt-0.5 line-clamp-2 text-sm text-[var(--lt-text-muted)]">{place.address}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <StatusPill emoji="✅" label="Verificado" tone="success" />
                            {plan.isPro ? (
                                <>
                                    <StatusPill emoji="✨" label="Business Pro" tone="promo" />
                                    {planDetail && <span className="text-xs font-semibold text-[var(--lt-text-muted)]">{planDetail}</span>}
                                </>
                            ) : (
                                <StatusPill label="Plan gratuito" />
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:shrink-0 sm:flex-col sm:items-stretch">
                    {/* En móvil van en una fila si caben y, si no, una debajo de otra (nunca en dos líneas). */}
                    <GuardedLink to={`/place/${encodeURIComponent(placeId)}`} className={cn(linkButtonClass, 'grow whitespace-nowrap sm:grow-0')}>
                        <span aria-hidden="true">👀</span>
                        Ver mi ficha
                    </GuardedLink>
                    {onOpenUpsell && (
                        <Button
                            onClick={onOpenUpsell}
                            leftIcon={<span aria-hidden="true">✨</span>}
                            className="min-h-11 grow whitespace-nowrap sm:grow-0"
                        >
                            Probar Business Pro
                        </Button>
                    )}
                </div>
            </div>
        </header>
    );
};

const HeaderSkeleton: React.FC = () => (
    <div aria-hidden="true" className={cn(kit.surface, 'flex items-center gap-4 p-4 sm:p-5')}>
        <Skeleton className="size-16 shrink-0 rounded-2xl sm:size-18" />
        <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <div className="flex gap-2">
                <Skeleton variant="circular" className="h-6 w-24" />
                <Skeleton variant="circular" className="h-6 w-28" />
            </div>
        </div>
    </div>
);

const CardsSkeleton: React.FC = () => (
    <div aria-hidden="true" className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
            <SoftCard key={index} className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-2xl" />
                    <Skeleton className="h-5 w-1/2" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
            </SoftCard>
        ))}
    </div>
);

// ── Página ──

const BusinessManageView: React.FC<{ placeId: string }> = ({ placeId }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { confirmLeave } = useLeaveGuard();
    const { showToast } = useToast();
    // La URL manda: recargar, compartir o volver de Stripe mantiene la pestaña.
    // La pestaña que se ve la sigue, pero pasando por el aviso de cambios sin
    // guardar (atrás/adelante del navegador, enlaces que cambian ?tab=…).
    const urlTab = parseTab(searchParams.get('tab'));
    const [activeTab, setActiveTab] = useState<BusinessManageTab>(urlTab);

    const [load, setLoad] = useState<LoadState>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const [heroImageUrl, setHeroImageUrl] = useState('');
    const [upsellOpen, setUpsellOpen] = useState(false);
    // La respuesta de getBusinessInfoForManager solo sirve a la primera Ficha que
    // se monta: si se sale de la pestaña se suelta y, al volver, la Ficha pide
    // datos frescos (lo guardado entretanto no se pierde).
    const [fichaInfo, setFichaInfo] = useState<BusinessInfoSectionsResponse | null>(null);
    if (fichaInfo && activeTab !== 'general') setFichaInfo(null);

    // ?checkout=success|cancelled al volver de contratar Business Pro con Stripe.
    const checkoutReturnRef = useRef(searchParams.get('checkout'));
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            try {
                // getBusinessInfoForManager también comprueba que sigues siendo gestor.
                const [placeSnap, info] = await Promise.all([
                    getDoc(doc(db, 'places', placeId)),
                    getBusinessInfoForManager(placeId),
                ]);
                if (cancelled) return;
                const data = placeSnap.exists() ? placeSnap.data() as Record<string, unknown> : {};
                const plan = getBusinessPlanFromPlace(data);
                setFichaInfo(info);
                setLoad({ status: 'ready', place: placeHeaderFrom(data), plan, fichaPlace: fichaPlaceInfoFromDoc(data) });
                // La portada de Business Pro solo se ve en público con el plan activo.
                if (plan.isPro) {
                    getBusinessVisual(placeId)
                        .then((visual) => {
                            if (!cancelled) setHeroImageUrl(visual.heroImageUrl);
                        })
                        .catch((error) => console.warn('BusinessManagePage: visual failed', error));
                }
            } catch (error) {
                console.error('BusinessManagePage: load failed', error);
                if (!cancelled) setLoad({ status: 'error' });
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [placeId, attempt]);

    const retry = () => {
        setLoad({ status: 'loading' });
        setAttempt((value) => value + 1);
    };

    useEffect(() => {
        const result = checkoutReturnRef.current;
        if (load.status !== 'ready' || !result) return;
        checkoutReturnRef.current = null;
        if (result === 'success') {
            showToast(load.plan.isPro
                ? { variant: 'success', title: '✨ ¡Ya tienes Business Pro!', message: 'Todas las pestañas están abiertas.', durationMs: 5000 }
                : { variant: 'info', title: '⏳ Confirmando el pago', message: 'Business Pro se activará en cuanto Stripe lo confirme. Recarga en un rato.', durationMs: 6000 });
        } else {
            showToast({ variant: 'info', title: 'Pago cancelado', message: 'No se ha cobrado nada.' });
        }
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('checkout');
            return next;
        }, { replace: true });
    }, [load, showToast, setSearchParams]);

    // La última URL con la pestaña que se ve: si la URL cambia de pestaña y la
    // persona prefiere seguir editando, se vuelve a ella.
    const searchString = searchParams.toString();
    const acceptedSearchRef = useRef(searchString);
    useEffect(() => {
        if (urlTab === activeTab) acceptedSearchRef.current = searchString;
    }, [urlTab, activeTab, searchString]);

    const lastUrlTabRef = useRef(urlTab);
    const followSeqRef = useRef(0);
    useEffect(() => {
        if (urlTab === lastUrlTabRef.current) return;
        lastUrlTabRef.current = urlTab;
        // goToTab ya cambió la pestaña (y preguntó): nada que hacer.
        if (urlTab === activeTab) return;
        followSeqRef.current += 1;
        const seq = followSeqRef.current;
        void confirmLeave().then((ok) => {
            if (seq !== followSeqRef.current) return;
            if (ok) {
                setActiveTab(urlTab);
                setSearchParams((prev) => withTabParams(prev, urlTab), { replace: true });
            } else {
                setSearchParams(new URLSearchParams(acceptedSearchRef.current), { replace: true });
            }
        });
    }, [urlTab, activeTab, confirmLeave, setSearchParams]);

    /**
     * Cambia de pestaña tras preguntar si hay cambios sin guardar. Conserva el
     * resto de parámetros (menos los de la pestaña que se deja) y añade `set`.
     */
    const goToTab = useCallback(async (tab: BusinessManageTab, set?: Record<string, string>) => {
        if (tab === activeTab) return;
        if (!(await confirmLeave())) return;
        followSeqRef.current += 1;
        setActiveTab(tab);
        setSearchParams((prev) => withTabParams(prev, tab, set), { replace: true });
        // Si se cambia con la página bajada, la pestaña nueva empieza arriba (bajo la barra).
        const content = contentRef.current;
        if (content && typeof content.getBoundingClientRect === 'function' && content.getBoundingClientRect().top < 0) {
            content.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        }
    }, [activeTab, confirmLeave, setSearchParams]);

    const ready = load.status === 'ready' ? load : null;
    const locked = Boolean(ready && !ready.plan.isPro && BUSINESS_PRO_ENFORCED);

    const tabOptions: TabOption<BusinessManageTab>[] = BUSINESS_MANAGE_TABS.map((tab) => ({
        value: tab,
        icon: <span aria-hidden="true">{TAB_META[tab].emoji}</span>,
        label: TAB_META[tab].label,
        // `relative`: el texto sr-only (absoluto) queda dentro de la barra que desplaza
        // y no ensancha la página en móvil.
        suffix: locked && TAB_META[tab].pro ? (
            <span className={cn('relative rounded-full px-1.5 py-0.5 text-xs leading-none', toneClass.promo)}>
                <span aria-hidden="true">🔒</span>
                <span className="sr-only">{' Requiere Business Pro'}</span>
            </span>
        ) : undefined,
    }));

    if (load.status === 'error') {
        return (
            <div className="min-h-screen px-4 pb-16 pt-24 sm:px-6 sm:pt-28" style={{ background: 'var(--lt-bg)', color: 'var(--lt-text)' }}>
                <div className="mx-auto max-w-6xl">
                    <h1 className="sr-only">Gestionar negocio</h1>
                    <SoftCard as="section" className="mt-6">
                        <EmptyState
                            as="h2"
                            emoji="🔐"
                            title="No pudimos abrir la gestión de este negocio"
                            text="Comprueba que sigues siendo gestor o inténtalo de nuevo."
                            actions={(
                                <>
                                    <Button onClick={retry} leftIcon={<span aria-hidden="true">🔄</span>} className="min-h-11">
                                        Reintentar
                                    </Button>
                                    <Link to="/businesses" className={linkButtonClass}>
                                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                                        Mis negocios
                                    </Link>
                                </>
                            )}
                        />
                    </SoftCard>
                </div>
            </div>
        );
    }

    const tabMeta = TAB_META[activeTab];
    const renderTab = (current: NonNullable<typeof ready>) => {
        const { place, plan, fichaPlace } = current;
        switch (activeTab) {
            case 'general':
                return (
                    <BusinessInfoTab
                        placeId={placeId}
                        place={fichaPlace}
                        initialInfo={fichaInfo}
                        onGoToTab={(tab) => void goToTab(tab)}
                    />
                );
            case 'visual':
                return (
                    <RequireBusinessPro placeId={placeId} plan={plan} {...tabMeta.upsell}>
                        <BusinessVisualSection
                            placeId={placeId}
                            placeName={place.name}
                            onSaved={(visual) => setHeroImageUrl(visual.heroImageUrl)}
                        />
                    </RequireBusinessPro>
                );
            case 'items':
                return (
                    <RequireBusinessPro placeId={placeId} plan={plan} {...tabMeta.upsell}>
                        <BusinessItemsSection
                            placeId={placeId}
                            placeName={place.name}
                            placeTypes={place.types}
                            onGoToTab={(tab, params) => void goToTab(tab, params)}
                        />
                    </RequireBusinessPro>
                );
            case 'sponsored':
                return (
                    <RequireBusinessPro placeId={placeId} plan={plan} {...tabMeta.upsell}>
                        <BusinessSponsoredSection
                            placeId={placeId}
                            placeName={place.name}
                            placePhotoUrl={place.userPhotoUrl || place.mainImageUrl}
                            placeAddress={place.address}
                            onGoToTab={(tab) => void goToTab(tab)}
                        />
                    </RequireBusinessPro>
                );
            case 'stats':
                return (
                    <RequireBusinessPro placeId={placeId} plan={plan} {...tabMeta.upsell}>
                        <BusinessStatsSection placeId={placeId} rating={place.rating} onGoToTab={(tab) => void goToTab(tab)} />
                    </RequireBusinessPro>
                );
        }
    };

    return (
        <div className="min-h-screen px-4 pb-16 pt-24 sm:px-6 sm:pt-28" style={{ background: 'var(--lt-bg)', color: 'var(--lt-text)' }}>
            <div className="mx-auto max-w-6xl">
                <BackLink />

                <div className="mt-2">
                    {ready ? (
                        <ManageHeader
                            placeId={placeId}
                            place={ready.place}
                            plan={ready.plan}
                            thumbUrl={(ready.plan.isPro && heroImageUrl) || ready.place.userPhotoUrl || ready.place.mainImageUrl || ''}
                            onOpenUpsell={locked ? () => setUpsellOpen(true) : undefined}
                        />
                    ) : (
                        <HeaderSkeleton />
                    )}
                </div>

                <p className="mt-3 flex items-start gap-2 text-sm text-[var(--lt-text-muted)]">
                    <span aria-hidden="true">ℹ️</span>
                    <span>Lo que guardes aquí se muestra en lugar de lo que dice Google.</span>
                </p>

                {/* Fija bajo la barra de navegación (h-12 + márgenes en móvil, h-14 en md). */}
                <div className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-30 -mx-4 mt-3 bg-[var(--lt-bg)]/80 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 md:top-[calc(env(safe-area-inset-top)+5rem)]">
                    <Tabs
                        scrollable
                        size="lg"
                        ariaLabel="Gestión del negocio"
                        value={activeTab}
                        options={tabOptions}
                        onChange={(tab) => void goToTab(tab)}
                    />
                </div>

                <div
                    ref={contentRef}
                    role="tabpanel"
                    aria-label={tabMeta.label}
                    className="mt-4 scroll-mt-[calc(env(safe-area-inset-top)+9rem)]"
                >
                    {ready ? renderTab(ready) : (
                        <>
                            <p role="status" className="sr-only">Cargando la gestión del negocio…</p>
                            <CardsSkeleton />
                        </>
                    )}
                </div>
            </div>

            <Modal
                isOpen={upsellOpen}
                onClose={() => setUpsellOpen(false)}
                title={<span><span aria-hidden="true">✨ </span>Business Pro</span>}
            >
                <BusinessProUpsellCard
                    bare
                    placeId={placeId}
                    title="Haz que tu local destaque"
                    text="Activa Business Pro para este local y desbloquea la imagen, la carta, las promos y las estadísticas."
                />
            </Modal>
        </div>
    );
};

/**
 * Gestión de un negocio (`/businesses/:placeId/manage`): cabecera, pestañas
 * fijas (📝 Ficha | 🎨 Imagen | 📖 Carta | 📣 Promos | 📊 Estadísticas) y la
 * pestaña activa, que sale de `?tab=`. Cambiar de pestaña pregunta antes si
 * algo está sin guardar (BusinessDirtyProvider).
 */
export const BusinessManagePage: React.FC = () => {
    const { placeId } = useParams<{ placeId: string }>();
    if (!placeId) return null;
    return (
        <BusinessDirtyProvider>
            <BusinessManageView key={placeId} placeId={placeId} />
        </BusinessDirtyProvider>
    );
};

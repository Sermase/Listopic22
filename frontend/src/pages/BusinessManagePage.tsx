import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import {
    Accessibility,
    ArrowLeft,
    Baby,
    Banknote,
    Building2,
    Check,
    ChevronDown,
    Coffee,
    CreditCard,
    Ear,
    Eye,
    Image as ImageIcon,
    Info,
    Loader2,
    Megaphone,
    Music,
    PawPrint,
    Plus,
    Save,
    Smartphone,
    Sparkles,
    Tags,
    Trash2,
    Utensils,
    Wallet,
    Wifi,
    Wine,
} from 'lucide-react';
import { db } from '../firebase';
import { BUSINESS_PRO_ENFORCED } from '../config/features';
import { RequireBusinessPro } from '../components/RequireBusinessPro';
import {
    FREE_BUSINESS_PLAN,
    formatPlanExpiry,
    getBusinessPlanFromPlace,
    PLAN_SOURCE_LABELS,
    type BusinessPlan,
} from '../utils/businessPlan';
import {
    getBusinessInfoForManager,
    updateBusinessInfoSection,
    type BusinessInfoSectionsResponse,
} from '../services/BusinessInfoService';
import { getCanonicalPlaceItems, type CanonicalPlaceItem } from '../services/CanonicalItemService';
import type {
    BusinessAccessibilityInfo,
    BusinessCommercialInfo,
    BusinessContactInfo,
    BusinessDeliveriesInfo,
    BusinessDeliveryLink,
    BusinessDietaryInfo,
    BusinessFamilyInfo,
    BusinessHoursInfo,
    BusinessIdentityInfo,
    BusinessInfoDocument,
    BusinessInfoSection,
    BusinessPetsInfo,
    BusinessReservationsInfo,
    BusinessWeeklyHours,
    DeliveryProvider,
    ReservationProvider,
} from '../types/businessInfo';
import { CROSS_CONTAMINATION_LABELS, DELIVERY_PROVIDER_OPTIONS, PET_POLICY_LABELS, PET_RESTRICTION_OPTIONS, PRICE_RANGE_LABELS } from '../constants/businessOptions';

type PlaceHeader = {
    name?: string;
    address?: string;
    mainImageUrl?: string;
    userPhotoUrl?: string;
    businessTier?: string;
    businessProActive?: boolean;
    businessBillingStatus?: string;
};

type Message = { type: 'success' | 'error'; text: string } | null;
type BusinessManageTab = 'general' | 'visual' | 'items' | 'sponsored';

const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const emptySections: Record<BusinessInfoSection, BusinessInfoDocument> = {
    identity: { section: 'identity', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    contact: { section: 'contact', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    commercial: { section: 'commercial', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    accessibility: { section: 'accessibility', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    family: { section: 'family', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    pets: { section: 'pets', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    dietary: { section: 'dietary', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    hours: { section: 'hours', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    reservations: { section: 'reservations', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    deliveries: { section: 'deliveries', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
};

const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const joinList = (value: string[] | undefined) => (value || []).join(', ');

const getErrorMessage = (error: unknown) => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return 'No se pudo guardar la información.';
};

const Field: React.FC<{
    label: string;
    children: React.ReactNode;
    hint?: string;
}> = ({ label, children, hint }) => (
    <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--lt-text-muted)]">{label}</span>
        {children}
        {hint && <span className="mt-1 block text-xs text-[var(--lt-text-muted)]">{hint}</span>}
    </label>
);

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--lt-text)] outline-none transition-colors placeholder:text-[var(--lt-text-muted)] focus:border-[var(--lt-accent-border)]';

type OptionGroup = {
    title: string;
    text?: string;
    icon: React.ElementType;
    options: string[];
};

const COMMON_CUISINE_TYPES = [
    'Española',
    'Mediterránea',
    'Tapas',
    'Bar',
    'Cafetería',
    'Brunch',
    'Italiana',
    'Pizza',
    'Hamburguesas',
    'Mexicana',
    'Japonesa',
    'Sushi',
    'China',
    'India',
    'Vegana',
    'Vegetariana',
    'Sin gluten',
    'Coctelería',
];

const PAYMENT_METHOD_GROUPS: OptionGroup[] = [
    {
        title: 'Más habituales',
        text: 'Lo que la mayoría busca primero.',
        icon: CreditCard,
        options: ['Tarjeta', 'Efectivo', 'Contactless', 'Bizum'],
    },
    {
        title: 'Móvil y online',
        icon: Smartphone,
        options: ['Apple Pay', 'Google Pay', 'PayPal', 'Pago online', 'Pago en app'],
    },
    {
        title: 'Vales y empresa',
        icon: Wallet,
        options: ['Ticket Restaurant', 'Cheque gourmet', 'Sodexo', 'Transferencia'],
    },
    {
        title: 'Tarjetas concretas',
        icon: Banknote,
        options: ['Visa', 'Mastercard', 'American Express', 'Contra reembolso'],
    },
];

const BUSINESS_SERVICE_GROUPS: OptionGroup[] = [
    {
        title: 'Comer y reservar',
        text: 'Servicios básicos del local.',
        icon: Utensils,
        options: ['Comer en local', 'Reservas', 'Terraza', 'Para llevar'],
    },
    {
        title: 'Momentos del día',
        icon: Coffee,
        options: ['Desayunos', 'Brunch', 'Comidas', 'Cenas', 'Menú del día', 'Menú infantil'],
    },
    {
        title: 'Bebidas',
        icon: Wine,
        options: ['Café', 'Copas', 'Cócteles', 'Vino', 'Cerveza'],
    },
    {
        title: 'Ambiente y eventos',
        icon: Music,
        options: ['Música en directo', 'Eventos privados', 'Catering', 'Cumpleaños', 'Apto para grupos', 'Zona tranquila', 'Zona fumadores'],
    },
    {
        title: 'Familias',
        icon: Baby,
        options: ['Apto para familias', 'Tronas'],
    },
    {
        title: 'Comodidades',
        icon: Wifi,
        options: ['WiFi', 'Enchufes', 'Aire acondicionado', 'Calefacción', 'Televisión', 'Vistas', 'Azotea'],
    },
    {
        title: 'Llegada',
        icon: Building2,
        options: ['Parking', 'Parking cercano', 'Aparcacoches'],
    },
];

export const BusinessManagePage: React.FC = () => {
    const { placeId } = useParams<{ placeId: string }>();
    const [place, setPlace] = useState<PlaceHeader | null>(null);
    const [plan, setPlan] = useState<BusinessPlan>(FREE_BUSINESS_PLAN);
    const [sections, setSections] = useState<Record<BusinessInfoSection, BusinessInfoDocument>>(emptySections);
    const [activeBusinessTab, setActiveBusinessTab] = useState<BusinessManageTab>('general');
    const [activeSection, setActiveSection] = useState<BusinessInfoSection>('identity');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<BusinessInfoSection | null>(null);
    const [message, setMessage] = useState<Message>(null);

    useEffect(() => {
        if (!placeId) return;
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setMessage(null);
            try {
                const [placeSnap, info] = await Promise.all([
                    getDoc(doc(db, 'places', placeId)),
                    getBusinessInfoForManager(placeId),
                ]);
                if (cancelled) return;
                const data = placeSnap.exists() ? placeSnap.data() as Record<string, unknown> : {};
                setPlace({
                    name: typeof data.name === 'string' ? data.name : undefined,
                    address: typeof data.address === 'string' ? data.address : typeof data.formattedAddress === 'string' ? data.formattedAddress : undefined,
                    mainImageUrl: typeof data.mainImageUrl === 'string' ? data.mainImageUrl : undefined,
                    userPhotoUrl: typeof data.userPhotoUrl === 'string' ? data.userPhotoUrl : undefined,
                    businessTier: typeof data.businessTier === 'string' ? data.businessTier : undefined,
                    businessProActive: data.businessProActive === true,
                    businessBillingStatus: typeof data.businessBillingStatus === 'string' ? data.businessBillingStatus : undefined,
                });
                setPlan(getBusinessPlanFromPlace(data));
                setSections(normalizeSections(info));
            } catch (error) {
                console.error('BusinessManagePage: load failed', error);
                if (!cancelled) setMessage({ type: 'error', text: 'No se pudo cargar la gestión del negocio.' });
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [placeId]);

    const photoUrl = place?.userPhotoUrl || place?.mainImageUrl || '';
    const hasBusinessPro = plan.isPro;
    const planExpiryLabel = formatPlanExpiry(plan.expiresAt);

    const updateData = <S extends BusinessInfoSection>(section: S, data: Partial<BusinessInfoDocument<S>['data']>) => {
        setSections((prev) => ({
            ...prev,
            [section]: {
                ...prev[section],
                data: {
                    ...(prev[section].data as object),
                    ...data,
                } as BusinessInfoDocument<S>['data'],
            },
        }));
    };

    const updateHidden = (section: BusinessInfoSection, field: string, checked: boolean) => {
        setSections((prev) => {
            const current = new Set(prev[section].hiddenFields || []);
            if (checked) current.add(field);
            else current.delete(field);
            return {
                ...prev,
                [section]: {
                    ...prev[section],
                    hiddenFields: Array.from(current),
                },
            };
        });
    };

    const saveSection = async (section: BusinessInfoSection) => {
        if (!placeId) return;
        setSaving(section);
        setMessage(null);
        try {
            const current = sections[section];
            const result = await updateBusinessInfoSection({
                placeId,
                section,
                data: current.data,
                hiddenFields: current.hiddenFields,
                version: current.version,
            });
            setSections((prev) => ({
                ...prev,
                [section]: { ...prev[section], version: result.version },
            }));
            setMessage({ type: 'success', text: 'Información guardada.' });
        } catch (error) {
            console.error('BusinessManagePage: save failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error) });
        } finally {
            setSaving(null);
        }
    };

    const showBusinessProMessage = () => {
        if (BUSINESS_PRO_ENFORCED) {
            // Con el capado activo, el aviso sobra: llevamos al usuario al paywall.
            setActiveBusinessTab('visual');
            return;
        }
        setMessage({
            type: 'error',
            text: 'No se puede acceder a Business Pro todavía porque este local no es Negocio Pro. Las pestañas Pro están abiertas en modo pruebas para prepararlas.',
        });
    };

    const businessTabs = useMemo(() => ([
        { id: 'general', label: 'Datos generales', icon: Info, pro: false },
        { id: 'visual', label: 'Imagen', icon: ImageIcon, pro: true },
        { id: 'items', label: 'Elementos y carta', icon: Tags, pro: true },
        { id: 'sponsored', label: 'Patrocinado', icon: Megaphone, pro: true },
    ] as const), []);

    const navItems = useMemo(() => ([
        ['identity', 'Identidad'],
        ['contact', 'Contacto'],
        ['commercial', 'Comercial'],
        ['accessibility', 'Accesibilidad'],
        ['family', 'Familias'],
        ['pets', 'Mascotas'],
        ['dietary', 'Alérgenos'],
        ['hours', 'Horarios'],
        ['reservations', 'Reservas'],
        ['deliveries', 'Delivery'],
    ] as const), []);

    if (!placeId) return null;

    return (
        <div className="min-h-screen px-4 pb-16 pt-28 sm:px-6" style={{ background: 'var(--lt-bg)', color: 'var(--lt-text)' }}>
            <div className="mx-auto max-w-6xl">
                <Link to="/businesses" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
                    <ArrowLeft className="h-4 w-4" />
                    Volver a negocios
                </Link>

                <header className="overflow-hidden rounded-3xl border border-white/10 bg-[var(--lt-card-strong)] shadow-xl shadow-black/10">
                    <div className="flex flex-col sm:flex-row">
                        <div className="h-40 bg-white/5 sm:h-auto sm:w-64">
                            {photoUrl ? (
                                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <div className="grid h-full place-items-center text-[var(--lt-accent)]">
                                    <Building2 className="h-12 w-12" />
                                </div>
                            )}
                        </div>
                        <div className="flex-1 p-6">
                            <div className="flex flex-wrap gap-2">
                                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase text-emerald-300">
                                    <Check className="h-3.5 w-3.5" />
                                    Negocio verificado
                                </div>
                                {hasBusinessPro && (
                                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase text-amber-300">
                                        <Sparkles className="h-3.5 w-3.5" />
                                        Business Pro
                                    </div>
                                )}
                                {hasBusinessPro && plan.source && plan.source !== 'stripe' && (
                                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold uppercase text-[var(--lt-text-muted)]">
                                        {PLAN_SOURCE_LABELS[plan.source]}
                                        {planExpiryLabel ? ` · hasta ${planExpiryLabel}` : ''}
                                    </div>
                                )}
                            </div>
                            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-4xl">{place?.name || 'Gestionar negocio'}</h1>
                            {place?.address && <p className="mt-2 text-sm text-[var(--lt-text-muted)]">{place.address}</p>}
                            <p className="mt-4 max-w-2xl text-sm text-[var(--lt-text-muted)]">
                                Estos datos tienen prioridad sobre Google cuando estén activos. Los metadatos internos del plan no se muestran públicamente.
                            </p>
                            {!hasBusinessPro && (
                                <button
                                    type="button"
                                    onClick={showBusinessProMessage}
                                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-sm font-black text-white shadow-lg disabled:opacity-60"
                                >
                                    <Sparkles className="h-4 w-4" />
                                    Business Pro
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {message && (
                    <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                        message.type === 'success'
                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                            : 'border-red-500/25 bg-red-500/10 text-red-200'
                    }`}>
                        {message.text}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-24 text-[var(--lt-text-muted)]">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                        Cargando datos...
                    </div>
                ) : (
                    <div className="mt-6 space-y-5">
                        <div className="grid gap-2 rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-2 sm:grid-cols-2 lg:grid-cols-4">
                            {businessTabs.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeBusinessTab === tab.id;
                                return (
                                    <div
                                        key={tab.id}
                                        className={`flex items-center rounded-xl border transition-colors ${
                                            isActive
                                                ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]'
                                                : 'border-transparent bg-white/[0.03] hover:bg-white/[0.06]'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setActiveBusinessTab(tab.id)}
                                            className={`flex min-h-12 flex-1 items-center gap-2 px-3 py-2 text-left text-sm font-black ${
                                                isActive ? 'text-[var(--lt-text)]' : 'text-[var(--lt-text-muted)]'
                                            }`}
                                        >
                                            <Icon className="h-4 w-4 shrink-0 text-[var(--lt-accent)]" />
                                            <span className="min-w-0 truncate">{tab.label}</span>
                                        </button>
                                        {tab.pro && (
                                            <ProBadge onClick={showBusinessProMessage} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {activeBusinessTab === 'general' && (
                            <div className="grid gap-5 lg:grid-cols-[240px,1fr]">
                                <aside className="h-fit rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-2">
                                    {navItems.map(([id, label]) => (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setActiveSection(id)}
                                            className={`w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition-colors ${
                                                activeSection === id
                                                    ? 'bg-[var(--lt-accent)] text-white'
                                                    : 'text-[var(--lt-text-muted)] hover:bg-white/5 hover:text-[var(--lt-text)]'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </aside>

                                <section className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-5">
                                    {activeSection === 'identity' && (
                                        <IdentityForm
                                            doc={sections.identity as BusinessInfoDocument<'identity'>}
                                            onChange={(data) => updateData('identity', data)}
                                        />
                                    )}
                                    {activeSection === 'contact' && (
                                        <ContactForm
                                            doc={sections.contact as BusinessInfoDocument<'contact'>}
                                            onChange={(data) => updateData('contact', data)}
                                            onHiddenChange={(field, checked) => updateHidden('contact', field, checked)}
                                        />
                                    )}
                                    {activeSection === 'commercial' && (
                                        <CommercialForm
                                            doc={sections.commercial as BusinessInfoDocument<'commercial'>}
                                            onChange={(data) => updateData('commercial', data)}
                                        />
                                    )}
                                    {activeSection === 'accessibility' && (
                                        <AccessibilityForm
                                            doc={sections.accessibility as BusinessInfoDocument<'accessibility'>}
                                            onChange={(data) => updateData('accessibility', data)}
                                        />
                                    )}
                                    {activeSection === 'family' && (
                                        <FamilyForm
                                            doc={sections.family as BusinessInfoDocument<'family'>}
                                            onChange={(data) => updateData('family', data)}
                                        />
                                    )}
                                    {activeSection === 'pets' && (
                                        <PetsForm
                                            doc={sections.pets as BusinessInfoDocument<'pets'>}
                                            onChange={(data) => updateData('pets', data)}
                                        />
                                    )}
                                    {activeSection === 'dietary' && (
                                        <DietaryForm
                                            doc={sections.dietary as BusinessInfoDocument<'dietary'>}
                                            onChange={(data) => updateData('dietary', data)}
                                        />
                                    )}
                                    {activeSection === 'hours' && (
                                        <HoursForm
                                            doc={sections.hours as BusinessInfoDocument<'hours'>}
                                            onChange={(data) => updateData('hours', data)}
                                        />
                                    )}
                                    {activeSection === 'reservations' && (
                                        <ReservationsForm
                                            doc={sections.reservations as BusinessInfoDocument<'reservations'>}
                                            onChange={(data) => updateData('reservations', data)}
                                        />
                                    )}
                                    {activeSection === 'deliveries' && (
                                        <DeliveriesForm
                                            doc={sections.deliveries as BusinessInfoDocument<'deliveries'>}
                                            onChange={(data) => updateData('deliveries', data)}
                                        />
                                    )}

                                    <div className="mt-6 flex justify-end border-t border-white/10 pt-5">
                                        <div className="flex w-full flex-col gap-3 sm:max-w-xl sm:items-end">
                                            <p className="text-xs leading-relaxed text-[var(--lt-text-muted)] sm:text-right">
                                                Al guardar confirmas que estos datos son correctos, actuales y útiles para informar a los usuarios de Listopic.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => saveSection(activeSection)}
                                                disabled={saving === activeSection}
                                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--lt-accent)] px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-[var(--lt-accent-shadow)] disabled:opacity-60"
                                            >
                                                {saving === activeSection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                                Guardar
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeBusinessTab === 'visual' && (
                            <RequireBusinessPro placeId={placeId} plan={plan}>
                                <BusinessVisualPrototype />
                            </RequireBusinessPro>
                        )}
                        {activeBusinessTab === 'items' && (
                            <RequireBusinessPro placeId={placeId} plan={plan}>
                                <BusinessItemsPrototype placeId={placeId} />
                            </RequireBusinessPro>
                        )}
                        {activeBusinessTab === 'sponsored' && (
                            <RequireBusinessPro placeId={placeId} plan={plan}>
                                <BusinessSponsoredPrototype />
                            </RequireBusinessPro>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

function normalizeSections(info: BusinessInfoSectionsResponse): Record<BusinessInfoSection, BusinessInfoDocument> {
    return {
        identity: { ...emptySections.identity, ...(info.sections?.identity || {}) },
        contact: { ...emptySections.contact, ...(info.sections?.contact || {}) },
        commercial: { ...emptySections.commercial, ...(info.sections?.commercial || {}) },
        accessibility: { ...emptySections.accessibility, ...(info.sections?.accessibility || {}) },
        family: { ...emptySections.family, ...(info.sections?.family || {}) },
        pets: { ...emptySections.pets, ...(info.sections?.pets || {}) },
        dietary: { ...emptySections.dietary, ...(info.sections?.dietary || {}) },
        hours: { ...emptySections.hours, ...(info.sections?.hours || {}) },
        reservations: { ...emptySections.reservations, ...(info.sections?.reservations || {}) },
        deliveries: { ...emptySections.deliveries, ...(info.sections?.deliveries || {}) },
    };
}

const ProBadge: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="mr-2 inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/40 bg-gradient-to-r from-amber-300/25 via-fuchsia-300/20 to-cyan-300/20 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.22)]"
        title="Función Business Pro"
    >
        <Sparkles className="h-3 w-3" />
        Pro
    </button>
);

const PrototypeShell: React.FC<{
    title: string;
    text: string;
    icon: React.ElementType;
    children: React.ReactNode;
}> = ({ title, text, icon: Icon, children }) => (
    <section className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-5">
        <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black text-[var(--lt-text)]">{title}</h2>
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">
                            <Sparkles className="h-3 w-3" />
                            Pro
                        </span>
                    </div>
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--lt-text-muted)]">{text}</p>
                </div>
            </div>
            <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-cyan-200">
                Modo pruebas
            </span>
        </div>
        {children}
    </section>
);

const BusinessVisualPrototype: React.FC = () => (
    <PrototypeShell
        title="Imagen y página del negocio"
        text="Personalización visual del perfil público: hero, fondos, galería destacada, tarjetas y tono visual del local. Más adelante se bloqueará detrás de Business Pro."
        icon={ImageIcon}
    >
        <div className="grid gap-5 lg:grid-cols-[1.1fr,0.9fr]">
            <div className="space-y-4">
                <Field label="Imagen principal / fondo">
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.04] p-5 text-center">
                        <ImageIcon className="mx-auto h-8 w-8 text-[var(--lt-accent)]" />
                        <p className="mt-2 text-sm font-bold text-[var(--lt-text)]">Subir o elegir fondo del negocio</p>
                        <p className="mt-1 text-xs text-[var(--lt-text-muted)]">Pensado para hero, portada de carta y tarjetas compartibles.</p>
                    </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Color de acento">
                        <input className={inputClass} defaultValue="#6d5dfc" />
                    </Field>
                    <Field label="Estilo visual">
                        <select className={inputClass} defaultValue="editorial">
                            <option value="editorial">Editorial</option>
                            <option value="clean">Limpio</option>
                            <option value="warm">Cálido</option>
                            <option value="night">Noche</option>
                        </select>
                    </Field>
                </div>
                <Field label="Texto destacado de portada">
                    <textarea className={`${inputClass} min-h-24`} placeholder="Ej. Cocina honesta, producto local y brunch de fin de semana." />
                </Field>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[var(--lt-bg-deep)]">
                <div className="h-40 bg-gradient-to-br from-indigo-600 via-purple-600 to-cyan-500" />
                <div className="p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--lt-accent)]">Preview</p>
                    <h3 className="mt-2 text-2xl font-black text-[var(--lt-text)]">Tu negocio</h3>
                    <p className="mt-2 text-sm text-[var(--lt-text-muted)]">Así se podría ver la cabecera pública cuando activemos personalización avanzada.</p>
                </div>
            </div>
        </div>
    </PrototypeShell>
);

const BusinessItemsPrototype: React.FC<{ placeId: string }> = ({ placeId }) => {
    const [items, setItems] = useState<CanonicalPlaceItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const loadItems = async () => {
            setLoadingItems(true);
            try {
                const rows = await getCanonicalPlaceItems(placeId);
                if (!cancelled) setItems(rows);
            } catch (error) {
                console.error('BusinessManagePage: failed loading canonical items', error);
                if (!cancelled) setItems([]);
            } finally {
                if (!cancelled) setLoadingItems(false);
            }
        };
        void loadItems();
        return () => {
            cancelled = true;
        };
    }, [placeId]);

    return (
        <PrototypeShell
            title="Elementos, carta y grupos"
            text="Gestión de productos, platos o servicios del lugar. La base son los elementos valorados por la comunidad; el negocio puede enriquecerlos y proponer merges, pero no borrar memoria histórica."
            icon={Tags}
        >
            <div className="grid gap-5 lg:grid-cols-[1fr,1.1fr]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-black text-[var(--lt-text)]">Elementos comunitarios</h3>
                            <p className="mt-1 text-xs text-[var(--lt-text-muted)]">Persistidos en el lugar y recalculados desde reseñas.</p>
                        </div>
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-[var(--lt-accent)] px-3 py-2 text-xs font-black text-white">
                            <Plus className="h-3.5 w-3.5" />
                            Proponer
                        </button>
                    </div>

                    {loadingItems ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                            Cargando elementos...
                        </div>
                    ) : items.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-[var(--lt-text-muted)]">
                            Todavía no hay elementos canónicos persistidos. Se generarán al reconstruir el lugar o cuando entren nuevas reseñas.
                        </div>
                    ) : (
                        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                            {items.map((item) => (
                                <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h4 className="truncate text-sm font-black text-[var(--lt-text)]">{item.canonicalName || item.id}</h4>
                                            <p className="mt-1 text-xs text-[var(--lt-text-muted)]">
                                                {(item.stats?.reviewCount || 0)} reseñas
                                                {typeof item.stats?.averageRating === 'number' ? ` · ${item.stats.averageRating.toFixed(2)}` : ''}
                                            </p>
                                        </div>
                                        <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[10px] font-black uppercase text-[var(--lt-text-muted)]">
                                            {item.linkedListIds?.length || 0} listas
                                        </span>
                                    </div>
                                    {item.sourceNames?.length ? (
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {item.sourceNames.slice(0, 4).map((source) => (
                                                <span key={`${item.id}-${source.name}`} className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[10px] font-bold text-[var(--lt-text-muted)]">
                                                    {source.name} ({source.count})
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-black text-[var(--lt-text)]">Ficha oficial del elemento</h3>
                            <p className="text-xs text-[var(--lt-text-muted)]">Prototipo de enriquecimiento Business Pro.</p>
                        </div>
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-[var(--lt-text)]">
                            <ImageIcon className="h-3.5 w-3.5" />
                            Foto
                        </button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Nombre canónico">
                            <input className={inputClass} placeholder="Tarta de queso" />
                        </Field>
                        <Field label="Grupo de carta">
                            <select className={inputClass}>
                                <option>Postres</option>
                                <option>Entrantes</option>
                                <option>Principales</option>
                                <option>Bebidas</option>
                            </select>
                        </Field>
                        <Field label="Precio">
                            <input className={inputClass} placeholder="6,50 EUR" />
                        </Field>
                        <Field label="Descuento">
                            <input className={inputClass} placeholder="2x1, -20%, happy hour..." />
                        </Field>
                    </div>
                    <Field label="Ingredientes">
                        <input className={inputClass} placeholder="Queso crema, galleta, frutos rojos..." />
                    </Field>
                    <Field label="Descripción">
                        <textarea className={`${inputClass} min-h-24`} placeholder="Descripción corta para la ficha del elemento." />
                    </Field>
                    <Field label="Acción sensible">
                        <button type="button" className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-black text-amber-200">
                            Proponer merge o cambio de identidad
                        </button>
                    </Field>
                </div>
            </div>
        </PrototypeShell>
    );
};

const BusinessSponsoredPrototype: React.FC = () => (
    <PrototypeShell
        title="Contenido patrocinado"
        text="Promociones y piezas destacadas del local, siempre marcadas como patrocinadas y separadas de rankings orgánicos."
        icon={Megaphone}
    >
        <div className="grid gap-4 lg:grid-cols-3">
            {[
                ['Oferta destacada', 'Título, fechas, foto, CTA y condiciones visibles.'],
                ['Lugar destacado', 'Impulso por categoría, barrio o radio con etiqueta de promocionado.'],
                ['Lista patrocinada', 'Selección editorial del negocio sin alterar valoraciones ni ranking.'],
            ].map(([title, text]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                        <Megaphone className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-black text-[var(--lt-text)]">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--lt-text-muted)]">{text}</p>
                    <button type="button" className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-[var(--lt-text)]">
                        Crear borrador
                    </button>
                </div>
            ))}
        </div>
    </PrototypeShell>
);

const IdentityForm: React.FC<{
    doc: BusinessInfoDocument<'identity'>;
    onChange: (data: Partial<BusinessIdentityInfo>) => void;
}> = ({ doc, onChange }) => (
    <div className="space-y-4">
        <SectionTitle title="Identidad" text="Nombre visible, descripción e idiomas que el negocio quiere destacar." />
        <Field label="Nombre visible">
            <input className={inputClass} value={doc.data.displayName?.es || ''} onChange={(event) => onChange({ displayName: { ...doc.data.displayName, es: event.target.value } })} />
        </Field>
        <Field label="Descripción">
            <textarea className={`${inputClass} min-h-32`} value={doc.data.description?.es || ''} onChange={(event) => onChange({ description: { ...doc.data.description, es: event.target.value } })} />
        </Field>
        <Field label="Idiomas" hint="Separados por coma. Ejemplo: español, inglés, francés">
            <input className={inputClass} value={joinList(doc.data.languages)} onChange={(event) => onChange({ languages: splitList(event.target.value) })} />
        </Field>
    </div>
);

const ContactForm: React.FC<{
    doc: BusinessInfoDocument<'contact'>;
    onChange: (data: Partial<BusinessContactInfo>) => void;
    onHiddenChange: (field: string, checked: boolean) => void;
}> = ({ doc, onChange, onHiddenChange }) => (
    <div className="space-y-4">
        <SectionTitle title="Contacto" text="Datos de contacto públicos. Puedes ocultar datos de Google aunque no pongas sustituto." />
        <Field label="Teléfono">
            <input className={inputClass} value={doc.data.phone || ''} onChange={(event) => onChange({ phone: event.target.value })} />
        </Field>
        <HideGoogleField checked={doc.hiddenFields.includes('phone')} label="Ocultar teléfono de Google si este campo está vacío" onChange={(checked) => onHiddenChange('phone', checked)} />
        <Field label="Web">
            <input className={inputClass} value={doc.data.website || ''} onChange={(event) => onChange({ website: event.target.value })} placeholder="https://..." />
        </Field>
        <HideGoogleField checked={doc.hiddenFields.includes('website')} label="Ocultar web de Google si este campo está vacío" onChange={(checked) => onHiddenChange('website', checked)} />
        <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
                <input className={inputClass} value={doc.data.email || ''} onChange={(event) => onChange({ email: event.target.value })} />
            </Field>
            <Field label="Instagram">
                <input className={inputClass} value={doc.data.instagram || ''} onChange={(event) => onChange({ instagram: event.target.value })} placeholder="@usuario" />
            </Field>
        </div>
    </div>
);

const CommercialForm: React.FC<{
    doc: BusinessInfoDocument<'commercial'>;
    onChange: (data: Partial<BusinessCommercialInfo>) => void;
}> = ({ doc, onChange }) => (
    <div className="space-y-4">
        <SectionTitle title="Comercial" text="Categoría real del negocio, servicios y métodos de pago." />
        <Field label="Rango de precio">
            <select className={inputClass} value={doc.data.priceRange || ''} onChange={(event) => onChange({ priceRange: event.target.value as BusinessCommercialInfo['priceRange'] })}>
                <option value="">Sin definir</option>
                {Object.entries(PRICE_RANGE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                ))}
            </select>
        </Field>
        <Field label="Tipos de cocina / categoría" hint="Separados por coma. Ejemplo: mexicana, brunch, cafetería">
            <SuggestedListInput
                suggestions={COMMON_CUISINE_TYPES}
                value={doc.data.cuisineTypes || []}
                onChange={(items) => onChange({ cuisineTypes: items })}
                placeholder="mexicana, brunch, cafetería"
            />
        </Field>
        <Field label="Métodos de pago" hint="Elige los habituales. Los más usados aparecen primero.">
            <GroupedOptionGrid
                groups={PAYMENT_METHOD_GROUPS}
                value={doc.data.paymentMethods || []}
                onChange={(items) => onChange({ paymentMethods: items })}
            />
        </Field>
        <Field label="Servicios" hint="Selecciona solo lo que el local ofrece de verdad. Está organizado por bloques para ir más rápido.">
            <GroupedOptionGrid
                groups={BUSINESS_SERVICE_GROUPS}
                value={doc.data.services || []}
                onChange={(items) => onChange({ services: items })}
            />
        </Field>
    </div>
);

const SuggestedListInput: React.FC<{
    suggestions: string[];
    value: string[];
    onChange: (items: string[]) => void;
    placeholder?: string;
}> = ({ suggestions, value, onChange, placeholder }) => {
    const selected = new Set(value.map((item) => item.toLowerCase()));
    const toggleSuggestion = (option: string) => {
        const exists = selected.has(option.toLowerCase());
        onChange(exists
            ? value.filter((item) => item.toLowerCase() !== option.toLowerCase())
            : [...value, option]
        );
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {suggestions.map((option) => {
                    const isSelected = selected.has(option.toLowerCase());
                    return (
                        <button
                            key={option}
                            type="button"
                            onClick={() => toggleSuggestion(option)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-black transition-colors ${
                                isSelected
                                    ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent)] text-white shadow-md shadow-[var(--lt-accent-shadow)]'
                                    : 'border-white/10 bg-white/5 text-[var(--lt-text-muted)] hover:bg-white/10 hover:text-[var(--lt-text)]'
                            }`}
                        >
                            {option}
                        </button>
                    );
                })}
            </div>
            <ListInput value={value} onChange={onChange} placeholder={placeholder} />
        </div>
    );
};

const GroupedOptionGrid: React.FC<{
    groups: OptionGroup[];
    value: string[];
    onChange: (items: string[]) => void;
}> = ({ groups, value, onChange }) => {
    const selected = new Set(value);
    const knownOptions = new Set(groups.flatMap((group) => group.options));
    const customSelected = value.filter((item) => !knownOptions.has(item));

    const toggle = (option: string) => {
        const next = selected.has(option)
            ? value.filter((item) => item !== option)
            : [...value, option];
        onChange(next);
    };

    return (
        <div className="space-y-4">
            {groups.map(({ title, text, icon: Icon, options }) => {
                const selectedCount = options.filter((option) => selected.has(option)).length;
                return (
                    <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-[var(--lt-text)]">{title}</h3>
                                    {text && <p className="mt-0.5 text-xs text-[var(--lt-text-muted)]">{text}</p>}
                                </div>
                            </div>
                            {selectedCount > 0 && (
                                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-200">
                                    {selectedCount}
                                </span>
                            )}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {options.map((option) => {
                                const isSelected = selected.has(option);
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => toggle(option)}
                                        aria-pressed={isSelected}
                                        className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-bold transition-colors ${
                                            isSelected
                                                ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent)]/20 text-[var(--lt-text)]'
                                                : 'border-white/10 bg-white/5 text-[var(--lt-text-muted)] hover:bg-white/10 hover:text-[var(--lt-text)]'
                                        }`}
                                    >
                                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                                            isSelected
                                                ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent)] text-white'
                                                : 'border-white/15 bg-black/10 text-transparent'
                                        }`}>
                                            <Check className="h-3.5 w-3.5" />
                                        </span>
                                        <span>{option}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {customSelected.length > 0 && (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3">
                    <h3 className="text-xs font-black uppercase tracking-[0.14em] text-amber-100">Opciones guardadas antiguas</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {customSelected.map((option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => toggle(option)}
                                className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-100"
                            >
                                {option} ×
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const OptionGrid: React.FC<{
    options: string[];
    value: string[];
    onChange: (items: string[]) => void;
}> = ({ options, value, onChange }) => {
    const selected = new Set(value);
    const toggle = (option: string) => {
        const next = selected.has(option)
            ? value.filter((item) => item !== option)
            : [...value, option];
        onChange(next);
    };

    return (
        <div className="grid gap-2 sm:grid-cols-2">
            {options.map((option) => (
                <label key={option} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-[var(--lt-text)]">
                    <input type="checkbox" checked={selected.has(option)} onChange={() => toggle(option)} />
                    <span>{option}</span>
                </label>
            ))}
        </div>
    );
};

const ListInput: React.FC<{
    value: string[];
    onChange: (items: string[]) => void;
    placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
    const [draft, setDraft] = useState(joinList(value));

    useEffect(() => {
        setDraft(joinList(value));
    }, [value]);

    return (
        <input
            className={inputClass}
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => onChange(draft.split(',').map((item) => item.trim()).filter(Boolean))}
        />
    );
};

const InfoTooltip: React.FC<{ text: string }> = ({ text }) => (
    <span className="group relative inline-flex">
        <Info
            className="h-3.5 w-3.5 text-[var(--lt-text-muted)] hover:text-[var(--lt-accent)] cursor-help"
            tabIndex={0}
        />
        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 -translate-x-1/2 rounded-lg border border-white/10 bg-[var(--lt-bg)] p-3 text-xs font-normal leading-relaxed text-[var(--lt-text)] shadow-xl group-hover:block group-focus-within:block">
            {text}
        </span>
    </span>
);

const AccessibilityCheck: React.FC<{
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    hint?: string;
}> = ({ checked, onChange, label, hint }) => (
    <label className="flex items-start gap-3 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-3 text-sm font-bold text-[var(--lt-text)]">
        <input
            type="checkbox"
            className="mt-0.5"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
        />
        <span className="flex-1">{label}</span>
        {hint && <InfoTooltip text={hint} />}
    </label>
);

type AccessibilityBlockKey = 'mobility' | 'visual' | 'hearing' | 'cognitive';

type AccessibilityField = {
    key: keyof BusinessAccessibilityInfo;
    label: string;
    hint?: string;
};

const ACCESSIBILITY_BLOCKS: Array<{
    id: AccessibilityBlockKey;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    fields: AccessibilityField[];
}> = [
    {
        id: 'mobility',
        title: 'Movilidad',
        description: 'Personas con silla de ruedas o movilidad reducida.',
        icon: Accessibility,
        fields: [
            { key: 'stepFreeEntrance', label: 'Entrada sin escalones', hint: 'Una persona en silla de ruedas puede entrar sin necesidad de ayuda externa ni rampa portátil.' },
            { key: 'accessibleBathroom', label: 'Baño adaptado', hint: 'Con espacio suficiente para giro de silla y barras de apoyo.' },
            { key: 'rampAvailable', label: 'Rampa permanente disponible' },
            { key: 'wheelchairFriendlyTables', label: 'Mesas con espacio para silla de ruedas' },
            { key: 'elevator', label: 'Ascensor (si tiene varias plantas)' },
            { key: 'accessibleParking', label: 'Aparcamiento PMR propio o cercano' },
            { key: 'bathroomGrabBars', label: 'Barras de apoyo en el baño' },
        ],
    },
    {
        id: 'visual',
        title: 'Personas ciegas o con baja visión',
        description: '',
        icon: Eye,
        fields: [
            { key: 'guideDogsWelcome', label: 'Perros guía bienvenidos' },
            { key: 'brailleMenu', label: 'Carta en braille' },
            { key: 'largePrintMenu', label: 'Carta en letra grande' },
            { key: 'digitalMenuScreenReader', label: 'Carta digital compatible con lector de pantalla', hint: 'El QR o web del menú se lee correctamente con TalkBack (Android) o VoiceOver (iOS).' },
        ],
    },
    {
        id: 'hearing',
        title: 'Personas sordas o con baja audición',
        description: '',
        icon: Ear,
        fields: [
            { key: 'hearingLoop', label: 'Bucle magnético', hint: 'Sistema que conecta directamente con audífonos en modo T para oír al personal con claridad.' },
            { key: 'visualMenu', label: 'Carta visual completa', hint: 'Se puede pedir sin depender de oír al camarero recitar la carta o las opciones.' },
            { key: 'quietEnvironment', label: 'Entorno con poco ruido ambiente' },
            { key: 'signLanguageStaff', label: 'Personal con conocimientos de lengua de signos' },
        ],
    },
    {
        id: 'cognitive',
        title: 'Cognitiva, sensorial y TEA',
        description: '',
        icon: Sparkles,
        fields: [
            { key: 'pictogramMenu', label: 'Carta con pictogramas' },
            { key: 'easyReadMenu', label: 'Carta en lectura fácil', hint: 'Texto sencillo, frases cortas e imágenes de apoyo. Pensado para personas con dificultades de lectura o comprensión.' },
            { key: 'sensoryFriendlyArea', label: 'Zona con poca estimulación sensorial' },
        ],
    },
];

const AccessibilityForm: React.FC<{
    doc: BusinessInfoDocument<'accessibility'>;
    onChange: (data: Partial<BusinessAccessibilityInfo>) => void;
}> = ({ doc, onChange }) => {
    const [open, setOpen] = useState<Record<AccessibilityBlockKey, boolean>>({
        mobility: true,
        visual: false,
        hearing: false,
        cognitive: false,
    });
    const toggle = (id: AccessibilityBlockKey) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

    return (
        <div className="space-y-4">
            <SectionTitle title="Accesibilidad" text="Marca solo lo que estés seguro de que cumple el negocio. La información poco clara puede hacer perder un viaje a alguien con limitaciones." />
            {ACCESSIBILITY_BLOCKS.map((block) => {
                const Icon = block.icon;
                const isOpen = open[block.id];
                const checkedCount = block.fields.filter((field) => Boolean(doc.data[field.key])).length;
                return (
                    <div key={block.id} className="overflow-hidden rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)]">
                        <button
                            type="button"
                            onClick={() => toggle(block.id)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        >
                            <div className="flex items-center gap-3">
                                <Icon className="h-5 w-5 text-[var(--lt-accent)]" />
                                <div>
                                    <h3 className="text-sm font-black text-[var(--lt-text)]">{block.title}</h3>
                                    {block.description && <p className="text-xs text-[var(--lt-text-muted)]">{block.description}</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {checkedCount > 0 && (
                                    <span className="rounded-full border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-2 py-0.5 text-[10px] font-black text-[var(--lt-accent)]">
                                        {checkedCount}
                                    </span>
                                )}
                                <ChevronDown className={`h-4 w-4 text-[var(--lt-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </div>
                        </button>
                        {isOpen && (
                            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
                                {block.fields.map((field) => (
                                    <AccessibilityCheck
                                        key={field.key}
                                        label={field.label}
                                        hint={field.hint}
                                        checked={Boolean(doc.data[field.key])}
                                        onChange={(value) => onChange({ [field.key]: value } as Partial<BusinessAccessibilityInfo>)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
            <Field label="Notas">
                <textarea
                    className={`${inputClass} min-h-24`}
                    value={doc.data.notes || ''}
                    onChange={(event) => onChange({ notes: event.target.value })}
                    placeholder="Cualquier matiz que no encaje en las opciones anteriores."
                />
            </Field>
        </div>
    );
};

const FamilyForm: React.FC<{
    doc: BusinessInfoDocument<'family'>;
    onChange: (data: Partial<BusinessFamilyInfo>) => void;
}> = ({ doc, onChange }) => (
    <div className="space-y-4">
        <SectionTitle title="Familias" text="Servicios pensados para ir con bebés o niños pequeños." />
        <div className="grid gap-3 sm:grid-cols-2">
            {([
                ['babyChanging', 'Cambiador para bebés'],
                ['familyRestroom', 'Baño familiar'],
                ['highChairs', 'Tronas para niños'],
                ['kidsMenu', 'Menú o platos infantiles'],
                ['playArea', 'Zona de juegos / parque infantil'],
                ['strollerFriendly', 'Apto para entrar con carrito'],
                ['bottleWarming', 'Calientan biberones / comida del bebé'],
                ['breastfeedingFriendly', 'Espacio cómodo para amamantar'],
            ] as Array<[keyof BusinessFamilyInfo, string]>).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-3 text-sm font-bold text-[var(--lt-text)]">
                    <input
                        type="checkbox"
                        checked={Boolean(doc.data[key])}
                        onChange={(event) => onChange({ [key]: event.target.checked } as Partial<BusinessFamilyInfo>)}
                    />
                    {label}
                </label>
            ))}
        </div>
        <Field label="Notas">
            <textarea
                className={`${inputClass} min-h-24`}
                value={doc.data.notes || ''}
                onChange={(event) => onChange({ notes: event.target.value })}
                placeholder="Detalles sobre menú infantil, horario familiar, etc."
            />
        </Field>
    </div>
);

const PetsForm: React.FC<{
    doc: BusinessInfoDocument<'pets'>;
    onChange: (data: Partial<BusinessPetsInfo>) => void;
}> = ({ doc, onChange }) => (
    <div className="space-y-5">
        <SectionTitle title="Mascotas" text="Datos prácticos para saber si se puede ir con perro u otras mascotas, y con qué condiciones." />

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
            <h3 className="flex items-center gap-2 text-sm font-black text-emerald-100">
                <PawPrint className="h-5 w-5" />
                Política general
            </h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Política de mascotas">
                    <select
                        className={inputClass}
                        value={doc.data.petPolicy || 'unknown'}
                        onChange={(event) => {
                            const petPolicy = event.target.value as BusinessPetsInfo['petPolicy'];
                            onChange({
                                petPolicy,
                                petFriendly: petPolicy === 'allowed' || petPolicy === 'dogs_only' || petPolicy === 'terrace_only',
                                allowsDogs: petPolicy === 'allowed' || petPolicy === 'dogs_only' || petPolicy === 'terrace_only',
                                allowsCats: petPolicy === 'allowed',
                                assistanceDogsOnly: petPolicy === 'assistance_only',
                                terraceOnly: petPolicy === 'terrace_only',
                                indoorAllowed: petPolicy === 'allowed' || petPolicy === 'dogs_only',
                            });
                        }}
                    >
                        {Object.entries(PET_POLICY_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </Field>
                <Field label="Notas visibles">
                    <input
                        className={inputClass}
                        value={doc.data.notes || ''}
                        onChange={(event) => onChange({ notes: event.target.value })}
                        placeholder="Ej. mejor reservar terraza, avisar si vienes con perro..."
                    />
                </Field>
            </div>
        </div>

        <div>
            <h3 className="mb-3 text-sm font-black text-[var(--lt-text)]">Opciones disponibles</h3>
            <div className="grid gap-3 sm:grid-cols-2">
                {[
                    ['indoorAllowed', 'Permite mascotas en interior'],
                    ['waterBowls', 'Tiene cuencos de agua'],
                    ['requiresLeash', 'Requiere correa'],
                ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold text-[var(--lt-text)]">
                        <input
                            type="checkbox"
                            checked={Boolean(doc.data[key as keyof BusinessPetsInfo])}
                            onChange={(event) => onChange({ [key]: event.target.checked } as Partial<BusinessPetsInfo>)}
                        />
                        {label}
                    </label>
                ))}
            </div>
        </div>

        <Field label="Restricciones o condiciones" hint="Marca condiciones frecuentes. Puedes añadir otras separadas por coma en el campo inferior.">
            <SuggestedListInput
                suggestions={PET_RESTRICTION_OPTIONS}
                value={doc.data.restrictions || []}
                onChange={(items) => onChange({ restrictions: items })}
                placeholder="solo perros pequeños, con correa..."
            />
        </Field>
    </div>
);

const DietaryForm: React.FC<{
    doc: BusinessInfoDocument<'dietary'>;
    onChange: (data: Partial<BusinessDietaryInfo>) => void;
}> = ({ doc, onChange }) => (
    <div className="space-y-5">
        <SectionTitle title="Alérgenos y dietas" text="Información sensible para decidir con seguridad, especialmente para personas celíacas o con alergias." />

        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
            <h3 className="text-sm font-black text-amber-100">Sin gluten</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                    ['glutenFreeOptions', 'Tiene opciones sin gluten'],
                    ['manyGlutenFreeOptions', 'Tiene muchos platos sin gluten'],
                    ['glutenFreeMenu', 'Tiene carta o sección sin gluten'],
                ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold text-[var(--lt-text)]">
                        <input
                            type="checkbox"
                            checked={Boolean(doc.data[key as keyof BusinessDietaryInfo])}
                            onChange={(event) => onChange({ [key]: event.target.checked } as Partial<BusinessDietaryInfo>)}
                        />
                        {label}
                    </label>
                ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Contaminación cruzada">
                    <select
                        className={inputClass}
                        value={doc.data.crossContaminationRisk || 'unknown'}
                        onChange={(event) => onChange({ crossContaminationRisk: event.target.value as BusinessDietaryInfo['crossContaminationRisk'] })}
                    >
                        {Object.entries(CROSS_CONTAMINATION_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </Field>
                <Field label="Notas sobre gluten">
                    <input
                        className={inputClass}
                        value={doc.data.crossContaminationNotes || ''}
                        onChange={(event) => onChange({ crossContaminationNotes: event.target.value })}
                        placeholder="Ej. freidora separada, cocina no certificada..."
                    />
                </Field>
            </div>
        </div>

        <div>
            <h3 className="mb-3 text-sm font-black text-[var(--lt-text)]">Opciones dietéticas</h3>
            <div className="grid gap-3 sm:grid-cols-2">
                {[
                    ['vegetarianOptions', 'Opciones vegetarianas'],
                    ['veganOptions', 'Opciones veganas'],
                    ['dairyFreeOptions', 'Opciones sin lactosa/lácteos'],
                    ['nutFreeOptions', 'Opciones sin frutos secos'],
                    ['eggFreeOptions', 'Opciones sin huevo'],
                    ['allergenMenuAvailable', 'Carta de alérgenos disponible'],
                    ['staffCanAdviseAllergens', 'El personal informa sobre alérgenos'],
                ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold text-[var(--lt-text)]">
                        <input
                            type="checkbox"
                            checked={Boolean(doc.data[key as keyof BusinessDietaryInfo])}
                            onChange={(event) => onChange({ [key]: event.target.checked } as Partial<BusinessDietaryInfo>)}
                        />
                        {label}
                    </label>
                ))}
            </div>
        </div>

        <Field label="Notas adicionales">
            <textarea
                className={`${inputClass} min-h-24`}
                value={doc.data.notes || ''}
                onChange={(event) => onChange({ notes: event.target.value })}
                placeholder="Ej. consultar siempre al personal, cocina compartida, opciones bajo reserva..."
            />
        </Field>
    </div>
);

const HoursForm: React.FC<{
    doc: BusinessInfoDocument<'hours'>;
    onChange: (data: Partial<BusinessHoursInfo>) => void;
}> = ({ doc, onChange }) => {
    const weekly = normalizeWeekly(doc.data.weeklySchedule);
    const updateDay = (day: number, patch: Partial<BusinessWeeklyHours>) => {
        const next = weekly.map((item) => item.day === day ? { ...item, ...patch } : item);
        onChange({ weeklySchedule: next });
    };

    return (
        <div className="space-y-4">
            <SectionTitle title="Horarios" text="Primera versión: horario semanal regular. Los especiales y cierres temporales ya quedan en el modelo para más adelante." />
            <div className="space-y-2">
                {weekly.map((day) => {
                    const period = day.periods?.[0] || { open: '', close: '' };
                    return (
                        <div key={day.day} className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:grid-cols-[120px,1fr,1fr,110px] sm:items-center">
                            <span className="text-sm font-bold">{weekdays[day.day]}</span>
                            <input className={inputClass} value={period.open} disabled={day.closed} onChange={(event) => updateDay(day.day, { periods: [{ ...period, open: event.target.value }] })} placeholder="09:00" />
                            <input className={inputClass} value={period.close} disabled={day.closed} onChange={(event) => updateDay(day.day, { periods: [{ ...period, close: event.target.value }] })} placeholder="22:00" />
                            <label className="flex items-center gap-2 text-sm font-bold text-[var(--lt-text-muted)]">
                                <input type="checkbox" checked={day.closed === true} onChange={(event) => updateDay(day.day, { closed: event.target.checked })} />
                                Cerrado
                            </label>
                        </div>
                    );
                })}
            </div>
            <Field label="Notas de horario">
                <textarea className={`${inputClass} min-h-24`} value={doc.data.notes || ''} onChange={(event) => onChange({ notes: event.target.value })} />
            </Field>
        </div>
    );
};

const ReservationsForm: React.FC<{
    doc: BusinessInfoDocument<'reservations'>;
    onChange: (data: Partial<BusinessReservationsInfo>) => void;
}> = ({ doc, onChange }) => (
    <div className="space-y-4">
        <SectionTitle title="Reservas" text="Conecta el lugar con su sistema oficial de reservas. El widget se abre en modal si el proveedor permite iframe." />
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold text-[var(--lt-text)]">
            <input
                type="checkbox"
                checked={doc.data.enabled === true}
                onChange={(event) => onChange({ enabled: event.target.checked })}
            />
            Activar reservas en este lugar
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Proveedor">
                <select
                    className={inputClass}
                    value={doc.data.provider || 'covermanager'}
                    onChange={(event) => onChange({ provider: event.target.value as ReservationProvider })}
                >
                    <option value="covermanager">CoverManager</option>
                    <option value="thefork">TheFork</option>
                    <option value="opentable">OpenTable</option>
                    <option value="zenchef">Zenchef</option>
                    <option value="resy">Resy</option>
                    <option value="google">Google Reserve</option>
                    <option value="custom">Otro / propio</option>
                </select>
            </Field>
        </div>
        <Field label="URL o iframe del widget" hint="Puedes pegar el enlace directo o el iframe que te da CoverManager. Listopic guardará solo la URL segura.">
            <textarea
                className={`${inputClass} min-h-28`}
                value={doc.data.embedUrl || ''}
                onChange={(event) => onChange({ embedUrl: event.target.value })}
                placeholder="https://www.covermanager.com/reservation/module_restaurant/..."
            />
        </Field>
        <Field label="URL externa de respaldo" hint="Se usa si no hay widget o si el iframe no carga. Si la dejas vacia se usara la URL del widget.">
            <input
                className={inputClass}
                value={doc.data.externalUrl || ''}
                onChange={(event) => onChange({ externalUrl: event.target.value })}
                placeholder="https://..."
            />
        </Field>
        <Field label="Texto del botón">
            <input
                className={inputClass}
                value={doc.data.buttonText || 'Reservar mesa'}
                onChange={(event) => onChange({ buttonText: event.target.value })}
            />
        </Field>
        <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-100">
            En la pagina del lugar se muestra un solo boton: abre el widget si existe y, si no, abre este enlace externo.
        </p>
    </div>
);

const DeliveriesForm: React.FC<{
    doc: BusinessInfoDocument<'deliveries'>;
    onChange: (data: Partial<BusinessDeliveriesInfo>) => void;
}> = ({ doc, onChange }) => {
    const links = doc.data.links || [];

    const updateLink = (index: number, patch: Partial<BusinessDeliveryLink>) => {
        onChange({
            links: links.map((link, currentIndex) => (
                currentIndex === index ? { ...link, ...patch } : link
            )),
        });
    };

    const addLink = () => {
        onChange({
            enabled: true,
            links: [...links, { provider: 'glovo', label: '', url: '' }],
        });
    };

    const removeLink = (index: number) => {
        const next = links.filter((_, currentIndex) => currentIndex !== index);
        onChange({ links: next, enabled: next.length > 0 ? doc.data.enabled : false });
    };

    return (
        <div className="space-y-4">
            <SectionTitle title="Delivery" text="Enlaces oficiales para pedir comida a domicilio o recoger pedidos desde plataformas externas." />
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold text-[var(--lt-text)]">
                <input
                    type="checkbox"
                    checked={doc.data.enabled === true}
                    onChange={(event) => onChange({ enabled: event.target.checked })}
                />
                Mostrar pedidos a domicilio en este lugar
            </label>

            <div className="space-y-3">
                {links.map((link, index) => (
                    <div key={`${link.provider || 'delivery'}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="grid gap-3 lg:grid-cols-[180px,1fr,1.4fr,44px]">
                            <Field label="Proveedor">
                                <select
                                    className={inputClass}
                                    value={link.provider || 'custom'}
                                    onChange={(event) => updateLink(index, { provider: event.target.value as DeliveryProvider })}
                                >
                                    {DELIVERY_PROVIDER_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Texto visible">
                                <input
                                    className={inputClass}
                                    value={link.label || ''}
                                    onChange={(event) => updateLink(index, { label: event.target.value })}
                                    placeholder="Pedir en Glovo"
                                />
                            </Field>
                            <Field label="URL">
                                <input
                                    className={inputClass}
                                    value={link.url || ''}
                                    onChange={(event) => updateLink(index, { url: event.target.value })}
                                    placeholder="https://..."
                                />
                            </Field>
                            <button
                                type="button"
                                onClick={() => removeLink(index)}
                                className="mt-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                                aria-label="Eliminar enlace"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={addLink}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-[var(--lt-text)] hover:bg-white/10"
            >
                <Plus className="h-4 w-4" />
                Añadir enlace de delivery
            </button>

            <Field label="Notas">
                <textarea
                    className={`${inputClass} min-h-24`}
                    value={doc.data.notes || ''}
                    onChange={(event) => onChange({ notes: event.target.value })}
                    placeholder="Ejemplo: también hacen reparto propio por teléfono los fines de semana."
                />
            </Field>
        </div>
    );
};

const SectionTitle: React.FC<{ title: string; text: string }> = ({ title, text }) => (
    <div>
        <h2 className="text-xl font-black text-[var(--lt-text)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--lt-text-muted)]">{text}</p>
    </div>
);

const HideGoogleField: React.FC<{ checked: boolean; label: string; onChange: (checked: boolean) => void }> = ({ checked, label, onChange }) => (
    <label className="flex items-center gap-2 text-xs font-bold text-[var(--lt-text-muted)]">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        {label}
    </label>
);

function normalizeWeekly(value: BusinessWeeklyHours[] | undefined): BusinessWeeklyHours[] {
    const byDay = new Map((value || []).map((item) => [item.day, item]));
    return Array.from({ length: 7 }, (_, index) => ({
        day: index,
        closed: byDay.get(index)?.closed || false,
        periods: byDay.get(index)?.periods?.length ? byDay.get(index)?.periods : [{ open: '', close: '' }],
    }));
}

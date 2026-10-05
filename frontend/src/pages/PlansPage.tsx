import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { Building2, Check, Gift, Loader2, Sparkles, Star } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useAuthPrompt } from '../context/AuthPromptContext';
import { Footer } from '../components/Footer';
import {
    formatEur,
    PLAN_BETA_PRICES,
    PLAN_BETA_TRIAL_DAYS,
    type BetaPlanId,
    type BillingPeriod,
} from '../config/planBeta';
import { describePlanInterestResult, registerPlanInterest } from '../services/PlanInterestService';

const FREE_FEATURES = [
    'Crear listas y minilistas, valorar y reseñar.',
    'Seguir a gente, colecciones y chats.',
    'Retos, niveles e insignias.',
];

// Aún no existen: se anuncian como «en camino» para medir el interés.
const PREMIUM_FEATURES = [
    'Insignia de supporter en tu perfil.',
    'Mapa personal de tus sitios y pasaporte por barrios.',
    'Galería de hasta 3 fotos de perfil.',
    'Feed sin lugares patrocinados.',
    'Acceso temprano a lo nuevo.',
];

const BUSINESS_FEATURES = [
    'Personalización visual de la página del negocio.',
    'Carta y elementos oficiales con foto, precio y descripción.',
    'Ofertas y contenido destacado, siempre etiquetado como promocionado.',
];

interface ManagedPlace {
    id: string;
    name: string;
}

const getErrorMessage = (error: unknown): string => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return 'No se pudo guardar. Inténtalo de nuevo.';
};

export const PlansPage: React.FC = () => {
    const { user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const [billing, setBilling] = useState<BillingPeriod>('monthly');
    const [places, setPlaces] = useState<ManagedPlace[]>([]);
    const [placeId, setPlaceId] = useState('');
    const [working, setWorking] = useState<BetaPlanId | null>(null);
    const [messages, setMessages] = useState<Partial<Record<BetaPlanId, { ok: boolean; text: string }>>>({});

    useEffect(() => {
        if (!user?.uid) {
            setPlaces([]);
            return;
        }
        let cancelled = false;
        const load = async () => {
            try {
                const [managedSnap, ownedSnap] = await Promise.all([
                    getDocs(query(collection(db, 'places'), where('businessManagerIds', 'array-contains', user.uid), limit(50))),
                    getDocs(query(collection(db, 'places'), where('businessOwnerUserId', '==', user.uid), limit(50))),
                ]);
                if (cancelled) return;
                const byId = new Map<string, ManagedPlace>();
                [...managedSnap.docs, ...ownedSnap.docs].forEach((snap) => {
                    const data = snap.data() as Record<string, unknown>;
                    if (data.businessVerified !== true) return;
                    byId.set(snap.id, { id: snap.id, name: typeof data.name === 'string' ? data.name : 'Mi local' });
                });
                const list = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
                setPlaces(list);
                setPlaceId((current) => current || list[0]?.id || '');
            } catch (error) {
                console.error('PlansPage: failed loading managed places', error);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [user?.uid]);

    const handleWant = async (plan: BetaPlanId) => {
        if (!user) {
            openAuthPrompt(plan === 'premium' ? 'probar Premium gratis' : 'probar Business Pro gratis');
            return;
        }
        setWorking(plan);
        setMessages((prev) => ({ ...prev, [plan]: undefined }));
        try {
            const result = await registerPlanInterest(plan, billing, plan === 'business_pro' ? placeId || undefined : undefined);
            setMessages((prev) => ({ ...prev, [plan]: { ok: true, text: describePlanInterestResult(result) } }));
        } catch (error) {
            console.error('PlansPage: registerPlanInterest failed', error);
            setMessages((prev) => ({ ...prev, [plan]: { ok: false, text: getErrorMessage(error) } }));
        } finally {
            setWorking(null);
        }
    };

    const price = (plan: BetaPlanId) => {
        const prices = PLAN_BETA_PRICES[plan];
        return billing === 'yearly' ? `${formatEur(prices.yearlyEur)}/año` : `${formatEur(prices.monthlyEur)}/mes`;
    };

    const renderMessage = (plan: BetaPlanId) => {
        const message = messages[plan];
        if (!message) return null;
        return (
            <p
                role="status"
                className={`mt-3 rounded-xl border px-3 py-2 text-sm ${message.ok
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                    : 'border-red-500/25 bg-red-500/10 text-red-200'}`}
            >
                {message.text}
            </p>
        );
    };

    const wantButton = (plan: BetaPlanId, label: string) => (
        <button
            type="button"
            onClick={() => void handleWant(plan)}
            disabled={working !== null}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 text-sm font-black text-white shadow-lg disabled:opacity-60"
        >
            {working === plan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {label}
        </button>
    );

    return (
        <>
            <div className="min-h-screen bg-[var(--lt-bg)] pb-10" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 5.5rem)' }}>
                <div className="mx-auto max-w-5xl px-4 sm:px-6">
                    <header className="text-center">
                        <h1 className="text-3xl font-display font-bold text-[var(--lt-text)] sm:text-4xl">Planes de Listopic</h1>
                        <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--lt-text-muted)]">
                            Estamos decidiendo qué planes lanzar. Dinos cuál quieres y pruébalo gratis.
                        </p>
                    </header>

                    <div role="note" className="mx-auto mt-6 flex max-w-2xl items-start gap-3 rounded-2xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-4 py-3 text-sm text-[var(--lt-text)]">
                        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-[var(--lt-accent)]" />
                        <p>
                            <strong>Beta gratuita por tiempo limitado.</strong> Al pulsar «Lo quiero» activas el plan gratis durante {PLAN_BETA_TRIAL_DAYS} días.
                            No pedimos tarjeta ni cobramos nada: al acabar vuelve solo al plan gratuito. Los precios son orientativos y
                            nos ayudan a saber qué te parecería justo.
                        </p>
                    </div>

                    <div className="mt-6 flex justify-center">
                        <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-sm font-bold" role="group" aria-label="Periodo de pago">
                            {(['monthly', 'yearly'] as BillingPeriod[]).map((period) => (
                                <button
                                    key={period}
                                    type="button"
                                    onClick={() => setBilling(period)}
                                    aria-pressed={billing === period}
                                    className={`rounded-full px-4 py-1.5 transition-colors ${billing === period
                                        ? 'bg-[var(--lt-accent)] text-white'
                                        : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                                >
                                    {period === 'monthly' ? 'Mensual' : 'Anual'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-8 grid gap-5 md:grid-cols-3">
                        <section className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                            <h2 className="text-lg font-black text-[var(--lt-text)]">Gratis</h2>
                            <p className="mt-1 text-2xl font-black text-[var(--lt-text)]">0 €</p>
                            <ul className="mt-4 space-y-2 text-sm text-[var(--lt-text-muted)]">
                                {FREE_FEATURES.map((feature) => (
                                    <li key={feature} className="flex items-start gap-2">
                                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <section className="rounded-2xl border border-[var(--lt-accent-border)] bg-[var(--lt-card-strong)] p-6">
                            <h2 className="flex items-center gap-2 text-lg font-black text-[var(--lt-text)]">
                                <Star className="h-5 w-5 text-[var(--lt-accent)]" /> Premium
                            </h2>
                            <p className="mt-1 text-2xl font-black text-[var(--lt-text)]">
                                {price('premium')} <span className="text-sm font-bold text-emerald-400">· gratis en beta</span>
                            </p>
                            <p className="mt-2 text-xs text-[var(--lt-text-muted)]">Para quien quiere apoyar Listopic. Lo que llegará:</p>
                            <ul className="mt-3 space-y-2 text-sm text-[var(--lt-text-muted)]">
                                {PREMIUM_FEATURES.map((feature) => (
                                    <li key={feature} className="flex items-start gap-2">
                                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lt-accent)]" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>
                            {wantButton('premium', 'Lo quiero gratis')}
                            {renderMessage('premium')}
                        </section>

                        <section className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                            <h2 className="flex items-center gap-2 text-lg font-black text-[var(--lt-text)]">
                                <Building2 className="h-5 w-5 text-[var(--lt-accent)]" /> Business Pro
                            </h2>
                            <p className="mt-1 text-2xl font-black text-[var(--lt-text)]">
                                {price('business_pro')} <span className="text-sm font-bold text-emerald-400">· gratis en beta</span>
                            </p>
                            <p className="mt-2 text-xs text-[var(--lt-text-muted)]">Por local, para negocios verificados:</p>
                            <ul className="mt-3 space-y-2 text-sm text-[var(--lt-text-muted)]">
                                {BUSINESS_FEATURES.map((feature) => (
                                    <li key={feature} className="flex items-start gap-2">
                                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>
                            {places.length > 0 ? (
                                <>
                                    {places.length > 1 && (
                                        <label className="mt-4 block text-xs font-bold text-[var(--lt-text-muted)]">
                                            Local
                                            <select
                                                value={placeId}
                                                onChange={(event) => setPlaceId(event.target.value)}
                                                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--lt-text)]"
                                            >
                                                {places.map((place) => (
                                                    <option key={place.id} value={place.id}>{place.name}</option>
                                                ))}
                                            </select>
                                        </label>
                                    )}
                                    {wantButton('business_pro', places.length === 1 ? `Lo quiero para ${places[0].name}` : 'Lo quiero gratis')}
                                </>
                            ) : (
                                <>
                                    {wantButton('business_pro', 'Me interesa')}
                                    <p className="mt-3 text-xs text-[var(--lt-text-muted)]">
                                        Para activarlo, reclama tu local desde su ficha en Listopic. Cuando lo verifiquemos, vuelve aquí.
                                    </p>
                                </>
                            )}
                            {renderMessage('business_pro')}
                        </section>
                    </div>

                    <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-[var(--lt-text-muted)]">
                        Guardamos qué plan te interesa y el periodo que elegiste para decidir qué lanzar. Si algún día cobramos,
                        te avisaremos antes y nada se renovará solo. Dudas en <Link to="/about" className="underline">Sobre Listopic</Link>.
                    </p>
                </div>
            </div>
            <Footer compact />
        </>
    );
};

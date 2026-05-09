import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Building2, Check, Loader2, Save } from 'lucide-react';
import { db } from '../firebase';
import {
    getBusinessInfoForManager,
    updateBusinessInfoSection,
    type BusinessInfoSectionsResponse,
} from '../services/BusinessInfoService';
import type {
    BusinessAccessibilityInfo,
    BusinessCommercialInfo,
    BusinessContactInfo,
    BusinessDietaryInfo,
    BusinessHoursInfo,
    BusinessIdentityInfo,
    BusinessInfoDocument,
    BusinessInfoSection,
    BusinessReservationsInfo,
    BusinessWeeklyHours,
    ReservationDisplayMode,
    ReservationProvider,
} from '../types/businessInfo';
import { ALLERGEN_OPTIONS, BUSINESS_SERVICE_OPTIONS, CROSS_CONTAMINATION_LABELS, PAYMENT_METHOD_OPTIONS, PRICE_RANGE_LABELS } from '../constants/businessOptions';

type PlaceHeader = {
    name?: string;
    address?: string;
    mainImageUrl?: string;
    userPhotoUrl?: string;
};

type Message = { type: 'success' | 'error'; text: string } | null;

const weekdays = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
const emptySections: Record<BusinessInfoSection, BusinessInfoDocument> = {
    identity: { section: 'identity', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    contact: { section: 'contact', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    commercial: { section: 'commercial', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    accessibility: { section: 'accessibility', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    dietary: { section: 'dietary', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    hours: { section: 'hours', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
    reservations: { section: 'reservations', schemaVersion: 1, source: 'business_user', status: 'active', tier: 'free', version: 0, hiddenFields: [], data: {} },
};

const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const joinList = (value: string[] | undefined) => (value || []).join(', ');

const getErrorMessage = (error: unknown) => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return 'No se pudo guardar la informacion.';
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

export const BusinessManagePage: React.FC = () => {
    const { placeId } = useParams<{ placeId: string }>();
    const [place, setPlace] = useState<PlaceHeader | null>(null);
    const [sections, setSections] = useState<Record<BusinessInfoSection, BusinessInfoDocument>>(emptySections);
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
                });
                setSections(normalizeSections(info));
            } catch (error) {
                console.error('BusinessManagePage: load failed', error);
                if (!cancelled) setMessage({ type: 'error', text: 'No se pudo cargar la gestion del negocio.' });
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
            setMessage({ type: 'success', text: 'Informacion guardada.' });
        } catch (error) {
            console.error('BusinessManagePage: save failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error) });
        } finally {
            setSaving(null);
        }
    };

    const navItems = useMemo(() => ([
        ['identity', 'Identidad'],
        ['contact', 'Contacto'],
        ['commercial', 'Comercial'],
        ['accessibility', 'Accesibilidad'],
        ['dietary', 'Alergenos'],
        ['hours', 'Horarios'],
        ['reservations', 'Reservas'],
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
                            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase text-emerald-300">
                                <Check className="h-3.5 w-3.5" />
                                Negocio verificado
                            </div>
                            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-4xl">{place?.name || 'Gestionar negocio'}</h1>
                            {place?.address && <p className="mt-2 text-sm text-[var(--lt-text-muted)]">{place.address}</p>}
                            <p className="mt-4 max-w-2xl text-sm text-[var(--lt-text-muted)]">
                                Estos datos tienen prioridad sobre Google cuando esten activos. Los metadatos internos del plan no se muestran publicamente.
                            </p>
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
                    <div className="mt-6 grid gap-5 lg:grid-cols-[240px,1fr]">
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

                            <div className="mt-6 flex justify-end border-t border-white/10 pt-5">
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
                        </section>
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
        dietary: { ...emptySections.dietary, ...(info.sections?.dietary || {}) },
        hours: { ...emptySections.hours, ...(info.sections?.hours || {}) },
        reservations: { ...emptySections.reservations, ...(info.sections?.reservations || {}) },
    };
}

const IdentityForm: React.FC<{
    doc: BusinessInfoDocument<'identity'>;
    onChange: (data: Partial<BusinessIdentityInfo>) => void;
}> = ({ doc, onChange }) => (
    <div className="space-y-4">
        <SectionTitle title="Identidad" text="Nombre visible, descripcion e idiomas que el negocio quiere destacar." />
        <Field label="Nombre visible">
            <input className={inputClass} value={doc.data.displayName?.es || ''} onChange={(event) => onChange({ displayName: { ...doc.data.displayName, es: event.target.value } })} />
        </Field>
        <Field label="Descripcion">
            <textarea className={`${inputClass} min-h-32`} value={doc.data.description?.es || ''} onChange={(event) => onChange({ description: { ...doc.data.description, es: event.target.value } })} />
        </Field>
        <Field label="Idiomas" hint="Separados por coma. Ejemplo: espanol, ingles, frances">
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
        <SectionTitle title="Contacto" text="Datos de contacto publicos. Puedes ocultar datos de Google aunque no pongas sustituto." />
        <Field label="Telefono">
            <input className={inputClass} value={doc.data.phone || ''} onChange={(event) => onChange({ phone: event.target.value })} />
        </Field>
        <HideGoogleField checked={doc.hiddenFields.includes('phone')} label="Ocultar telefono de Google si este campo esta vacio" onChange={(checked) => onHiddenChange('phone', checked)} />
        <Field label="Web">
            <input className={inputClass} value={doc.data.website || ''} onChange={(event) => onChange({ website: event.target.value })} placeholder="https://..." />
        </Field>
        <HideGoogleField checked={doc.hiddenFields.includes('website')} label="Ocultar web de Google si este campo esta vacio" onChange={(checked) => onHiddenChange('website', checked)} />
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
        <SectionTitle title="Comercial" text="Categoria real del negocio, servicios y metodos de pago." />
        <Field label="Rango de precio">
            <select className={inputClass} value={doc.data.priceRange || ''} onChange={(event) => onChange({ priceRange: event.target.value as BusinessCommercialInfo['priceRange'] })}>
                <option value="">Sin definir</option>
                {Object.entries(PRICE_RANGE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                ))}
            </select>
        </Field>
        <Field label="Tipos de cocina / categoria" hint="Separados por coma. Ejemplo: mexicana, brunch, cafeteria">
            <ListInput value={doc.data.cuisineTypes || []} onChange={(items) => onChange({ cuisineTypes: items })} placeholder="mexicana, brunch, cafeteria" />
        </Field>
        <Field label="Metodos de pago" hint="Elige los habituales. Puedes anadir otros al final.">
            <OptionGrid
                options={PAYMENT_METHOD_OPTIONS}
                value={doc.data.paymentMethods || []}
                onChange={(items) => onChange({ paymentMethods: items })}
            />
        </Field>
        <Field label="Servicios" hint="Selecciona solo lo que el local ofrece de verdad.">
            <OptionGrid
                options={BUSINESS_SERVICE_OPTIONS}
                value={doc.data.services || []}
                onChange={(items) => onChange({ services: items })}
            />
        </Field>
    </div>
);

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

const AccessibilityForm: React.FC<{
    doc: BusinessInfoDocument<'accessibility'>;
    onChange: (data: Partial<BusinessAccessibilityInfo>) => void;
}> = ({ doc, onChange }) => (
    <div className="space-y-4">
        <SectionTitle title="Accesibilidad" text="Informacion practica para decidir antes de ir." />
        <div className="grid gap-3 sm:grid-cols-2">
            {[
                ['wheelchairAccess', 'Acceso para silla de ruedas'],
                ['accessibleBathroom', 'Bano adaptado'],
                ['stepFreeEntrance', 'Entrada sin escalon'],
                ['babyChanging', 'Cambiador para bebes'],
                ['petFriendly', 'Acepta mascotas'],
                ['hearingLoop', 'Bucle magnetico'],
            ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold text-[var(--lt-text)]">
                    <input
                        type="checkbox"
                        checked={Boolean(doc.data[key as keyof BusinessAccessibilityInfo])}
                        onChange={(event) => onChange({ [key]: event.target.checked } as Partial<BusinessAccessibilityInfo>)}
                    />
                    {label}
                </label>
            ))}
        </div>
        <Field label="Notas">
            <textarea className={`${inputClass} min-h-24`} value={doc.data.notes || ''} onChange={(event) => onChange({ notes: event.target.value })} />
        </Field>
    </div>
);

const DietaryForm: React.FC<{
    doc: BusinessInfoDocument<'dietary'>;
    onChange: (data: Partial<BusinessDietaryInfo>) => void;
}> = ({ doc, onChange }) => (
    <div className="space-y-5">
        <SectionTitle title="Alergenos y dietas" text="Informacion sensible para decidir con seguridad, especialmente para personas celiacas o con alergias." />

        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
            <h3 className="text-sm font-black text-amber-100">Sin gluten</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                    ['glutenFreeOptions', 'Tiene opciones sin gluten'],
                    ['manyGlutenFreeOptions', 'Tiene muchos platos sin gluten'],
                    ['glutenFreeMenu', 'Tiene carta o seccion sin gluten'],
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
                <Field label="Contaminacion cruzada">
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
            <h3 className="mb-3 text-sm font-black text-[var(--lt-text)]">Opciones dieteticas</h3>
            <div className="grid gap-3 sm:grid-cols-2">
                {[
                    ['vegetarianOptions', 'Opciones vegetarianas'],
                    ['veganOptions', 'Opciones veganas'],
                    ['dairyFreeOptions', 'Opciones sin lactosa/lacteos'],
                    ['nutFreeOptions', 'Opciones sin frutos secos'],
                    ['eggFreeOptions', 'Opciones sin huevo'],
                    ['allergenMenuAvailable', 'Carta de alergenos disponible'],
                    ['staffCanAdviseAllergens', 'El personal informa sobre alergenos'],
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

        <Field label="Alergenos relevantes" hint="Marca los alergenos que el negocio tiene identificados o trata de forma especifica.">
            <OptionGrid
                options={ALLERGEN_OPTIONS}
                value={doc.data.allergens || []}
                onChange={(items) => onChange({ allergens: items })}
            />
        </Field>

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
            <SectionTitle title="Horarios" text="Primera version: horario semanal regular. Los especiales y cierres temporales ya quedan en el modelo para mas adelante." />
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
            <Field label="Modo">
                <select
                    className={inputClass}
                    value={doc.data.displayMode || 'modal'}
                    onChange={(event) => onChange({ displayMode: event.target.value as ReservationDisplayMode })}
                >
                    <option value="modal">Modal incrustado</option>
                    <option value="external">Boton externo</option>
                    <option value="both">Modal + boton externo</option>
                </select>
            </Field>
        </div>
        <Field label="URL o iframe del widget" hint="Puedes pegar el enlace directo o el iframe que te da CoverManager. Listopic guardara solo la URL segura.">
            <textarea
                className={`${inputClass} min-h-28`}
                value={doc.data.embedUrl || ''}
                onChange={(event) => onChange({ embedUrl: event.target.value })}
                placeholder="https://www.covermanager.com/reservation/module_restaurant/..."
            />
        </Field>
        <Field label="URL externa de respaldo" hint="Se usa si el iframe no carga o si eliges boton externo. Si la dejas vacia se usara la URL del widget.">
            <input
                className={inputClass}
                value={doc.data.externalUrl || ''}
                onChange={(event) => onChange({ externalUrl: event.target.value })}
                placeholder="https://..."
            />
        </Field>
        <Field label="Texto del boton">
            <input
                className={inputClass}
                value={doc.data.buttonText || 'Reservar mesa'}
                onChange={(event) => onChange({ buttonText: event.target.value })}
            />
        </Field>
        <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-100">
            Algunos proveedores pueden bloquear el iframe fuera de dominios autorizados. En ese caso, el usuario puede abrir la reserva con el boton externo.
        </p>
    </div>
);

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

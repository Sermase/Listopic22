import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Lock } from 'lucide-react';
import { signOutAndForget } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFilters, DEFAULT_RANGE_KM, RANGE_STEPS_KM } from '../context/FilterContext';
import { useTheme } from '../context/ThemeContext';
import { usePreferences } from '../context/PreferencesContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { updateUserSettings } from '../services/UserProfileService';
import { MAP_LAYERS, MAP_LAYER_STORAGE_KEY, DEFAULT_MAP_LAYER, type MapLayerId } from '../utils/mapUtils';
import { reopenWelcome } from '../lib/welcome';
import { Modal } from '../components/ui/Modal';
import { MyDataRequest } from '../components/profile/MyDataRequest';
import { EditProfileSheet } from '../components/settings/EditProfileSheet';
import { DeleteAccountSheet } from '../components/settings/DeleteAccountSheet';
import { FilterGroup, FilterSummary, Knob, Toggle, type FilterGroupId } from '../components/settings/MyFilters';
import { NavTabsEditor, NavTabsSummary } from '../components/settings/NavTabsEditor';
import { setUserWantsSurprises, userWantsSurprises } from '../lib/surprises';
import { requestShakePermission, shakeNeedsPermission } from '../components/surprises/useShake';
import { haptic, isHapticsOn, setHapticsOn } from '../utils/haptics';

type SheetId = 'profile' | 'notifications' | 'data' | 'distance' | 'map' | 'theme' | 'nav' | FilterGroupId | 'delete';

const NO_LIMIT = 999999;

const NOTIFICATIONS: { key: string; label: string }[] = [
    { key: 'new_message', label: 'Mensajes nuevos' },
    { key: 'new_follower', label: 'Nuevos seguidores' },
    { key: 'review_comment', label: 'Comentarios en tus reseñas' },
    { key: 'review_like', label: 'Likes en tus reseñas' },
    { key: 'list_follow', label: 'Alguien sigue una lista tuya' },
    { key: 'level_up', label: 'Subidas de nivel' },
    { key: 'badge_earned', label: 'Medallas desbloqueadas' },
];

const FILTERS: { id: FilterGroupId; emoji: string; label: string }[] = [
    { id: 'food', emoji: '🍽️', label: 'Comida y alérgenos' },
    { id: 'mobility', emoji: '♿', label: 'Movilidad' },
    { id: 'pets', emoji: '🐾', label: 'Mascotas' },
];

const validLayer = (value: unknown): MapLayerId | null => (typeof value === 'string' && value in MAP_LAYERS ? value as MapLayerId : null);

const readMapLayer = (): MapLayerId | null => {
    try {
        return validLayer(localStorage.getItem(MAP_LAYER_STORAGE_KEY));
    } catch {
        return null;
    }
};

const distanceLabel = (km: number | null) => (km === null || km >= NO_LIMIT ? 'Sin límite' : `${km} km`);

const Section: React.FC<{ title: string; note?: React.ReactNode; children: React.ReactNode }> = ({ title, note, children }) => (
    <section>
        <h2 className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">{title}</h2>
        <div className="divide-y divide-[var(--lt-border)] overflow-hidden rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)]">{children}</div>
        {note && <p className="mt-1.5 px-1 text-xs leading-snug text-[var(--lt-text-muted)]">{note}</p>}
    </section>
);

const rowClass = 'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--lt-glass)]';

const Row: React.FC<{ emoji: string; label: string; value?: React.ReactNode; onClick?: () => void; to?: string; danger?: boolean }> = ({ emoji, label, value, onClick, to, danger }) => {
    const body = (
        <>
            <span className="w-6 shrink-0 text-center text-lg" aria-hidden="true">{emoji}</span>
            <span className={`flex-1 text-sm font-semibold ${danger ? 'text-[var(--lt-danger)]' : 'text-[var(--lt-text)]'}`}>{label}</span>
            {value && <span className="max-w-[45%] truncate text-xs text-[var(--lt-text-muted)]">{value}</span>}
            {!danger && <ChevronRight className="h-4 w-4 shrink-0 text-[var(--lt-text-muted)]" aria-hidden="true" />}
        </>
    );
    return to ? <Link to={to} className={rowClass}>{body}</Link> : <button type="button" onClick={onClick} className={rowClass}>{body}</button>;
};

const SwitchRow: React.FC<{ emoji: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }> = ({ emoji, label, hint, checked, onChange }) => (
    <label className={`${rowClass} cursor-pointer`}>
        <span className="w-6 shrink-0 text-center text-lg" aria-hidden="true">{emoji}</span>
        <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--lt-text)]">{label}</span>
            <span className="block text-xs text-[var(--lt-text-muted)]">{hint}</span>
        </span>
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => { onChange(e.target.checked); haptic('selection'); }} />
        <Knob on={checked} />
    </label>
);

const FilterRow: React.FC<{ group: FilterGroupId; emoji: string; label: string; onOpen: () => void }> = ({ group, emoji, label, onOpen }) => (
    <Row emoji={emoji} label={label} value={<FilterSummary group={group} />} onClick={onOpen} />
);

/** Lista de opciones en una ventana: se elige con un toque y se cierra sola. */
const Choices = <T extends string | number>({ options, value, onPick }: { options: { id: T; label: string; emoji?: string }[]; value: T; onPick: (id: T) => void }) => (
    <div className="divide-y divide-[var(--lt-border)] overflow-hidden rounded-2xl border border-[var(--lt-border)]">
        {options.map((o) => (
            <button key={String(o.id)} type="button" aria-pressed={o.id === value} onClick={() => onPick(o.id)} className={rowClass}>
                {o.emoji && <span className="w-6 text-center text-lg" aria-hidden="true">{o.emoji}</span>}
                <span className="flex-1 text-sm font-semibold text-[var(--lt-text)]">{o.label}</span>
                {o.id === value && <Check className="h-4 w-4 text-[var(--lt-accent)]" strokeWidth={3} />}
            </button>
        ))}
    </div>
);

/** Preferencias: todo lo que se ajusta de Listopic, en un sitio. Cada fila abre su ventana. */
export const SettingsPage: React.FC = () => {
    const { user } = useAuth();
    const { profile } = useUserProfile(user?.uid);
    const { range, setRange } = useFilters();
    const { theme, setTheme, themes, nextLocked } = useTheme();
    const { prefs, setPref } = usePreferences();
    const [sheet, setSheet] = useState<SheetId | null>(null);
    const [mapChoice, setMapChoice] = useState<MapLayerId | null>(readMapLayer);
    const [notifOverride, setNotifOverride] = useState<Record<string, boolean> | null>(null);
    const close = () => setSheet(null);
    const [surprises, setSurprises] = useState(userWantsSurprises);
    const [shakeAsk, setShakeAsk] = useState(shakeNeedsPermission);
    const [vibration, setVibration] = useState(isHapticsOn);
    const toggleVibration = (on: boolean) => {
        setHapticsOn(on);
        setVibration(on);
    };
    const toggleSurprises = (on: boolean) => {
        setUserWantsSurprises(on);
        setSurprises(on);
        // En iPhone, agitar el móvil necesita permiso, y solo se puede pedir con un toque.
        if (on && shakeAsk) void requestShakePermission().then((ok) => { if (ok) setShakeAsk(false); });
    };

    const notif = { ...(profile?.notificationPreferences || {}), ...(notifOverride || {}) };
    // En este dispositivo manda lo guardado aquí (como en el mapa); si no hay, lo de la cuenta.
    const mapLayer = mapChoice ?? validLayer(profile?.mapLayerPreference) ?? DEFAULT_MAP_LAYER;
    const notifOn = NOTIFICATIONS.filter((n) => notif[n.key] !== false).length;
    const distance = user ? (profile?.defaultDistanceKm ?? DEFAULT_RANGE_KM) : (range ?? NO_LIMIT);
    const themeMeta = themes.find((t) => t.id === theme);
    const name = profile?.displayName || profile?.username || user?.displayName || 'Tu perfil';
    const photo = profile?.photoUrl || user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=374151&color=fff`;

    const pickDistance = (km: number) => {
        setRange(km >= NO_LIMIT ? null : km);
        if (user) void updateUserSettings(user.uid, { defaultDistanceKm: km }).catch((e) => console.warn('Preferencias: distancia', e));
        close();
    };
    const pickMap = (id: MapLayerId) => {
        setMapChoice(id);
        try { localStorage.setItem(MAP_LAYER_STORAGE_KEY, id); } catch { /* opcional */ }
        if (user) void updateUserSettings(user.uid, { mapLayerPreference: id }).catch((e) => console.warn('Preferencias: mapa', e));
        close();
    };
    const toggleNotif = (key: string, on: boolean) => {
        if (!user) return;
        setNotifOverride((prev) => ({ ...(prev || {}), [key]: on }));
        // Solo la clave tocada: el resto de avisos guardados no se pisa aunque el perfil aún no haya cargado.
        void updateUserSettings(user.uid, { notificationPreferences: { [key]: on } }).catch((e) => console.warn('Preferencias: avisos', e));
    };
    const logout = async () => {
        await signOutAndForget('/login');
    };

    return (
        <div className="min-h-screen bg-[var(--lt-bg)] px-4 pb-24 pt-safe-24">
            <div className="mx-auto max-w-2xl space-y-6 pt-4">
                <h1 className="font-display text-2xl font-bold text-[var(--lt-text)]">Preferencias</h1>

                {user ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] p-3">
                        <Link to="/profile" className="flex min-w-0 flex-1 items-center gap-3">
                            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--lt-border)] bg-[var(--lt-accent-soft)] text-xl font-bold text-[var(--lt-text)]">
                                {name.charAt(0).toUpperCase()}
                                <img key={photo} src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate font-bold text-[var(--lt-text)]">{name}</span>
                                {profile?.username && <span className="block truncate text-xs text-[var(--lt-text-muted)]">@{profile.username}</span>}
                            </span>
                        </Link>
                        <button type="button" onClick={() => setSheet('profile')} className="shrink-0 rounded-xl border border-[var(--lt-border)] px-3 py-2 text-xs font-bold text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]">
                            Editar perfil
                        </button>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] p-4">
                        <p className="text-sm text-[var(--lt-text)]">Entra para tener perfil y avisos, y para que tus preferencias te sigan en cualquier móvil.</p>
                        <Link to="/login" className="mt-3 inline-flex rounded-xl px-4 py-2 text-sm font-bold lt-on-accent" style={{ backgroundImage: 'var(--lt-accent-grad)' }}>Entrar o crear cuenta</Link>
                    </div>
                )}

                {user && (
                    <Section title="Tu cuenta">
                        <Row emoji="👤" label="Perfil" value="Foto, nombre y bio" onClick={() => setSheet('profile')} />
                        <Row emoji="🔔" label="Avisos" value={notifOn === NOTIFICATIONS.length ? 'Todos' : notifOn === 0 ? 'Ninguno' : `${notifOn} de ${NOTIFICATIONS.length}`} onClick={() => setSheet('notifications')} />
                        <Row emoji="📦" label="Tus datos" value="Pedir una copia" onClick={() => setSheet('data')} />
                    </Section>
                )}

                <Section title="Uso">
                    <Row emoji="📍" label="Distancia por defecto" value={distanceLabel(distance)} onClick={() => setSheet('distance')} />
                    <Row emoji="🗺️" label="Mapa" value={MAP_LAYERS[mapLayer]?.label} onClick={() => setSheet('map')} />
                    <Row emoji="🎨" label="Tema" value={themeMeta?.label} onClick={() => setSheet('theme')} />
                    {/* La barra de abajo solo existe en el móvil. */}
                    <div className="md:hidden"><Row emoji="📱" label="Barra de abajo" value={<NavTabsSummary />} onClick={() => setSheet('nav')} /></div>
                    <SwitchRow emoji="ⓘ" label="Ayudas en la app" hint="Los iconos ⓘ que explican cada parte" checked={prefs.showHelpTips} onChange={(v) => setPref('showHelpTips', v)} />
                    <SwitchRow emoji="📳" label="Vibración" hint="Un toquecito al votar, publicar, reaccionar o ganar una medalla" checked={vibration} onChange={toggleVibration} />
                    <SwitchRow emoji="🥚" label="Sorpresas" hint="Animaciones y minijuegos escondidos. ¿Cuáles? Eso es cosa tuya." checked={surprises} onChange={toggleSurprises} />
                    {surprises && shakeAsk && (
                        <Row emoji="📳" label="Agitar el móvil" value="Permitir" onClick={() => void requestShakePermission().then((ok) => { if (ok) setShakeAsk(false); })} />
                    )}
                </Section>

                <Section
                    title="Mis filtros"
                    note={<>🔒 Privados: nadie más los ve y solo filtran lo que ves tú (más en la <Link to="/privacy" className="underline">privacidad</Link>). En cada pantalla puedes quitarlos un momento.</>}
                >
                    {FILTERS.map((f) => <FilterRow key={f.id} group={f.id} emoji={f.emoji} label={f.label} onOpen={() => setSheet(f.id)} />)}
                </Section>

                <Section title="Más">
                    <Row emoji="❓" label="Ayuda" to="/ayuda" />
                    <Row emoji="👋" label="Ver otra vez la bienvenida" onClick={reopenWelcome} />
                    <Row emoji="🔐" label="Privacidad" to="/privacy" />
                    {user && <Row emoji="🚪" label="Cerrar sesión" onClick={() => void logout()} />}
                    {user && <Row emoji="🗑️" label="Eliminar cuenta" onClick={() => setSheet('delete')} danger />}
                </Section>
            </div>

            <EditProfileSheet isOpen={sheet === 'profile'} onClose={close} profile={profile} />
            <DeleteAccountSheet isOpen={sheet === 'delete'} onClose={close} />

            <Modal isOpen={sheet === 'notifications'} onClose={close} title="🔔 Avisos">
                <p className="mb-3 text-xs text-[var(--lt-text-muted)]">Elige qué avisos quieres recibir. Se guarda al momento.</p>
                <div className="space-y-2">
                    {NOTIFICATIONS.map((n) => <Toggle key={n.key} label={n.label} checked={notif[n.key] !== false} onChange={(v) => toggleNotif(n.key, v)} />)}
                </div>
            </Modal>

            <Modal isOpen={sheet === 'data'} onClose={close} title="📦 Tus datos">
                {user && <MyDataRequest uid={user.uid} email={user.email} />}
            </Modal>

            <Modal isOpen={sheet === 'distance'} onClose={close} title="📍 Distancia por defecto">
                <p className="mb-3 text-xs text-[var(--lt-text-muted)]">Hasta dónde buscar cuando abres Listopic. Si cerca hay poco, se amplía sola.</p>
                <Choices
                    options={[...RANGE_STEPS_KM.map((km) => ({ id: km, label: `${km} km` })), { id: NO_LIMIT, label: 'Sin límite' }]}
                    value={distance >= NO_LIMIT ? NO_LIMIT : distance}
                    onPick={pickDistance}
                />
            </Modal>

            <Modal isOpen={sheet === 'map'} onClose={close} title="🗺️ Mapa">
                <p className="mb-3 text-xs text-[var(--lt-text-muted)]">Cómo se ve el mapa cada vez que lo abres.</p>
                <Choices
                    options={(Object.keys(MAP_LAYERS) as MapLayerId[]).map((id) => ({ id, label: MAP_LAYERS[id].label, emoji: MAP_LAYERS[id].emoji }))}
                    value={mapLayer}
                    onPick={pickMap}
                />
            </Modal>

            <Modal isOpen={sheet === 'theme'} onClose={close} title="🎨 Tema">
                <div className="grid grid-cols-2 gap-2">
                    {themes.map((t) => {
                        const on = theme === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() => { void setTheme(t.id); }}
                                className={`overflow-hidden rounded-2xl border text-left ${on ? 'border-[var(--lt-accent-border)] ring-2 ring-[var(--lt-accent)]' : 'border-[var(--lt-border)]'}`}
                            >
                                <span className="relative block h-16" style={{ background: t.preview.bg }}>
                                    <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-70 blur-2xl" style={{ background: t.preview.accent }} />
                                    <span className="absolute bottom-2 left-2 h-4 w-12 rounded-full" style={{ background: `linear-gradient(135deg, ${t.preview.accent}, ${t.preview.accent2})` }} />
                                    {on && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[var(--lt-accent)]"><Check className="h-3 w-3" strokeWidth={3} /></span>}
                                </span>
                                <span className="block px-2.5 py-2">
                                    <span className="block text-sm font-bold text-[var(--lt-text)]">{t.label}</span>
                                    <span className="block truncate text-[11px] text-[var(--lt-text-muted)]">{t.mood}</span>
                                </span>
                            </button>
                        );
                    })}
                    {nextLocked && (
                        <div className="overflow-hidden rounded-2xl border border-dashed border-[var(--lt-border)] text-left" aria-label={`${nextLocked.label}: bloqueado`}>
                            <span className="relative block h-16 opacity-40 grayscale" style={{ background: nextLocked.preview.bg }}>
                                <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-70 blur-2xl" style={{ background: nextLocked.preview.accent }} />
                            </span>
                            <span className="relative -mt-11 mb-3 flex justify-center"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"><Lock className="h-4 w-4" /></span></span>
                            <span className="block px-2.5 pb-2">
                                <span className="block text-sm font-bold text-[var(--lt-text)]">{nextLocked.unlock?.icon} {nextLocked.label}</span>
                                <span className="block text-[11px] leading-snug text-[var(--lt-text-muted)]">{user ? nextLocked.unlock?.hint : `Entra y ${nextLocked.unlock?.hint.charAt(0).toLowerCase()}${nextLocked.unlock?.hint.slice(1)}`}</span>
                            </span>
                        </div>
                    )}
                </div>
                <p className="mt-3 text-xs text-[var(--lt-text-muted)]">{nextLocked ? 'Cada tema nuevo se gana con una medalla. ' : ''}Se aplica al momento{user ? ' y te sigue en otros dispositivos' : ''}.</p>
            </Modal>

            <Modal isOpen={sheet === 'nav'} onClose={close} title="📱 Barra de abajo">
                <NavTabsEditor />
            </Modal>

            {FILTERS.map((f) => (
                <Modal key={f.id} isOpen={sheet === f.id} onClose={close} title={`${f.emoji} ${f.label}`}>
                    <FilterGroup group={f.id} />
                </Modal>
            ))}
        </div>
    );
};

export default SettingsPage;

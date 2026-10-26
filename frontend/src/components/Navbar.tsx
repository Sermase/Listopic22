import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bookmark, Bell, Building2, ChevronRight, Dice5, Eye, Info, LifeBuoy, Menu, MessageSquare, PiggyBank, Plus, Search, Settings, SlidersHorizontal, Sparkles, User, X } from 'lucide-react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useAppConfig, useAppConfigLoading } from '../context/AppConfigContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeId } from '../context/ThemeContext';
import { db } from '../firebase';
import { Capacitor } from '@capacitor/core';
import { NotificationHistoryModal } from './NotificationHistoryModal';
import { NotificationModal } from './NotificationModal';
import { useAuthPrompt } from '../context/AuthPromptContext';
import { PageAnalyticsModal } from './PageAnalyticsModal';
import { isTrackableAnalyticsPath } from '../services/AnalyticsService';
import { useManagedBusinesses } from '../hooks/useManagedBusinesses';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { useUnreadChats } from '../hooks/useUnreadChats';
import { barTabs, NAV_TABS, useNavOrder } from '../lib/navTabs';
import { isLabAppEnabled } from '../lib/labApps';
import { PACHOTE_URL } from '../lib/pachote';
import { PachoteService } from '../services/PachoteService';
import { fireSurprise, tapCounter } from '../lib/surprises';

// Siete toques seguidos al logo: «Atrapa la croqueta» (SurpriseHost mira si está activa).
const logoTap = tapCounter(7, 3000, () => fireSurprise({ kind: 'croqueta', gated: true }));

const FIREBASE_STORAGE_HOST = 'firebasestorage.googleapis.com';

const getFirebaseStorageRetryUrl = (src: string): string | null => {
    try {
        const url = new URL(src);
        if (!url.hostname.includes(FIREBASE_STORAGE_HOST) || !url.searchParams.has('token')) {
            return null;
        }
        url.searchParams.delete('token');
        return url.toString();
    } catch {
        return null;
    }
};

const NavItem = ({ to, icon: Icon, label, badge, count, isActive, onClick }: { to: string; icon: React.ElementType; label: string; badge?: boolean; count?: number; isActive: boolean; onClick?: React.MouseEventHandler<HTMLAnchorElement> }) => {
    return (
        <Link
            to={to}
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`flex items-center gap-2 px-3 xl:px-4 py-2 rounded-full transition-all duration-300 group
                ${isActive
                    ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] font-medium'
                    : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] hover:bg-white/5'
                }`}
        >
            <div className="relative">
                <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--lt-accent)]' : 'group-hover:text-[var(--lt-accent)] transition-colors'}`} />
                {badge && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-[var(--lt-accent)] rounded-full animate-pulse" style={{ boxShadow: '0 0 8px var(--lt-accent-shadow)' }} />}
                {count !== undefined && count > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1 min-w-[16px] h-4 rounded-full flex items-center justify-center border border-[var(--lt-bg)]">
                        {count > 9 ? '9+' : count}
                    </span>
                )}
            </div>
            {/* En tablets y portátiles pequeños solo el icono: así cabe la cabecera. */}
            <span className="hidden xl:inline text-sm">{label}</span>
        </Link>
    );
};

/** Casilla del menú móvil: icono grande y etiqueta corta. */
const MenuTile = ({ to, icon: Icon, label, badge, highlight, onClick }: { to?: string; icon: React.ElementType; label: string; badge?: number; highlight?: boolean; onClick?: React.MouseEventHandler<HTMLElement> }) => {
    const className = `relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3.5 text-center text-xs font-bold transition-colors active:scale-[0.97] ${highlight
        ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-text)]'
        : 'border-[var(--lt-border)] bg-[var(--lt-glass)] text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]'}`;
    const content = (
        <>
            <Icon className="h-5 w-5 text-[var(--lt-accent)]" />
            <span className="leading-tight">{label}</span>
            {badge !== undefined && badge > 0 && (
                <span className="absolute right-2 top-2 min-w-[18px] rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white">{badge > 9 ? '9+' : badge}</span>
            )}
        </>
    );
    return to
        ? <Link to={to} onClick={onClick} className={className}>{content}</Link>
        : <button type="button" onClick={onClick} className={className}>{content}</button>;
};

export const Navbar: React.FC = () => {
    const { user, isJefe } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const config = useAppConfig();
    const isConfigLoading = useAppConfigLoading();
    const { theme, setTheme, themes } = useTheme();
    const location = useLocation();

    const themeLogoUrls: Record<ThemeId, string | undefined> = {
        dark: config.logoUrlDark,
        light: config.logoUrlLight,
        warm: config.logoUrlWarm,
        cool: config.logoUrlCool,
        neon: config.logoUrlNeon,
        graphite: config.logoUrlGraphite,
        sunset: config.logoUrlSunset,
        lagoon: config.logoUrlLagoon,
        abuela: config.logoUrlAbuela || config.logoUrlWarm,
    };
    const activeLogoUrl = themeLogoUrls[theme] || config.logoUrl;
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useSheetDismiss(() => setIsMenuOpen(false), isMenuOpen);
    const [scrolled, setScrolled] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notificationPanelMode, setNotificationPanelMode] = useState<'desktop' | 'mobile'>('desktop');
    const bellRef = useRef<HTMLDivElement>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [showPageAnalytics, setShowPageAnalytics] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const unreadChatCount = useUnreadChats(user?.uid);
    const navOrder = useNavOrder();
    const { count: managedBusinessCount, hasPro } = useManagedBusinesses(user?.uid);
    const [profileUsername, setProfileUsername] = useState('');
    const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
    const [profilePhotoRetryUrl, setProfilePhotoRetryUrl] = useState('');
    const [failedProfilePhotoUrl, setFailedProfilePhotoUrl] = useState('');
    const profilePhotoCandidateUrl = profilePhotoRetryUrl || profilePhotoUrl;
    const displayProfilePhotoUrl = profilePhotoCandidateUrl && profilePhotoCandidateUrl !== failedProfilePhotoUrl
        ? profilePhotoCandidateUrl
        : (user?.photoURL && user.photoURL !== failedProfilePhotoUrl ? user.photoURL : '');
    const handleProfileImageError = (event: React.SyntheticEvent<HTMLImageElement>) => {
        const retryUrl = getFirebaseStorageRetryUrl(event.currentTarget.currentSrc || event.currentTarget.src);
        if (retryUrl && retryUrl !== displayProfilePhotoUrl) {
            setProfilePhotoRetryUrl(retryUrl);
            return;
        }
        if (displayProfilePhotoUrl) setFailedProfilePhotoUrl(displayProfilePhotoUrl);
    };

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (!user) return;

        const notificationsQuery = query(
            collection(db, 'users', user.uid, 'notifications'),
            where('read', '==', false),
            limit(50),
        );

        const unsubscribe = onSnapshot(notificationsQuery, (snap) => {
            const validDocs = snap.docs.filter((d) => d.data().type !== 'new_message');
            setUnreadCount(validDocs.length);
        }, (error) => {
            console.error('Navbar notifications snapshot error:', error);
        });

        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (!user) return;

        const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snap) => {
            if (!snap.exists()) {
                setProfileUsername('');
                setProfilePhotoUrl('');
                return;
            }

            const data = snap.data() as Record<string, unknown>;
            const username = typeof data.username === 'string' ? data.username.trim() : '';
            const photoUrl = typeof data.photoUrl === 'string' ? data.photoUrl.trim() : '';

            setProfileUsername(username);
            setProfilePhotoUrl(photoUrl);
            setProfilePhotoRetryUrl('');
            setFailedProfilePhotoUrl('');
        }, (error) => {
            console.warn('Navbar profile snapshot error:', error);
        });

        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setIsMenuOpen(false);
            setShowNotifications(false);
            setShowPageAnalytics(false);
        }, 0);
        return () => window.clearTimeout(timeoutId);
    }, [location.pathname]);

    // Click-outside: close desktop dropdown when clicking outside bell+panel
    useEffect(() => {
        if (!showNotifications || notificationPanelMode !== 'desktop') return;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('[data-notification-panel]')) {
                return;
            }
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
                setShowNotifications(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showNotifications, notificationPanelMode]);

    const profileLabel = profileUsername ? `@${profileUsername}` : (user?.displayName || 'Mi cuenta');
    // «Pachote»: abre Pachote ya con tu cuenta de Listopic (o sin cuenta si no has entrado).
    const pachoteOn = isLabAppEnabled(config, 'pachote', isJefe);
    const inBar = barTabs(navOrder, (id) => id !== 'pachote' || pachoteOn);
    const openPachote = () => {
        setIsMenuOpen(false);
        // La pestaña se abre ya: los navegadores bloquean las que se abren tras esperar.
        void PachoteService.open(PACHOTE_URL, window.open('', '_blank'), !!user);
    };

    const guardProtectedLink = (action: string): React.MouseEventHandler<HTMLAnchorElement> => (event) => {
        if (user) return;
        event.preventDefault();
        setIsMenuOpen(false);
        openAuthPrompt(action);
    };

    return (
        <header className="fixed top-0 w-full z-50 px-3 sm:px-5 transition-all duration-500 pointer-events-none" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
            <div
                className={`pointer-events-auto max-w-7xl mx-auto transition-all duration-500 rounded-3xl md:rounded-[2rem]
                ${scrolled || isMenuOpen
                        ? 'bg-[var(--lt-card-strong)]/70 backdrop-blur-2xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-white/5 px-3 sm:px-5 py-1.5'
                        : 'bg-transparent px-2 sm:px-4 py-2'
                    }`}
            >
                <div className="flex items-center justify-between h-12 md:h-14">
                    <Link to="/" onClick={logoTap} className="flex items-center gap-3 group brand-logo relative z-50">
                        {isConfigLoading ? (
                            <div className="w-32 h-8 rounded-lg bg-[var(--lt-accent-soft)] animate-pulse" />
                        ) : config.logoType === 'image' && activeLogoUrl ? (
                            <img src={activeLogoUrl} alt={config.appName} className="max-h-12 w-auto object-contain transition-transform group-hover:scale-105" />
                        ) : (
                            <div className="flex items-center gap-3">
                                <div className="relative group-hover:scale-105 group-hover:rotate-6 transition-all duration-300">
                                    <div className="absolute inset-0 blur-lg opacity-40 group-hover:opacity-60 transition-opacity rounded-xl" style={{ backgroundColor: 'var(--lt-accent)' }}></div>
                                    <div className="relative w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ backgroundImage: 'var(--lt-brand-mark)' }}>
                                        <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                                    </div>
                                </div>
                                <span className="md:hidden lg:inline text-xl font-display font-bold tracking-tight text-[var(--lt-text)] group-hover:text-[var(--lt-accent)] transition-colors">
                                    {config.appName}
                                </span>
                            </div>
                        )}
                    </Link>

                    <nav className="lt-nav-pill hidden md:flex items-center bg-white/5 backdrop-blur-xl rounded-full px-2 py-1.5 border border-white/5 shadow-inner">
                        <NavItem to="/search" icon={Search} label="Buscar" isActive={location.pathname === '/search'} />
                        <div className="w-px h-4 bg-white/10 mx-1" />
                        <NavItem to="/archive" icon={Bookmark} label="Guardados" isActive={location.pathname === '/archive'} onClick={guardProtectedLink('ver tus guardados')} />
                        {user && managedBusinessCount > 0 && (
                            <NavItem to="/businesses" icon={Building2} label="Negocios" isActive={location.pathname === '/businesses'} />
                        )}
                        <NavItem to="/chats" icon={MessageSquare} label="Chats" count={unreadChatCount} isActive={location.pathname === '/chats'} onClick={guardProtectedLink('abrir tus chats')} />
                        <NavItem to="/planes" icon={Sparkles} label="Planes" isActive={location.pathname === '/planes'} />
                        {pachoteOn && (
                            <button type="button" onClick={openPachote} title="Pachote" aria-label="Pachote" className="flex items-center gap-2 px-3 xl:px-4 py-2 rounded-full text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] hover:bg-white/5 transition-all duration-300 group">
                                <PiggyBank className="w-4 h-4 group-hover:text-[var(--lt-accent)] transition-colors" />
                                <span className="hidden xl:inline text-sm">Pachote</span>
                            </button>
                        )}
                    </nav>

                    <div className="hidden md:flex items-center gap-1 xl:gap-2">
                        <Link to="/create-sublist" onClick={guardProtectedLink('crear una minilista')} title="Crear minilista" aria-label="Crear minilista" className="btn-primary !px-2.5 xl:!px-4 !py-2 whitespace-nowrap">
                            <Plus className="w-4 h-4" />
                            <span className="hidden xl:inline">Minilista</span>
                        </Link>

                        {isJefe && isTrackableAnalyticsPath(location.pathname) && (
                            <button
                                type="button"
                                onClick={() => setShowPageAnalytics(true)}
                                className="rounded-full p-2.5 text-amber-300 transition-all hover:bg-amber-500/10 hover:text-amber-200"
                                title="Ojo mágico: estadísticas de esta página"
                                aria-label="Ver estadísticas de esta página"
                            >
                                <Eye className="h-5 w-5" />
                            </button>
                        )}

                        {user && (
                            <div className="relative" ref={bellRef}>
                                <button
                                    onClick={() => {
                                        setNotificationPanelMode('desktop');
                                        setShowNotifications(current => notificationPanelMode === 'desktop' ? !current : true);
                                    }}
                                    className={`p-2.5 rounded-full transition-all duration-300 relative ${unreadCount > 0
                                        ? 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20'
                                        : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] hover:bg-white/10'
                                        }`}
                                >
                                    <Bell className="w-5 h-5" />
                                    {unreadCount > 0 && (
                                        <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                                    )}
                                </button>

                                {showNotifications && notificationPanelMode === 'desktop' && (
                                    <NotificationModal
                                        anchorEl={bellRef.current}
                                        onClose={() => setShowNotifications(false)}
                                        onOpenHistory={() => {
                                            setShowNotifications(false);
                                            setShowHistory(true);
                                        }}
                                    />
                                )}
                            </div>
                        )}

                        <Link
                            to="/preferencias"
                            title="Preferencias"
                            aria-label="Preferencias"
                            className={`p-2.5 rounded-full transition-all duration-300 ${location.pathname === '/preferencias' ? 'text-[var(--lt-accent)] bg-[var(--lt-accent-soft)]' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] hover:bg-white/10'}`}
                        >
                            <Settings className="w-5 h-5" />
                        </Link>

                        {user ? (
                            <Link to={`/profile/${user.uid}`} className="flex items-center gap-3 ml-2 group">
                                <span className="text-sm font-medium text-[var(--lt-text)] group-hover:text-[var(--lt-accent)] transition-colors text-right hidden 2xl:block">
                                    <span className="block text-xs text-[var(--lt-text-muted)]">Hola,</span>
                                    {profileLabel}
                                </span>
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-full p-[2px] transition-transform group-hover:scale-105 shadow-lg" style={{ backgroundImage: 'var(--lt-accent-grad)', boxShadow: '0 4px 12px var(--lt-accent-shadow)' }}>
                                        <div className="w-full h-full rounded-full bg-[var(--lt-card-strong)] flex items-center justify-center overflow-hidden">
                                            {displayProfilePhotoUrl ? (
                                                <img src={displayProfilePhotoUrl} onError={handleProfileImageError} alt="Profile" className="w-full h-full object-cover block" />
                                            ) : (
                                                <User className="w-5 h-5 text-[var(--lt-accent)]" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ) : (
                            <Link to="/login" className="btn-glass">
                                Iniciar Sesión
                            </Link>
                        )}
                    </div>

                    <div className="md:hidden flex items-center gap-3">
                        {isJefe && isTrackableAnalyticsPath(location.pathname) && (
                            <button
                                type="button"
                                onClick={() => setShowPageAnalytics(true)}
                                className="rounded-full p-2 text-amber-300"
                                aria-label="Ver estadísticas de esta página"
                            >
                                <Eye className="h-5 w-5" />
                            </button>
                        )}
                        {user && (
                            <Link to={`/profile/${user.uid}`} className="relative shrink-0 group">
                                <div className="w-9 h-9 rounded-full p-[2px] transition-transform group-active:scale-95 shadow-md" style={{ backgroundImage: 'var(--lt-accent-grad)', boxShadow: '0 2px 8px var(--lt-accent-shadow)' }}>
                                    <div className="w-full h-full rounded-full bg-[var(--lt-card-strong)] flex items-center justify-center overflow-hidden">
                                        {displayProfilePhotoUrl ? (
                                            <img src={displayProfilePhotoUrl} onError={handleProfileImageError} alt="Perfil" className="w-full h-full object-cover block" />
                                        ) : (
                                            <User className="w-4 h-4 text-[var(--lt-accent)]" />
                                        )}
                                    </div>
                                </div>
                            </Link>
                        )}
                        <button
                            aria-label={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-2 text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] transition-colors z-50 relative"
                        >
                            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                            {!isMenuOpen && (unreadChatCount > 0 || unreadCount > 0) && (
                                <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--lt-bg)] bg-red-500" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {isMenuOpen && (
                <div className="md:hidden fixed inset-0 z-40 pointer-events-auto">
                    {/* Fondo: tocar fuera cierra */}
                    <button type="button" aria-label="Cerrar menú" onClick={() => setIsMenuOpen(false)} className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-fade-in" />
                    {/* Hoja que sube desde abajo. No repite lo que ya está en la barra inferior. */}
                    <div
                        ref={menuRef}
                        role="dialog"
                        aria-label="Menú"
                        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[2rem] border-t border-[var(--lt-border)] bg-[var(--lt-card-strong)] px-4 pt-2 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] animate-slide-up"
                        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
                    >
                        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--lt-border)]" aria-hidden="true" />

                        {user ? (
                            <Link to={`/profile/${user.uid}`} onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 rounded-2xl p-2 text-[var(--lt-text)] transition-colors hover:bg-[var(--lt-glass)]">
                                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[var(--lt-border)] bg-[var(--lt-bg)]">
                                    {displayProfilePhotoUrl ? (
                                        <img src={displayProfilePhotoUrl} onError={handleProfileImageError} alt="Perfil" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center"><User className="h-5 w-5 text-[var(--lt-accent)]" /></div>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-bold">{profileLabel}</div>
                                    <div className="text-xs text-[var(--lt-text-muted)]">Ver tu perfil</div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-[var(--lt-text-muted)]" />
                            </Link>
                        ) : (
                            <Link to="/login" onClick={() => setIsMenuOpen(false)} className="flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold lt-on-accent" style={{ backgroundImage: 'var(--lt-accent-grad)' }}>
                                <User className="h-5 w-5" /> Entrar o crear cuenta
                            </Link>
                        )}

                        <div className="mt-4 grid grid-cols-3 gap-2">
                            {user && managedBusinessCount > 0 && (
                                <MenuTile to="/businesses" icon={hasPro ? Sparkles : Building2} label={managedBusinessCount > 1 ? 'Mis negocios' : 'Mi negocio'} onClick={() => setIsMenuOpen(false)} highlight />
                            )}
                            {/* Lo que cada uno no lleva en la barra de abajo (se elige en Preferencias). */}
                            {navOrder.filter((id) => id !== 'perfil' && (id !== 'pachote' || pachoteOn) && !inBar.includes(id)).map((id) => {
                                const tab = NAV_TABS[id];
                                if (id === 'pachote') return <MenuTile key={id} icon={tab.icon} label={tab.label} onClick={openPachote} />;
                                return (
                                    <MenuTile
                                        key={id}
                                        to={tab.to}
                                        icon={tab.icon}
                                        label={id === 'minilista' ? 'Crear minilista' : tab.label}
                                        badge={id === 'chats' ? unreadChatCount : undefined}
                                        onClick={tab.action ? guardProtectedLink(tab.action) : () => setIsMenuOpen(false)}
                                    />
                                );
                            })}
                            {user && (
                                <MenuTile
                                    icon={Bell}
                                    label="Avisos"
                                    badge={unreadCount}
                                    onClick={() => {
                                        setNotificationPanelMode('mobile');
                                        setIsMenuOpen(false);
                                        setShowNotifications(true);
                                    }}
                                />
                            )}
                            <MenuTile to="/planes" icon={Sparkles} label="Planes" onClick={() => setIsMenuOpen(false)} />
                            <MenuTile to="/preferencias" icon={SlidersHorizontal} label="Preferencias" onClick={() => setIsMenuOpen(false)} />
                            <MenuTile to="/ayuda" icon={LifeBuoy} label="Ayuda" onClick={() => setIsMenuOpen(false)} />
                            {config.showRandomChoiceButton && (
                                <MenuTile to="/?surprise=1" icon={Dice5} label="Sorpréndeme" onClick={() => setIsMenuOpen(false)} />
                            )}
                            {isJefe && isTrackableAnalyticsPath(location.pathname) && (
                                <MenuTile
                                    icon={Eye}
                                    label="Ojo mágico"
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        setShowPageAnalytics(true);
                                    }}
                                />
                            )}
                        </div>

                        <div className="mt-5">
                            <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">Tema</p>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {themes.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => { void setTheme(t.id); }}
                                        aria-pressed={theme === t.id}
                                        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold transition-colors ${theme === t.id ? 'border-[var(--lt-accent)] text-[var(--lt-text)]' : 'border-[var(--lt-border)] text-[var(--lt-text-muted)]'}`}
                                    >
                                        <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: `linear-gradient(135deg, ${t.preview.bg} 45%, ${t.preview.accent} 55%)` }} />
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-[var(--lt-border)] pt-4 text-xs text-[var(--lt-text-muted)]">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    if (Capacitor.isNativePlatform()) {
                                        window.open('https://listopic.es/about', '_blank', 'noopener noreferrer');
                                    } else {
                                        window.location.href = '/about';
                                    }
                                }}
                                className="inline-flex items-center gap-1 hover:text-[var(--lt-text)]"
                            >
                                <Info className="h-3.5 w-3.5" /> Sobre Listopic
                            </button>
                            <Link to="/privacy" onClick={() => setIsMenuOpen(false)} className="hover:text-[var(--lt-text)]">Privacidad</Link>
                            <Link to="/terms" onClick={() => setIsMenuOpen(false)} className="hover:text-[var(--lt-text)]">Términos</Link>
                            <Link to="/aviso-legal" onClick={() => setIsMenuOpen(false)} className="hover:text-[var(--lt-text)]">Aviso legal</Link>
                        </div>
                        <p className="mt-2 text-center text-[11px] text-[var(--lt-text-muted)]">{new Date().getFullYear()} Istari Core</p>
                    </div>
                </div>
            )}

            {showNotifications && notificationPanelMode === 'mobile' && (
                <NotificationModal
                    mobile
                    onClose={() => setShowNotifications(false)}
                    onOpenHistory={() => {
                        setShowNotifications(false);
                        setShowHistory(true);
                    }}
                />
            )}

            {showHistory && <NotificationHistoryModal onClose={() => setShowHistory(false)} />}
            {showPageAnalytics && <PageAnalyticsModal pathname={location.pathname} onClose={() => setShowPageAnalytics(false)} />}


        </header>
    );
};

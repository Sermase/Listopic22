import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Archive, Bell, Compass, Info, Menu, MessageSquare, Plus, Search, Share2, User, X } from 'lucide-react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useAppConfig, useAppConfigLoading } from '../context/AppConfigContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeId } from '../context/ThemeContext';
import { db } from '../firebase';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { Capacitor } from '@capacitor/core';
import { NotificationHistoryModal } from './NotificationHistoryModal';
import { NotificationModal } from './NotificationModal';
import { ShareModal } from './ShareModal';

const NavItem = ({ to, icon: Icon, label, badge, count, isActive }: { to: string; icon: React.ElementType; label: string; badge?: boolean; count?: number; isActive: boolean }) => {
    return (
        <Link
            to={to}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 group
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
            <span className="text-sm">{label}</span>
        </Link>
    );
};

export const Navbar: React.FC = () => {
    const { user } = useAuth();
    const config = useAppConfig();
    const isConfigLoading = useAppConfigLoading();
    const { theme } = useTheme();
    const location = useLocation();

    const themeLogoKey = `logoUrl${theme.charAt(0).toUpperCase()}${theme.slice(1)}` as `logoUrl${Capitalize<ThemeId>}`;
    const activeLogoUrl = (config as any)[themeLogoKey] || config.logoUrl;
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAppShareOpen, setIsAppShareOpen] = useState(false);
    const [showInstallHelp, setShowInstallHelp] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notificationPanelMode, setNotificationPanelMode] = useState<'desktop' | 'mobile'>('desktop');
    const bellRef = useRef<HTMLDivElement>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const [profileUsername, setProfileUsername] = useState('');
    const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
    const {
        installMethod,
        isInstallVisible,
        installButtonLabel,
        installHelpText,
        manualInstallSteps,
        triggerInstall,
    } = usePwaInstall();
    const appShareUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const appShareText = `Descubre ${config.appName} y comparte tus reseñas favoritas`;

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

        const unsubscribe = onSnapshot(notificationsQuery, (snap: any) => {
            setUnreadCount(snap.size);
        }, (error) => {
            console.error('Navbar notifications snapshot error:', error);
        });

        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (!user) {
            setProfileUsername('');
            setProfilePhotoUrl('');
            return;
        }

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
        }, (error) => {
            console.warn('Navbar profile snapshot error:', error);
        });

        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        setIsMenuOpen(false);
        setShowNotifications(false);
    }, [location.pathname]);

    // Click-outside: close desktop dropdown when clicking outside bell+panel
    useEffect(() => {
        if (!showNotifications || notificationPanelMode !== 'desktop') return;
        const handler = (e: MouseEvent) => {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
                setShowNotifications(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showNotifications, notificationPanelMode]);

    useEffect(() => {
        if (!user) return;

        const chatsQuery = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', user.uid),
            limit(50),
        );

        const unsubscribe = onSnapshot(chatsQuery, (snapshot: any) => {
            let total = 0;

            snapshot.docs.forEach((chatDoc: any) => {
                const data = chatDoc.data();
                if (data.unreadCount && typeof data.unreadCount[user.uid] === 'number') {
                    total += data.unreadCount[user.uid];
                }
            });

            setUnreadChatCount(total);
        }, (error) => {
            console.error('Navbar chats snapshot error:', error);
        });

        return () => unsubscribe();
    }, [user]);

    const handleInstallClick = async () => {
        const result = await triggerInstall();
        if (result !== 'native') {
            setShowInstallHelp(true);
        }
    };

    const profileLabel = profileUsername ? `@${profileUsername}` : (user?.displayName || 'Mi cuenta');
    const mobileCreateButtonClass = "w-full flex items-center justify-center gap-3 rounded-2xl px-5 py-4 text-lg font-bold text-white shadow-lg transition-all";

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
                    <Link to="/" className="flex items-center gap-3 group brand-logo relative z-50">
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
                                <span className="text-xl font-display font-bold tracking-tight text-[var(--lt-text)] group-hover:text-[var(--lt-accent)] transition-colors">
                                    {config.appName}
                                </span>
                            </div>
                        )}
                    </Link>

                    <nav className="lt-nav-pill hidden md:flex items-center bg-white/5 backdrop-blur-xl rounded-full px-2 py-1.5 border border-white/5 shadow-inner">
                        <NavItem to="/search" icon={Search} label="Buscar" isActive={location.pathname === '/search'} />
                        <div className="w-px h-4 bg-white/10 mx-1" />
                        <NavItem to="/archive" icon={Archive} label="Archivo" isActive={location.pathname === '/archive'} />
                        <NavItem to="/chats" icon={MessageSquare} label="Chats" count={unreadChatCount} isActive={location.pathname === '/chats'} />
                    </nav>

                    <div className="hidden md:flex items-center gap-4">
                        <Link to="/create-sublist" className="btn-primary">
                            <Plus className="w-4 h-4" />
                            <span>Crear Sublista</span>
                        </Link>

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
                                        onClose={() => setShowNotifications(false)}
                                        onOpenHistory={() => {
                                            setShowNotifications(false);
                                            setShowHistory(true);
                                        }}
                                    />
                                )}
                            </div>
                        )}

                        {user ? (
                            <Link to={`/profile/${user.uid}`} className="flex items-center gap-3 ml-2 group">
                                <span className="text-sm font-medium text-[var(--lt-text)] group-hover:text-[var(--lt-accent)] transition-colors text-right hidden lg:block">
                                    <span className="block text-xs text-[var(--lt-text-muted)]">Hola,</span>
                                    {profileLabel}
                                </span>
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-full p-[2px] transition-transform group-hover:scale-105 shadow-lg" style={{ backgroundImage: 'var(--lt-accent-grad)', boxShadow: '0 4px 12px var(--lt-accent-shadow)' }}>
                                        <div className="w-full h-full rounded-full bg-[var(--lt-card-strong)] flex items-center justify-center overflow-hidden">
                                            {(profilePhotoUrl || user.photoURL) ? (
                                                <img src={profilePhotoUrl || user.photoURL || ''} alt="Profile" className="w-full h-full object-cover block" />
                                            ) : (
                                                <User className="w-5 h-5 text-[var(--lt-accent)]" />
                                            )}
                                        </div>
                                    </div>
                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[var(--lt-bg)] rounded-full"></div>
                                </div>
                            </Link>
                        ) : (
                            <Link to="/login" className="btn-glass">
                                Iniciar Sesión
                            </Link>
                        )}
                    </div>

                    <div className="md:hidden flex items-center gap-3">
                        {user && (
                            <Link to={`/profile/${user.uid}`} className="relative shrink-0 group">
                                <div className="w-9 h-9 rounded-full p-[2px] transition-transform group-active:scale-95 shadow-md" style={{ backgroundImage: 'var(--lt-accent-grad)', boxShadow: '0 2px 8px var(--lt-accent-shadow)' }}>
                                    <div className="w-full h-full rounded-full bg-[var(--lt-card-strong)] flex items-center justify-center overflow-hidden">
                                        {(profilePhotoUrl || user.photoURL) ? (
                                            <img src={profilePhotoUrl || user.photoURL || ''} alt="Perfil" className="w-full h-full object-cover block" />
                                        ) : (
                                            <User className="w-4 h-4 text-[var(--lt-accent)]" />
                                        )}
                                    </div>
                                </div>
                                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[var(--lt-bg)] rounded-full"></div>
                            </Link>
                        )}
                        <button
                            aria-label={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-2 text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] transition-colors z-50 relative"
                        >
                            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {isMenuOpen && (
                <div className="fixed inset-x-0 bottom-0 bg-[var(--lt-bg-deep)]/95 z-40 px-4 sm:px-6 pb-6 animate-fade-in flex flex-col backdrop-blur-3xl pointer-events-auto overflow-y-auto rounded-t-3xl" style={{ top: 'calc(env(safe-area-inset-top) + 68px)' }}>
                    <div className="space-y-4 bg-[var(--lt-card-strong)]/60 p-6 rounded-[2rem] border border-white/10 shadow-2xl ring-1 ring-white/5 mt-4">
                        {user ? (
                            <Link to={`/profile/${user.uid}`} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 text-[var(--lt-text)]">
                                <div className="w-12 h-12 rounded-full overflow-hidden bg-[var(--lt-bg)] border border-white/10 shrink-0">
                                    {(profilePhotoUrl || user.photoURL) ? (
                                        <img src={profilePhotoUrl || user.photoURL || ''} alt="Perfil" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <User className="w-5 h-5 text-[var(--lt-accent)]" />
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--lt-text-muted)]">Perfil</div>
                                    <div className="font-bold truncate">{profileLabel}</div>
                                </div>
                            </Link>
                        ) : (
                            <Link to="/login" className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 text-[var(--lt-text)]">
                                <User className="w-5 h-5 text-[var(--lt-accent)]" />
                                <span className="font-bold">Iniciar sesión</span>
                            </Link>
                        )}

                        <div className="grid grid-cols-1 gap-3">
                            <Link to="/create-sublist" className={mobileCreateButtonClass} style={{ backgroundImage: 'var(--lt-accent-grad)', boxShadow: '0 4px 14px 0 var(--lt-accent-shadow)' }}>
                                <Plus className="w-6 h-6" /> Crear Sublista
                            </Link>
                            <Link to="/create-review" className={mobileCreateButtonClass} style={{ backgroundImage: 'var(--lt-accent-grad)', boxShadow: '0 4px 14px 0 var(--lt-accent-shadow)' }}>
                                <Plus className="w-6 h-6" /> Crear Reseña
                            </Link>
                        </div>

                        <div className="space-y-2">
                            <Link to="/search" className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-[var(--lt-text)]">
                                <Search className="w-5 h-5 text-[var(--lt-accent)]" /> Buscar
                            </Link>
                            <Link to="/" className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-[var(--lt-text)]">
                                <Compass className="w-5 h-5 text-[var(--lt-accent)]" /> Explorar
                            </Link>
                            <Link to="/chats" className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-[var(--lt-text)] justify-between">
                                <div className="flex items-center gap-3">
                                    <MessageSquare className="w-5 h-5 text-[var(--lt-accent)]" /> Chats
                                </div>
                                {unreadChatCount > 0 && (
                                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                        {unreadChatCount}
                                    </span>
                                )}
                            </Link>
                            {user && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNotificationPanelMode('mobile');
                                        setIsMenuOpen(false);
                                        setShowNotifications(true);
                                    }}
                                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-[var(--lt-text)] justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <Bell className="w-5 h-5 text-[var(--lt-accent)]" /> Notificaciones
                                    </div>
                                    {unreadCount > 0 && (
                                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center">
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </span>
                                    )}
                                </button>
                            )}
                            <Link to="/archive" className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-[var(--lt-text)]">
                                <Archive className="w-5 h-5 text-[var(--lt-accent)]" /> Archivo
                            </Link>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    setIsAppShareOpen(true);
                                }}
                                className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-[var(--lt-text)]"
                            >
                                <Share2 className="w-5 h-5 text-[var(--lt-accent)]" /> Compartir App
                            </button>
                            {isInstallVisible && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        void handleInstallClick();
                                    }}
                                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400 font-bold mt-2"
                                >
                                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 16V17H11V16H10.5C10.22 16 10 15.78 10 15.5V13.5C10 13.22 10.22 13 10.5 13H13V12H10V10H11V9H13V10H13.5C13.78 10 14 10.22 14 10.5V12.5C14 12.78 13.78 13 13.5 13H11V14H14V16H13ZM12 4C7.58 4 4 7.58 4 12C4 16.42 7.58 20 12 20C16.42 20 20 16.42 20 12C20 7.58 16.42 4 12 4ZM10 6L8 8H11V13H13V8H16L14 6H10Z" />
                                    </svg>
                                    {installButtonLabel}
                                </button>
                            )}
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
                                className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-[var(--lt-text)]"
                            >
                                <Info className="w-5 h-5 text-[var(--lt-accent)]" /> Sobre Listopic
                            </button>
                        </div>
                    </div>

                    <div className="pt-2 pb-2 text-center flex-shrink-0">
                        <p className="text-[var(--lt-text-muted)] text-xs">{new Date().getFullYear()} Istari Core</p>
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

            <ShareModal
                isOpen={isAppShareOpen}
                onClose={() => setIsAppShareOpen(false)}
                title={`Compartir ${config.appName}`}
                url={appShareUrl}
                text={appShareText}
                shareEntity={{
                    type: 'app',
                    id: 'listopic-app',
                    title: config.appName || 'Listopic',
                    subtitle: 'Descubre lugares, listas y reseñas',
                    route: '/',
                    url: appShareUrl,
                    imageUrl: config.logoType === 'image' ? (config.logoUrl || undefined) : undefined,
                }}
            />

            {showInstallHelp && (
                <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
                    <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[var(--lt-card-strong)] p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-white">Instalar app</h3>
                                <p className="mt-1 text-sm text-[var(--lt-text-muted)]">
                                    {installHelpText}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowInstallHelp(false)}
                                className="p-2 rounded-full text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] hover:bg-white/10 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="mt-4 space-y-2 text-sm text-[var(--lt-text)]">
                            {manualInstallSteps.map((step) => (
                                <p key={step}>{step}</p>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowInstallHelp(false)}
                            className="mt-6 w-full rounded-2xl px-4 py-3 font-bold text-white transition-colors" style={{ backgroundColor: 'var(--lt-accent)' }}
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            )}
        </header>
    );
};

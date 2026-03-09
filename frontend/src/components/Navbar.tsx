import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Archive, MessageSquare, User, Menu, X, Plus, Compass, Bell, Share2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../context/AppConfigContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { NotificationModal } from './NotificationModal';
import { NotificationHistoryModal } from './NotificationHistoryModal';
import { ShareModal } from './ShareModal';

const NavItem = ({ to, icon: Icon, label, badge, count, isActive }: { to: string; icon: React.ElementType; label: string; badge?: boolean; count?: number; isActive: boolean }) => {
    return (
        <Link
            to={to}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 group
                ${isActive
                    ? 'bg-indigo-500/10 text-indigo-400 font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
        >
            <div className="relative">
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'group-hover:text-indigo-400 transition-colors'}`} />
                {/* Generic Badge (boolean) */}
                {badge && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.6)]" />}

                {/* Count Badge (number) */}
                {count !== undefined && count > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1 min-w-[16px] h-4 rounded-full flex items-center justify-center border border-[#0b1021]">
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
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAppShareOpen, setIsAppShareOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const appShareUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const appShareText = `Descubre ${config.appName} y comparte tus reseñas favoritas`;

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showHistory, setShowHistory] = useState(false); // New state lifted
    const [unreadCount, setUnreadCount] = useState(0);
    const [profileUsername, setProfileUsername] = useState('');
    const [profilePhotoUrl, setProfilePhotoUrl] = useState('');

    useEffect(() => {
        if (!user) return;
        const q = query(
            collection(db, 'users', user.uid, 'notifications'),
            where('read', '==', false)
        );
        const unsubscribe = onSnapshot(q, (snap: any) => {
            setUnreadCount(snap.size);
        }, (error) => {
            console.error("Navbar notifications snapshot error:", error);
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

    // Close mobile menu on route change
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMenuOpen(false);
    }, [location]);
    // --- Unread Chats Logic ---
    const [unreadChatCount, setUnreadChatCount] = useState(0);

    useEffect(() => {
        if (!user) return;
        const q = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', user.uid)
        );
        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            let total = 0;
            snapshot.docs.forEach((doc: any) => {
                const data = doc.data();
                if (data.unreadCount && typeof data.unreadCount[user.uid] === 'number') {
                    total += data.unreadCount[user.uid];
                }
            });
            setUnreadChatCount(total);
        }, (error) => {
            console.error("Navbar chats snapshot error:", error);
        });
        return () => unsubscribe();
    }, [user]);

    return (
        <header
            className="fixed top-0 w-full z-50 px-3 pt-3 sm:px-6 sm:pt-5 transition-all duration-500 pointer-events-none"
        >
            <div className={`pointer-events-auto max-w-7xl mx-auto transition-all duration-500 rounded-3xl md:rounded-[2rem]
                ${scrolled || isMenuOpen
                    ? 'bg-[#151b2e]/70 backdrop-blur-2xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-white/5 px-4 sm:px-6 py-2'
                    : 'bg-transparent px-2 sm:px-4 py-3'
                }`}>
                <div className="flex items-center justify-between h-14 md:h-16">

                    {/* Brand */}
                    <Link to="/" className="flex items-center gap-3 group brand-logo relative z-50">
                        {config.logoType === 'image' && config.logoUrl ? (
                            <img src={config.logoUrl} alt={config.appName} className="max-h-12 w-auto object-contain transition-transform group-hover:scale-105" />
                        ) : (
                            // Default CSS Logo
                            <div className="flex items-center gap-3">
                                <div className="relative group-hover:scale-105 group-hover:rotate-6 transition-all duration-300">
                                    <div className="absolute inset-0 bg-blue-600 blur-lg opacity-40 group-hover:opacity-60 transition-opacity rounded-xl"></div>
                                    <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
                                        <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                                    </div>
                                </div>
                                <span className="text-xl font-display font-bold tracking-tight text-white group-hover:text-indigo-200 transition-colors">
                                    {config.appName}
                                </span>
                            </div>
                        )}
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center bg-white/5 backdrop-blur-xl rounded-full px-2 py-1.5 border border-white/5 shadow-inner">
                        <NavItem to="/search" icon={Search} label="Buscar" isActive={location.pathname === '/search'} />
                        <div className="w-px h-4 bg-white/10 mx-1" />
                        <NavItem to="/archive" icon={Archive} label="Archivo" isActive={location.pathname === '/archive'} />
                        <NavItem to="/chats" icon={MessageSquare} label="Chats" count={unreadChatCount} isActive={location.pathname === '/chats'} />
                    </nav>

                    {/* Right Actions */}
                    <div className="hidden md:flex items-center gap-4">
                        <button
                            onClick={() => setIsAppShareOpen(true)}
                            className="p-2.5 rounded-full text-gray-300 hover:text-white hover:bg-white/10 transition-colors border border-white/10 bg-white/5"
                            title="Compartir app"
                        >
                            <Share2 className="w-4 h-4" />
                        </button>

                        <Link
                            to="/create-sublist"
                            className="btn-primary"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Crear Sublista</span>
                        </Link>

                        {/* NOTIFICATIONS BELL */}
                        {user && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowNotifications(!showNotifications)}
                                    className={`p-2.5 rounded-full transition-all duration-300 relative ${unreadCount > 0
                                        ? 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20'
                                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                                        }`}
                                >
                                    <Bell className="w-5 h-5" />
                                    {unreadCount > 0 && (
                                        <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                                    )}
                                </button>

                                {showNotifications && (
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

                        {/* History Modal rendered outside the relative container to avoid clipping/nesting issues */}
                        {showHistory && (
                            <NotificationHistoryModal onClose={() => setShowHistory(false)} />
                        )}

                        {user ? (
                            <Link to={`/profile/${user.uid}`} className="flex items-center gap-3 ml-2 group">
                                <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors text-right hidden lg:block">
                                    <span className="block text-xs text-gray-500 group-hover:text-gray-400">Hola,</span>
                                    {profileUsername ? `@${profileUsername}` : (user.displayName?.split(' ')[0] || 'Usuario')}
                                </span>
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 p-[2px] transition-transform group-hover:scale-105 shadow-lg shadow-indigo-500/20">
                                        <div className="w-full h-full rounded-full bg-[#151b2e] flex items-center justify-center overflow-hidden">
                                            {(profilePhotoUrl || user.photoURL) ? (
                                                <img src={profilePhotoUrl || user.photoURL || ''} alt="Profile" className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-5 h-5 text-indigo-400" />
                                            )}
                                        </div>
                                    </div>
                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0b1021] rounded-full"></div>
                                </div>
                            </Link>
                        ) : (
                            <Link to="/login" className="btn-glass">
                                Iniciar Sesión
                            </Link>
                        )}
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden flex items-center gap-4">
                        {user && (
                            <Link to={`/profile/${user.uid}`} className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden">
                                {(profilePhotoUrl || user.photoURL) ? <img src={profilePhotoUrl || user.photoURL || ''} className="w-full h-full object-cover" /> : <User className="w-4 h-4 m-2" />}
                            </Link>
                        )}
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-2 text-gray-300 hover:text-white transition-colors z-50 relative"
                        >
                            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            {isMenuOpen && (
                <div className="fixed inset-0 top-[80px] bg-[#060913]/95 z-40 px-4 sm:px-6 pb-6 animate-fade-in flex flex-col backdrop-blur-3xl pointer-events-auto overflow-y-auto">
                    <div className="space-y-4 bg-[#151b2e]/60 p-6 rounded-[2rem] border border-white/10 shadow-2xl ring-1 ring-white/5 mt-4">
                        <Link to="/create-sublist" className="btn-primary w-full py-4 text-lg mb-8 shadow-indigo-600/20">
                            <Plus className="w-6 h-6" /> Crear Sublista
                        </Link>

                        <div className="space-y-2">
                            <Link to="/search" className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-gray-200">
                                <Search className="w-5 h-5 text-indigo-400" /> Buscar
                            </Link>
                            <Link to="/explore" className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-gray-200">
                                <Compass className="w-5 h-5 text-indigo-400" /> Explorar
                            </Link>
                            <Link to="/chats" className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-gray-200 justify-between">
                                <div className="flex items-center gap-3">
                                    <MessageSquare className="w-5 h-5 text-indigo-400" /> Chats
                                </div>
                                {unreadChatCount > 0 && (
                                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                        {unreadChatCount}
                                    </span>
                                )}
                            </Link>
                            <Link to="/archive" className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-gray-200">
                                <Archive className="w-5 h-5 text-indigo-400" /> Archivo
                            </Link>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    setIsAppShareOpen(true);
                                }}
                                className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-gray-200"
                            >
                                <Share2 className="w-5 h-5 text-indigo-400" /> Compartir App
                            </button>
                        </div>
                    </div>

                    {/* Mobile Login Button (outside the main box but constrained) */}
                    <div className="w-full mt-4 flex items-center justify-center flex-shrink-0">
                        {!user && (
                            <Link to="/login" className="btn-primary w-full justify-center p-4 rounded-2xl shadow-indigo-500/20">
                                Iniciar Sesión
                            </Link>
                        )}
                    </div>

                    <div className="mt-auto pt-8 pb-4 text-center text-gray-500 text-sm flex-shrink-0">
                        <p>© 2024 Listopic App</p>
                    </div>
                </div>
            )}
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
                    subtitle: 'Descubre lugares, listas y resenas',
                    route: '/',
                    url: appShareUrl,
                    imageUrl: config.logoType === 'image' ? (config.logoUrl || undefined) : undefined,
                }}
            />
        </header >
    );
};

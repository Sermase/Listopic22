import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Archive, MessageSquare, User, Moon, Sun, Menu, X, Plus, Compass, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Navbar: React.FC = () => {
    const { user } = useAuth();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    // Initial theme state (force dark for Navy Theme)
    const [isDark, setIsDark] = useState(true);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Close mobile menu on route change
    useEffect(() => {
        setIsMenuOpen(false);
    }, [location]);

    const toggleTheme = () => {
        const newIsDark = !isDark;
        setIsDark(newIsDark);
        if (newIsDark) {
            document.documentElement.classList.remove('light-mode');
        } else {
            document.documentElement.classList.add('light-mode');
        }
    };



    const NavItem = ({ to, icon: Icon, label, badge }: { to: string; icon: any; label: string; badge?: boolean }) => {
        const isActive = location.pathname === to;
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
                    {badge && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.6)]" />}
                </div>
                <span className="text-sm">{label}</span>
            </Link>
        );
    };

    return (
        <header
            className={`fixed top-0 w-full z-50 transition-all duration-300 border-b 
            ${scrolled || isMenuOpen
                    ? 'bg-[#0b1021]/95 backdrop-blur-md border-white/5 shadow-lg shadow-indigo-500/10'
                    : 'bg-gradient-to-b from-[#0b1021]/80 to-transparent border-transparent'
                }`}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-20">

                    {/* Brand */}
                    <Link to="/" className="flex items-center gap-3 group brand-logo relative z-50">
                        <div className="relative group-hover:scale-105 group-hover:rotate-6 transition-all duration-300">
                            <div className="absolute inset-0 bg-blue-600 blur-lg opacity-40 group-hover:opacity-60 transition-opacity rounded-xl"></div>
                            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
                                <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                            </div>
                        </div>
                        <span className="text-xl font-display font-bold tracking-tight text-white group-hover:text-indigo-200 transition-colors">
                            LISTOPIC
                        </span>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center bg-white/5 backdrop-blur-md rounded-full px-2 py-1.5 border border-white/5 shadow-inner">
                        <NavItem to="/search" icon={Search} label="Buscar" />
                        <div className="w-px h-4 bg-white/10 mx-1" />
                        <NavItem to="/archive" icon={Archive} label="Archivo" />
                        <NavItem to="/chats" icon={MessageSquare} label="Chats" />
                    </nav>

                    {/* Right Actions */}
                    <div className="hidden md:flex items-center gap-4">
                        <Link
                            to="/create"
                            className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-full text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all hover:shadow-indigo-500/40 active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Crear Sublista</span>
                        </Link>

                        {user ? (
                            <Link to={`/profile/${user.uid}`} className="flex items-center gap-3 ml-2 group">
                                <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors text-right hidden lg:block">
                                    <span className="block text-xs text-gray-500 group-hover:text-gray-400">Hola,</span>
                                    {user.displayName?.split(' ')[0] || 'Usuario'}
                                </span>
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 p-[2px] transition-transform group-hover:scale-105 shadow-lg shadow-indigo-500/20">
                                        <div className="w-full h-full rounded-full bg-[#151b2e] flex items-center justify-center overflow-hidden">
                                            {user.photoURL ? (
                                                <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-5 h-5 text-indigo-400" />
                                            )}
                                        </div>
                                    </div>
                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0b1021] rounded-full"></div>
                                </div>
                            </Link>
                        ) : (
                            <Link to="/login" className="px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors border border-white/5">
                                Iniciar Sesión
                            </Link>
                        )}
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden flex items-center gap-4">
                        {user && (
                            <Link to={`/profile/${user.uid}`} className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden">
                                {user.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <User className="w-4 h-4 m-2" />}
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
                <div className="fixed inset-0 bg-[#0b1021]/98 backdrop-blur-xl z-40 pt-24 px-6 animate-fade-in flex flex-col">
                    <div className="space-y-4">
                        <Link to="/create" className="flex items-center justify-center gap-2 w-full py-4 bg-indigo-600 rounded-xl text-white font-bold text-lg mb-8 shadow-lg shadow-indigo-600/20">
                            <Plus className="w-6 h-6" /> Crear Sublista
                        </Link>

                        <div className="space-y-2">
                            <Link to="/search" className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-gray-200">
                                <Search className="w-5 h-5 text-indigo-400" /> Buscar
                            </Link>
                            <Link to="/explore" className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-gray-200">
                                <Compass className="w-5 h-5 text-indigo-400" /> Explorar
                            </Link>
                            <Link to="/users" className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-gray-200">
                                <Users className="w-5 h-5 text-indigo-400" /> Comunidad
                            </Link>
                            <Link to="/archive" className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-gray-200">
                                <Archive className="w-5 h-5 text-indigo-400" /> Archivo
                            </Link>
                        </div>

                        <div className="space-y-2 pt-4 border-t border-white/5">
                            {!user && (
                                <Link to="/login" className="flex items-center gap-3 p-4 rounded-xl bg-indigo-600 text-white font-bold w-full justify-center">
                                    Iniciar Sesión
                                </Link>
                            )}
                        </div>
                    </div>

                    <div className="mt-auto pb-8 text-center text-gray-500 text-sm">
                        <p>© 2024 Listopic App</p>
                    </div>
                </div>
            )}
        </header>
    );
};

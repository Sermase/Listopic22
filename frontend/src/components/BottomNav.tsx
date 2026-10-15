import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Archive, Home, Plus, Search, Sparkles, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAuthPrompt } from '../context/AuthPromptContext';
import { useManagedBusinesses } from '../hooks/useManagedBusinesses';

// Pantallas con formularios o a pantalla completa: ahí la barra estorba.
const HIDDEN_PATTERNS: RegExp[] = [
    /^\/lab/,
    /^\/login/,
    /^\/developer/,
    /^\/create/,
    /^\/chats\/[^/]+/,
    /^\/list\/[^/]+\/edit/,
    /^\/businesses\/[^/]+\/manage/,
];

const shouldShowBottomNav = (pathname: string) => !HIDDEN_PATTERNS.some((re) => re.test(pathname));

interface TabProps {
    to: string;
    label: string;
    icon: React.ElementType;
    active: boolean;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}

const Tab: React.FC<TabProps> = ({ to, label, icon: Icon, active, onClick }) => (
    <Link
        to={to}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-bold transition-colors ${active ? 'text-[var(--lt-accent)]' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
    >
        <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? 'bg-[var(--lt-accent-soft)]' : ''}`}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.5 : 2} />
        </span>
        {label}
    </Link>
);

/** Barra inferior para móvil. Toma los colores del tema activo. */
export const BottomNav: React.FC = () => {
    const { user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const { pathname } = useLocation();
    const { hasPro } = useManagedBusinesses(user?.uid);

    if (!shouldShowBottomNav(pathname)) return null;

    const guard = (action: string): React.MouseEventHandler<HTMLAnchorElement> => (event) => {
        if (user) return;
        event.preventDefault();
        openAuthPrompt(action);
    };
    const profilePath = user ? `/profile/${user.uid}` : '/login';

    return (
        <>
            {/* Hueco para que la barra no tape el final de la página. */}
            <div aria-hidden="true" className="md:hidden" style={{ height: 'calc(4.75rem + env(safe-area-inset-bottom))' }} />
            <nav
                aria-label="Navegación principal"
                className="fixed inset-x-0 bottom-0 z-40 md:hidden"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
            >
                <div className="mx-2 mb-2 flex items-center rounded-[1.6rem] border border-[var(--lt-border)] bg-[var(--lt-card-strong-alpha)] px-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
                    <Tab to="/" label="Inicio" icon={Home} active={pathname === '/'} />
                    <Tab to="/search" label="Buscar" icon={Search} active={pathname.startsWith('/search')} />
                    <Link
                        to="/create-review"
                        onClick={guard('crear una valoración')}
                        aria-label="Nueva valoración"
                        className="mx-1 flex h-12 w-12 shrink-0 -translate-y-3 items-center justify-center rounded-2xl lt-on-accent shadow-lg transition-transform active:scale-95"
                        style={{ backgroundImage: 'var(--lt-accent-grad)', boxShadow: '0 8px 20px var(--lt-accent-shadow)' }}
                    >
                        <Plus className="h-6 w-6" strokeWidth={2.75} />
                    </Link>
                    <Tab to="/archive" label="Colecciones" icon={Archive} active={pathname.startsWith('/archive')} onClick={guard('ver tus colecciones')} />
                    {hasPro ? (
                        <Link
                            to="/businesses"
                            aria-current={pathname.startsWith('/businesses') ? 'page' : undefined}
                            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-black"
                        >
                            <span
                                className="flex h-7 w-12 items-center justify-center rounded-full lt-on-accent shadow-md lt-pro-glow"
                                style={{ backgroundImage: 'linear-gradient(135deg, #f59e0b, #ec4899 55%, #8b5cf6)' }}
                            >
                                <Sparkles className="h-[18px] w-[18px]" strokeWidth={2.5} />
                            </span>
                            <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg, #f59e0b, #ec4899)' }}>Mi negocio</span>
                        </Link>
                    ) : null}
                    <Tab to={profilePath} label={user ? 'Perfil' : 'Entrar'} icon={User} active={pathname.startsWith('/profile') || pathname === '/login'} />
                </div>
            </nav>
        </>
    );
};

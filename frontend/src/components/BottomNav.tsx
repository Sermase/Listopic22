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
    /** Pestaña de Business Pro: icono con el degradado de la marca. */
    pro?: boolean;
}

const PRO_GRADIENT = 'linear-gradient(135deg, #f59e0b, #ec4899 55%, #8b5cf6)';

const Tab: React.FC<TabProps> = ({ to, label, icon: Icon, active, onClick, pro = false }) => (
    <Link
        to={to}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex min-w-0 flex-col items-center justify-center gap-1 pb-1.5 pt-2 text-[10px] font-bold transition-colors ${active ? 'text-[var(--lt-text)]' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
    >
        <span
            className={`flex h-8 w-12 items-center justify-center rounded-2xl transition-all duration-200 group-active:scale-90 ${pro
                ? `lt-on-accent ${active ? 'shadow-[0_6px_16px_rgba(236,72,153,0.45)]' : 'opacity-90'}`
                : active ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]' : ''}`}
            style={pro ? { backgroundImage: PRO_GRADIENT } : undefined}
        >
            <Icon className="h-[19px] w-[19px]" strokeWidth={active || pro ? 2.4 : 2} />
        </span>
        <span className="max-w-full truncate px-0.5 leading-none">{label}</span>
        {/* Punto bajo la pestaña activa */}
        <span
            aria-hidden="true"
            className={`absolute bottom-0 h-1 w-1 rounded-full transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
            style={{ backgroundImage: pro ? PRO_GRADIENT : 'var(--lt-accent-grad)' }}
        />
    </Link>
);

/**
 * Barra inferior para móvil: cinco huecos iguales con el botón de valorar en el
 * centro. Con Business Pro, «Negocio» ocupa el sitio de «Perfil» (el perfil sigue
 * en el avatar de la cabecera). Toma los colores del tema activo.
 */
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
            <div aria-hidden="true" className="md:hidden" style={{ height: 'calc(5rem + env(safe-area-inset-bottom))' }} />
            <nav
                aria-label="Navegación principal"
                className="fixed inset-x-0 bottom-0 z-40 md:hidden"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
            >
                <div className="relative mx-3 mb-2 grid grid-cols-5 items-end rounded-[1.75rem] border border-[var(--lt-border)] px-1 shadow-[0_12px_32px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl backdrop-saturate-150"
                    style={{ background: 'color-mix(in srgb, var(--lt-card-strong) 90%, transparent)' }}
                >
                    <Tab to="/" label="Inicio" icon={Home} active={pathname === '/'} />
                    <Tab to="/search" label="Buscar" icon={Search} active={pathname.startsWith('/search')} />
                    <div className="flex justify-center">
                        <Link
                            to="/create-review"
                            onClick={guard('crear una valoración')}
                            aria-label="Nueva valoración"
                            className="group flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full lt-on-accent transition-transform active:scale-90"
                            // El aro del color del fondo hace de «muesca» sobre la barra.
                            style={{ backgroundImage: 'var(--lt-accent-grad)', boxShadow: '0 0 0 5px var(--lt-bg), 0 10px 24px var(--lt-accent-shadow)' }}
                        >
                            <Plus className="h-7 w-7 transition-transform duration-300 group-active:rotate-90" strokeWidth={2.75} />
                        </Link>
                    </div>
                    <Tab to="/archive" label="Colecciones" icon={Archive} active={pathname.startsWith('/archive')} onClick={guard('ver tus colecciones')} />
                    {hasPro ? (
                        <Tab to="/businesses" label="Negocio" icon={Sparkles} active={pathname.startsWith('/businesses')} pro />
                    ) : (
                        <Tab to={profilePath} label={user ? 'Perfil' : 'Entrar'} icon={User} active={pathname.startsWith('/profile') || pathname === '/login'} />
                    )}
                </div>
            </nav>
        </>
    );
};

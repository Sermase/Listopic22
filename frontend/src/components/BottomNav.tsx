import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAuthPrompt } from '../context/AuthPromptContext';
import { useAppConfig } from '../context/AppConfigContext';
import { useUnreadChats } from '../hooks/useUnreadChats';
import { barTabs, NAV_TABS, useNavOrder, type NavTabId } from '../lib/navTabs';
import { isLabAppEnabled } from '../lib/labApps';
import { PACHOTE_URL } from '../lib/pachote';
import { PachoteService } from '../services/PachoteService';

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
    to?: string;
    label: string;
    icon: React.ElementType;
    active: boolean;
    badge?: number;
    onClick?: React.MouseEventHandler<HTMLElement>;
}

const Tab: React.FC<TabProps> = ({ to, label, icon: Icon, active, badge, onClick }) => {
    const className = `group relative flex min-w-0 flex-col items-center justify-center gap-1 pb-1.5 pt-2 text-[10px] font-bold transition-colors ${active ? 'text-[var(--lt-text)]' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`;
    const content = (
        <>
            <span
                className={`relative flex h-8 w-12 items-center justify-center rounded-2xl transition-all duration-200 group-active:scale-90 ${active ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]' : ''}`}
            >
                <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.4 : 2} />
                {!!badge && (
                    <span className="absolute -top-0.5 right-1.5 min-w-[16px] rounded-full border-2 border-[var(--lt-card-strong)] bg-red-500 px-1 text-[9px] font-bold leading-[13px] text-white">
                        {badge > 9 ? '9+' : badge}
                    </span>
                )}
            </span>
            <span className="max-w-full truncate px-0.5 leading-none">{label}</span>
            {/* Punto bajo la pestaña activa */}
            <span
                aria-hidden="true"
                className={`absolute bottom-0 h-1 w-1 rounded-full transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
                style={{ backgroundImage: 'var(--lt-accent-grad)' }}
            />
        </>
    );
    return to
        ? <Link to={to} onClick={onClick} aria-current={active ? 'page' : undefined} className={className}>{content}</Link>
        : <button type="button" onClick={onClick} className={className}>{content}</button>;
};

/**
 * Barra inferior para móvil: cinco huecos iguales con el botón de valorar en el
 * centro. Los otros cuatro los elige y ordena cada uno en Preferencias (lib/navTabs).
 * Toma los colores del tema activo.
 */
export const BottomNav: React.FC = () => {
    const { user, isJefe } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const config = useAppConfig();
    const { pathname } = useLocation();
    const order = useNavOrder();
    const unreadChats = useUnreadChats(user?.uid);

    if (!shouldShowBottomNav(pathname)) return null;

    const pachoteOn = isLabAppEnabled(config, 'pachote', isJefe);
    const tabs = barTabs(order, (id) => id !== 'pachote' || pachoteOn);
    const guard = (action: string): React.MouseEventHandler<HTMLElement> => (event) => {
        if (user) return;
        event.preventDefault();
        openAuthPrompt(action);
    };

    const renderTab = (id: NavTabId) => {
        const meta = NAV_TABS[id];
        if (id === 'perfil') {
            return <Tab key={id} to={user ? `/profile/${user.uid}` : '/login'} label={user ? 'Perfil' : 'Entrar'} icon={meta.icon} active={pathname.startsWith('/profile') || pathname === '/login'} />;
        }
        if (id === 'pachote') {
            // La pestaña se abre ya: los navegadores bloquean las que se abren tras esperar.
            return <Tab key={id} label={meta.label} icon={meta.icon} active={false} onClick={() => { void PachoteService.open(PACHOTE_URL, window.open('', '_blank'), !!user); }} />;
        }
        const active = meta.to === '/' ? pathname === '/' : pathname.startsWith(meta.to || '');
        return (
            <Tab
                key={id}
                to={meta.to}
                label={meta.label}
                icon={meta.icon}
                active={active}
                badge={id === 'chats' ? unreadChats : undefined}
                onClick={meta.action ? guard(meta.action) : undefined}
            />
        );
    };

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
                    {tabs.slice(0, 2).map(renderTab)}
                    <div className="flex justify-center">
                        <Link
                            to="/create-review"
                            onClick={guard('escribir una reseña')}
                            aria-label="Nueva reseña"
                            className="group flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full lt-on-accent transition-transform active:scale-90"
                            // El aro del color del fondo hace de «muesca» sobre la barra.
                            style={{ backgroundImage: 'var(--lt-accent-grad)', boxShadow: '0 0 0 5px var(--lt-bg), 0 10px 24px var(--lt-accent-shadow)' }}
                        >
                            <Plus className="h-7 w-7 transition-transform duration-300 group-active:rotate-90" strokeWidth={2.75} />
                        </Link>
                    </div>
                    {tabs.slice(2).map(renderTab)}
                </div>
            </nav>
        </>
    );
};

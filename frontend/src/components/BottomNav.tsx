import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAuthPrompt } from '../context/AuthPromptContext';
import { useAppConfig } from '../context/AppConfigContext';
import { useUnreadChats } from '../hooks/useUnreadChats';
import { barTabs, NAV_TABS, useNavOrder, type NavTabId } from '../lib/navTabs';
import { endMenuDrag, moveMenuDrag, startMenuDrag } from '../lib/menuDrag';
import { isLabAppEnabled } from '../lib/labApps';
import { PACHOTE_URL } from '../lib/pachote';
import { PachoteService } from '../services/PachoteService';
import { haptic } from '../utils/haptics';

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

const HOLD_MS = 220;

/** Mantener pulsada la barra un momento y deslizar hacia arriba sube el menú pegado al dedo. Devuelve si está «cogida». */
function useHoldSwipeUpMenu(bar: React.RefObject<HTMLElement | null>, enabled: boolean) {
    const [held, setHeld] = useState(false);
    useEffect(() => {
        const el = bar.current;
        if (!enabled || !el) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let x0 = 0;
        let y0 = 0;
        let holding = false;
        let pulling = false;
        let swallowClick = false;
        // Velocidad al soltar: últimos puntos del dedo.
        let lastY = 0;
        let lastT = 0;
        let speed = 0;
        const stop = () => {
            clearTimeout(timer);
            if (holding) setHeld(false);
            holding = false;
            pulling = false;
        };
        const start = (e: TouchEvent) => {
            stop();
            // El navegador no siempre manda el clic tras un gesto: que no se coma el próximo toque.
            swallowClick = false;
            if (e.touches.length !== 1) return;
            x0 = e.touches[0].clientX;
            y0 = e.touches[0].clientY;
            timer = setTimeout(() => {
                holding = true;
                setHeld(true);
                haptic('medium');
            }, HOLD_MS);
        };
        const move = (e: TouchEvent) => {
            const t = e.touches[0];
            if (!holding) {
                // Se movió antes de tiempo: es un toque o un desplazamiento normal.
                if (Math.hypot(t.clientX - x0, t.clientY - y0) > 10) clearTimeout(timer);
                return;
            }
            if (e.cancelable) e.preventDefault();
            const now = performance.now();
            if (!pulling && y0 - t.clientY > 6) {
                pulling = true;
                swallowClick = true;
                y0 = t.clientY;
                lastY = t.clientY;
                lastT = now;
                speed = 0;
                startMenuDrag(t.clientY);
                return;
            }
            if (!pulling) return;
            speed = (t.clientY - lastY) / Math.max(1, now - lastT);
            lastY = t.clientY;
            lastT = now;
            moveMenuDrag(t.clientY);
        };
        const end = () => {
            // Soltar tras mantener sin deslizar no abre la pestaña.
            if (holding) swallowClick = true;
            if (pulling) endMenuDrag(performance.now() - lastT < 80 ? speed : 0);
            stop();
        };
        const click = (e: MouseEvent) => {
            if (!swallowClick) return;
            swallowClick = false;
            e.preventDefault();
            e.stopPropagation();
        };
        const noMenu = (e: Event) => e.preventDefault();
        el.addEventListener('touchstart', start, { passive: true });
        el.addEventListener('touchmove', move, { passive: false });
        el.addEventListener('touchend', end);
        el.addEventListener('touchcancel', end);
        el.addEventListener('click', click, true);
        el.addEventListener('contextmenu', noMenu);
        return () => {
            stop();
            el.removeEventListener('touchstart', start);
            el.removeEventListener('touchmove', move);
            el.removeEventListener('touchend', end);
            el.removeEventListener('touchcancel', end);
            el.removeEventListener('click', click, true);
            el.removeEventListener('contextmenu', noMenu);
        };
    }, [bar, enabled]);
    return held;
}

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
    // Un «tic» al cambiar de pestaña.
    const press: React.MouseEventHandler<HTMLElement> = (event) => {
        if (!active) haptic('selection');
        onClick?.(event);
    };
    return to
        ? <Link to={to} onClick={press} aria-current={active ? 'page' : undefined} className={className}>{content}</Link>
        : <button type="button" onClick={press} className={className}>{content}</button>;
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
    const barRef = useRef<HTMLDivElement | null>(null);
    const visible = shouldShowBottomNav(pathname);
    const held = useHoldSwipeUpMenu(barRef, visible);

    if (!visible) return null;

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
                <div
                    ref={barRef}
                    className={`lt-bottom-bar relative mx-3 mb-2 grid grid-cols-5 items-end rounded-[1.75rem] border px-1 shadow-[0_12px_32px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl backdrop-saturate-150 select-none [-webkit-touch-callout:none] transition-transform duration-150 ${held ? '-translate-y-1 border-[var(--lt-accent-border)]' : 'border-[var(--lt-border)]'}`}
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

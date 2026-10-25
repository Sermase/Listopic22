import { useSyncExternalStore } from 'react';
import { Bookmark, Home, MessageSquare, PiggyBank, Plus, Search, User, type LucideIcon } from 'lucide-react';

// Barra de abajo del móvil: cuatro huecos (y el «+» del centro) que cada uno
// elige y ordena en Preferencias. Lo que no va en la barra sale en el menú.
// Es cosa de cada móvil: se guarda en este dispositivo.

export type NavTabId = 'inicio' | 'buscar' | 'chats' | 'guardados' | 'perfil' | 'minilista' | 'pachote';

export interface NavTabMeta {
    id: NavTabId;
    label: string;
    icon: LucideIcon;
    /** Ruta (Pachote no tiene: abre otra app). */
    to?: string;
    /** Pide sesión: sin ella, se ofrece entrar. */
    action?: string;
}

export const NAV_TABS: Record<NavTabId, NavTabMeta> = {
    inicio: { id: 'inicio', label: 'Inicio', icon: Home, to: '/' },
    buscar: { id: 'buscar', label: 'Buscar', icon: Search, to: '/search' },
    chats: { id: 'chats', label: 'Chats', icon: MessageSquare, to: '/chats', action: 'abrir tus chats' },
    guardados: { id: 'guardados', label: 'Guardados', icon: Bookmark, to: '/archive', action: 'ver tus guardados' },
    perfil: { id: 'perfil', label: 'Perfil', icon: User },
    minilista: { id: 'minilista', label: 'Minilista', icon: Plus, to: '/create-sublist', action: 'crear una minilista' },
    pachote: { id: 'pachote', label: 'Pachote', icon: PiggyBank },
};

export const BAR_SLOTS = 4;
export const DEFAULT_NAV_ORDER: NavTabId[] = ['inicio', 'buscar', 'chats', 'perfil', 'guardados', 'minilista', 'pachote'];
const IDS = Object.keys(NAV_TABS) as NavTabId[];
const KEY = 'listopic_nav_tabs';
const EVENT = 'listopic-nav-tabs';

/** Orden completo y sin repetidos: lo guardado primero y luego lo que falte, en el orden por defecto. */
export function sanitizeNavOrder(value: unknown): NavTabId[] {
    const saved = Array.isArray(value) ? value.filter((v): v is NavTabId => IDS.includes(v as NavTabId)) : [];
    const unique = Array.from(new Set(saved));
    return [...unique, ...DEFAULT_NAV_ORDER.filter((id) => !unique.includes(id))];
}

/** Las que van en la barra: las primeras disponibles (Pachote solo si está activado). */
export function barTabs(order: NavTabId[], available: (id: NavTabId) => boolean = () => true): NavTabId[] {
    return order.filter(available).slice(0, BAR_SLOTS);
}

const readRaw = () => {
    try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
};
const subscribe = (onChange: () => void) => {
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener('storage', onChange);
    };
};
const parse = (raw: string) => {
    try { return sanitizeNavOrder(raw ? JSON.parse(raw) : null); } catch { return sanitizeNavOrder(null); }
};
let cache: { raw: string; order: NavTabId[] } | null = null;
const snapshot = () => {
    const raw = readRaw();
    if (!cache || cache.raw !== raw) cache = { raw, order: parse(raw) };
    return cache.order;
};

/** El orden elegido en este dispositivo (se actualiza al momento al cambiarlo en Preferencias). */
export function useNavOrder(): NavTabId[] {
    return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Guarda el orden; con null vuelve al de por defecto. */
export function saveNavOrder(order: NavTabId[] | null) {
    try {
        if (order) localStorage.setItem(KEY, JSON.stringify(sanitizeNavOrder(order)));
        else localStorage.removeItem(KEY);
    } catch { /* sin almacenamiento: se queda el de por defecto */ }
    window.dispatchEvent(new Event(EVENT));
}

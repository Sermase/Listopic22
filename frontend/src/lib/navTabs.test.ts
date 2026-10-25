import { describe, expect, it } from 'vitest';
import { barTabs, DEFAULT_NAV_ORDER, sanitizeNavOrder } from './navTabs';

describe('navTabs', () => {
    it('completa el orden guardado con lo que falte y quita lo raro y lo repetido', () => {
        expect(sanitizeNavOrder(['guardados', 'nada', 'guardados', 'inicio'])).toEqual(['guardados', 'inicio', 'buscar', 'chats', 'perfil', 'minilista', 'pachote']);
        expect(sanitizeNavOrder(null)).toEqual(DEFAULT_NAV_ORDER);
        expect(sanitizeNavOrder('basura')).toEqual(DEFAULT_NAV_ORDER);
    });

    it('la barra lleva las cuatro primeras disponibles', () => {
        expect(barTabs(DEFAULT_NAV_ORDER)).toEqual(['inicio', 'buscar', 'chats', 'perfil']);
        const order = sanitizeNavOrder(['pachote', 'inicio', 'buscar', 'chats']);
        expect(barTabs(order, (id) => id !== 'pachote')).toEqual(['inicio', 'buscar', 'chats', 'perfil']);
    });
});

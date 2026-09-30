import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStoredChoice } from './useStoredChoice';

describe('useStoredChoice', () => {
    beforeEach(() => localStorage.clear());

    it('usa el valor por defecto y recuerda el elegido', () => {
        const { result, unmount } = renderHook(() => useStoredChoice('k', ['list', 'gallery'] as const, 'gallery'));
        expect(result.current[0]).toBe('gallery');
        act(() => result.current[1]('list'));
        unmount();
        const again = renderHook(() => useStoredChoice('k', ['list', 'gallery'] as const, 'gallery'));
        expect(again.result.current[0]).toBe('list');
    });

    it('ignora valores guardados que ya no existen', () => {
        localStorage.setItem('k', 'mapa-viejo');
        const { result } = renderHook(() => useStoredChoice('k', ['list', 'gallery'] as const, 'gallery'));
        expect(result.current[0]).toBe('gallery');
    });
});

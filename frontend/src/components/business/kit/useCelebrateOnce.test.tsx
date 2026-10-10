import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const confettiMock = vi.hoisted(() => vi.fn());
vi.mock('canvas-confetti', () => ({ default: confettiMock }));

import { useCelebrateOnce } from './useCelebrateOnce';

const STORAGE_PREFIX = 'listopic_celebrated:';
const originalMatchMedia = window.matchMedia;

const setReducedMotion = (reduce: boolean) => {
    window.matchMedia = ((query: string) => ({ matches: reduce && query.includes('reduce'), media: query })) as unknown as typeof window.matchMedia;
};

let keySeq = 0;
const uniqueKey = () => `test:${Date.now()}:${keySeq += 1}`;

beforeEach(() => {
    confettiMock.mockClear();
    localStorage.clear();
});

afterEach(() => {
    window.matchMedia = originalMatchMedia;
});

describe('useCelebrateOnce', () => {
    it('fires confetti and the callback once when the condition becomes true', async () => {
        setReducedMotion(false);
        const key = uniqueKey();
        const onCelebrate = vi.fn();
        const { rerender } = renderHook(({ done }) => useCelebrateOnce(key, done, onCelebrate), { initialProps: { done: false } });
        expect(onCelebrate).not.toHaveBeenCalled();

        rerender({ done: true });
        expect(onCelebrate).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(confettiMock).toHaveBeenCalledTimes(1));
        expect(localStorage.getItem(STORAGE_PREFIX + key)).not.toBeNull();

        rerender({ done: false });
        rerender({ done: true });
        expect(onCelebrate).toHaveBeenCalledTimes(1);
    });

    it('does not fire again for a key already stored in this browser', async () => {
        setReducedMotion(false);
        const key = uniqueKey();
        localStorage.setItem(STORAGE_PREFIX + key, '2026-01-01');
        const onCelebrate = vi.fn();
        renderHook(() => useCelebrateOnce(key, true, onCelebrate));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(onCelebrate).not.toHaveBeenCalled();
        expect(confettiMock).not.toHaveBeenCalled();
    });

    it('skips the confetti under reduced motion but still marks the milestone and calls back', async () => {
        setReducedMotion(true);
        const key = uniqueKey();
        const onCelebrate = vi.fn();
        renderHook(() => useCelebrateOnce(key, true, onCelebrate));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(confettiMock).not.toHaveBeenCalled();
        expect(onCelebrate).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem(STORAGE_PREFIX + key)).not.toBeNull();
    });

    it('works without storage (remembers within the session)', async () => {
        setReducedMotion(false);
        const key = uniqueKey();
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        try {
            const onCelebrate = vi.fn();
            const first = renderHook(() => useCelebrateOnce(key, true, onCelebrate));
            first.unmount();
            renderHook(() => useCelebrateOnce(key, true, onCelebrate));
            expect(onCelebrate).toHaveBeenCalledTimes(1);
        } finally {
            getItem.mockRestore();
            setItem.mockRestore();
        }
    });
});

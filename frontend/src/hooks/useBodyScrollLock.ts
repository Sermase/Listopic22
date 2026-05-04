import { useEffect } from 'react';

let lockCount = 0;
let previousBodyOverflow = '';
let previousHtmlOverflow = '';
let previousBodyTouchAction = '';

export function useBodyScrollLock(locked: boolean): void {
    useEffect(() => {
        if (!locked || typeof document === 'undefined') return;

        const body = document.body;
        const html = document.documentElement;

        if (lockCount === 0) {
            previousBodyOverflow = body.style.overflow;
            previousHtmlOverflow = html.style.overflow;
            previousBodyTouchAction = body.style.touchAction;

            body.style.overflow = 'hidden';
            html.style.overflow = 'hidden';
            body.style.touchAction = 'none';
        }

        lockCount += 1;

        return () => {
            lockCount = Math.max(0, lockCount - 1);
            if (lockCount === 0) {
                body.style.overflow = previousBodyOverflow;
                html.style.overflow = previousHtmlOverflow;
                body.style.touchAction = previousBodyTouchAction;
            }
        };
    }, [locked]);
}

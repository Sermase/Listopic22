import { afterEach, describe, expect, it, vi } from 'vitest';
import { haptic, isHapticsOn, setHapticsOn } from './haptics';

describe('haptic', () => {
    afterEach(() => {
        setHapticsOn(true);
        vi.unstubAllGlobals();
    });

    it('vibra con navigator.vibrate en el navegador', () => {
        const vibrate = vi.fn(() => true);
        vi.stubGlobal('navigator', { ...navigator, vibrate });
        haptic('success');
        expect(vibrate).toHaveBeenCalledWith([15, 40, 25]);
    });

    it('apagada en Preferencias no vibra y se recuerda', () => {
        const vibrate = vi.fn(() => true);
        vi.stubGlobal('navigator', { ...navigator, vibrate });
        setHapticsOn(false);
        haptic('heavy');
        expect(vibrate).not.toHaveBeenCalled();
        expect(isHapticsOn()).toBe(false);
        expect(localStorage.getItem('listopic_haptics_off')).toBe('1');
    });
});

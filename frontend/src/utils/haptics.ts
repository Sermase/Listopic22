import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

// Vibración en todas partes: la app (Capacitor), Android en el navegador
// (navigator.vibrate) e iPhone en Safari, que no tiene vibrate pero da un
// toquecito al pulsar un interruptor <input switch> (iOS 18+).

export type HapticKind = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'error';
type Kind = HapticKind;

const PATTERNS: Record<Kind, number | number[]> = {
    selection: 6,
    light: 10,
    medium: 20,
    heavy: 35,
    success: [15, 40, 25],
    error: [30, 60, 30],
};

// Se puede apagar en Preferencias (por dispositivo).
const OFF_KEY = 'listopic_haptics_off';
let off: boolean | null = null;
export function isHapticsOn(): boolean {
    if (off === null) {
        try { off = localStorage.getItem(OFF_KEY) === '1'; } catch { off = false; }
    }
    return !off;
}
export function setHapticsOn(on: boolean): void {
    off = !on;
    try {
        if (on) localStorage.removeItem(OFF_KEY);
        else localStorage.setItem(OFF_KEY, '1');
    } catch { /* sin almacenamiento: vale para esta visita */ }
}

const isIOS = () => typeof navigator !== 'undefined'
    && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

let iosSwitch: HTMLLabelElement | null = null;
function iosTick() {
    if (typeof document === 'undefined') return;
    if (!iosSwitch) {
        iosSwitch = document.createElement('label');
        iosSwitch.setAttribute('aria-hidden', 'true');
        iosSwitch.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        input.tabIndex = -1;
        iosSwitch.appendChild(input);
        // Que este clic de mentira no lo vea nadie más (p. ej. un «tocar fuera cierra»).
        iosSwitch.addEventListener('click', (event) => event.stopPropagation());
        document.body.appendChild(iosSwitch);
    }
    iosSwitch.click();
}

/** Vibra un poco. En iPhone (web) solo funciona dentro de un toque del usuario. */
export function haptic(kind: Kind = 'light'): void {
    if (!isHapticsOn()) return;
    if (Capacitor.isNativePlatform()) {
        const run = kind === 'selection'
            ? Haptics.selectionStart().then(() => Haptics.selectionChanged())
            : kind === 'success' || kind === 'error'
                ? Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Error })
                : Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy });
        run.catch(() => { /* sin vibración */ });
        return;
    }
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(PATTERNS[kind]);
        else if (isIOS()) iosTick();
    } catch {
        // Sin vibración
    }
}

export const triggerHaptic = async (style: 'light' | 'medium' | 'heavy' = 'light') => haptic(style);

export const triggerHapticSelection = async () => haptic('selection');

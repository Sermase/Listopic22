import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export const triggerHaptic = async (style: 'light' | 'medium' | 'heavy' = 'light') => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        const impactStyle = style === 'light' ? ImpactStyle.Light
            : style === 'medium' ? ImpactStyle.Medium
                : ImpactStyle.Heavy;
        await Haptics.impact({ style: impactStyle });
    } catch {
        // Ignored
    }
};

export const triggerHapticSelection = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await Haptics.selectionStart();
        await Haptics.selectionChanged();
    } catch {
        // Ignored
    }
};

import { describe, expect, it } from 'vitest';
import { isLabAppVisible } from './labApps';

describe('isLabAppVisible', () => {
    it('con el laboratorio oculto no se ve ninguna, salvo para jefes', () => {
        expect(isLabAppVisible({ showLab: false }, 'apegos')).toBe(false);
        expect(isLabAppVisible({ showLab: false }, 'apegos', true)).toBe(true);
    });

    it('con el laboratorio público se ven todas menos las ocultadas', () => {
        const config = { showLab: true, labApps: { pachote: false } };
        expect(isLabAppVisible(config, 'apegos')).toBe(true);
        expect(isLabAppVisible(config, 'pachote')).toBe(false);
    });
});

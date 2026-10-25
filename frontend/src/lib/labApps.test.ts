import { describe, expect, it } from 'vitest';
import { isLabAppEnabled, isLabAppVisible } from './labApps';

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

describe('isLabAppEnabled', () => {
    it('lo integrado en Listopic no depende del laboratorio; solo lo apaga su interruptor', () => {
        expect(isLabAppEnabled({}, 'pachote')).toBe(true);
        expect(isLabAppEnabled({ labApps: { pachote: false } }, 'pachote')).toBe(false);
        expect(isLabAppEnabled({ labApps: { pachote: false } }, 'pachote', true)).toBe(true);
    });
});

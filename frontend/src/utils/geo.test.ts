import { describe, expect, it } from 'vitest';
import { haversineMeters } from './geo';

describe('haversineMeters', () => {
    it('es 0 para el mismo punto', () => {
        expect(haversineMeters(41.65, -4.72, 41.65, -4.72)).toBe(0);
    });

    it('Madrid (Sol) – Valladolid (Plaza Mayor) ≈ 162 km', () => {
        const d = haversineMeters(40.4169, -3.7035, 41.6523, -4.7245);
        expect(d / 1000).toBeGreaterThan(160);
        expect(d / 1000).toBeLessThan(164);
    });

    it('es simétrica', () => {
        const a = haversineMeters(36.013, -5.606, 43.46, -3.81);
        const b = haversineMeters(43.46, -3.81, 36.013, -5.606);
        expect(Math.abs(a - b)).toBeLessThan(1e-6);
    });

    it('distancias cortas con precisión de metros (1 grado de latitud ≈ 111,2 km)', () => {
        const d = haversineMeters(40, -3, 41, -3);
        expect(Math.round(d / 100) / 10).toBeCloseTo(111.2, 1);
    });
});

import { describe, expect, it } from 'vitest';
import { featureScopeOptions, isFeaturedContestFor } from './contest';

describe('concursos destacados', () => {
    const ts = (ms: number) => ({ toMillis: () => ms });
    const base = {
        parentListId: 'madre',
        contest: { closed: true, startsAt: ts(1000), endsAt: ts(5000) },
        featureRequest: { level: 'province' as const, value: 'Valladolid', status: 'approved' as const },
    };
    const vll = { city: 'Valladolid', province: 'Valladolid', region: 'Castilla y León', country: 'España' };

    it('sale en la zona, no fuera, ni pendiente ni terminado', () => {
        expect(isFeaturedContestFor(base, { geo: vll }, 2000)).toBe(true);
        expect(isFeaturedContestFor(base, { geo: { province: 'Madrid' } }, 2000)).toBe(false);
        expect(isFeaturedContestFor({ ...base, featureRequest: { ...base.featureRequest, status: 'pending' } }, { geo: vll }, 2000)).toBe(false);
        expect(isFeaturedContestFor(base, { geo: vll }, 6000)).toBe(false);
        expect(isFeaturedContestFor(base, { geo: null, area: { kind: 'province', value: 'Valladolid' } }, 2000)).toBe(true);
        // Solo con ciudad: vale si es la de un aspirante de la zona.
        const withCandidates = { ...base, candidates: [{ key: 'p|x', placeId: 'p', placeName: 'P', itemName: 'X', ...vll }] };
        expect(isFeaturedContestFor(withCandidates, { geo: { city: 'Valladolid' } }, 2000)).toBe(true);
        expect(isFeaturedContestFor(withCandidates, { geo: { city: 'Segovia' } }, 2000)).toBe(false);
    });

    it('propone primero la provincia de los aspirantes', () => {
        const options = featureScopeOptions([vll, vll, { ...vll, city: 'Laguna de Duero' }]);
        expect(options[0]).toEqual({ level: 'province', value: 'Valladolid', label: 'Valladolid provincia' });
        expect(options.map((o) => o.level)).toContain('region');
    });
});

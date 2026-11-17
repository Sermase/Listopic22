import { describe, expect, it } from 'vitest';
import { focusPoints } from './mapFocus';

const madrid = { lat: 40.4168, lng: -3.7038 };
const vll = [
    { lat: 41.6523, lng: -4.7245 },
    { lat: 41.6551, lng: -4.7286 },
    { lat: 41.6489, lng: -4.7199 },
];
const sevilla = { lat: 37.3891, lng: -5.9845 };

describe('focusPoints', () => {
    it('lejos de todo: encuadra donde están la mayoría', () => {
        expect(focusPoints([...vll, sevilla], madrid)).toEqual(vll);
    });

    it('sin ubicación: también el grupo más grande', () => {
        expect(focusPoints([sevilla, ...vll], null)).toEqual(vll);
    });

    it('con alguno cerca: alrededor de ti incluyendo los cercanos', () => {
        const cerca = { lat: 40.43, lng: -3.70 };
        const out = focusPoints([...vll, cerca, sevilla], madrid);
        expect(out[0]).toEqual(madrid);
        expect(out).toContainEqual(cerca);
        expect(out).not.toContainEqual(sevilla);
    });
});

import { describe, expect, it } from 'vitest';
import { orderedCriteriaEntries } from './criteria';

describe('orderedCriteriaEntries', () => {
    it('respeta `order` y deja detrás, por nombre, los que no lo tienen', () => {
        const ids = orderedCriteriaEntries({
            z: { label: 'Sabor' },
            b: { label: 'Precio', order: 1 },
            a: { label: 'Textura', order: 0 },
            c: { label: 'Aroma' },
        }).map(([id]) => id);
        expect(ids).toEqual(['a', 'b', 'c', 'z']);
    });

    it('sin `order` el resultado no depende del orden de las claves', () => {
        const one = orderedCriteriaEntries({ x: { label: 'Sabor' }, y: { label: 'Crujiente' } }).map(([id]) => id);
        const two = orderedCriteriaEntries({ y: { label: 'Crujiente' }, x: { label: 'Sabor' } }).map(([id]) => id);
        expect(one).toEqual(two);
    });

    it('ignora entradas vacías', () => {
        expect(orderedCriteriaEntries({ a: null as unknown as { label: string } })).toEqual([]);
        expect(orderedCriteriaEntries(undefined)).toEqual([]);
    });
});

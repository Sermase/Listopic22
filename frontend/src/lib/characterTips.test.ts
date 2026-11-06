import { beforeEach, describe, expect, it } from 'vitest';
import { pickCharacterTip, readCharacterTips, saveCharacterTips, tipText, type CharacterTip } from './characterTips';
import { THEME_CHARACTERS } from './themeCharacters';

const dish: CharacterTip = { kind: 'dish', key: 'd:1', title: 'Bravas', place: 'Bar Uno', score: 8.8, distance: 'a 300 m', to: '/group/p1/Bravas' };
const gem: CharacterTip = { kind: 'gem', key: 'g:2', title: 'La Viña', score: 9.1, count: 2, to: '/place/p2' };
const friend: CharacterTip = { kind: 'friend', key: 'f:3', title: 'Croqueta de jamón', place: 'Casa Carta', friendNote: 'Tu colega Cris le dio un 9', to: '/group/p3/Croqueta' };

describe('chivatazos de los personajes', () => {
    beforeEach(() => localStorage.clear());

    it('se guardan por cuenta: otra cuenta no los ve', () => {
        saveCharacterTips('u1', [dish, gem]);
        expect(readCharacterTips('u1')).toHaveLength(2);
        expect(readCharacterTips('u2')).toEqual([]);
        expect(readCharacterTips(null)).toEqual([]);
    });

    it('no repite el último que dijo', () => {
        expect(pickCharacterTip([dish, gem], 0)?.key).toBe('d:1');
        expect(pickCharacterTip([dish, gem], 0)?.key).toBe('g:2');
        expect(pickCharacterTip([], 0)).toBeNull();
    });

    it('cada chivatazo en boca del personaje', () => {
        const camarero = THEME_CHARACTERS.graphite!;
        expect(tipText(camarero, dish, 0)).toBe('Fuera de carta: a 300 m tienes bravas en Bar Uno con un 8,8, y aún no lo has probado.');
        expect(tipText(camarero, gem, 0)).toBe('Fuera de carta: La Viña tiene un 9,1 y solo 2 reseñas. Casi nadie lo conoce todavía.');
        expect(tipText(camarero, friend, 0)).toBe('Fuera de carta: tu colega Cris le dio un 9 a croqueta de jamón en Casa Carta. ¿Vas a ser menos?');
        expect(tipText(THEME_CHARACTERS.neon!, dish, 0)).toMatch(/^AVISO: A 300 M TIENES BRAVAS/);
    });
});

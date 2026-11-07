import { describe, expect, it } from 'vitest';
import { dishArt } from './dishArt';

describe('dibujo del plato sin foto', () => {
    it('por el nombre del plato', () => {
        expect(dishArt('Bravas').emoji).toBe('🍟');
        expect(dishArt('Croqueta de jamón').emoji).toBe('🧆');
        expect(dishArt('Tarta de queso').emoji).toBe('🍰');
        expect(dishArt('Arroz con leche').emoji).toBe('🍮');
        expect(dishArt('Paella valenciana').emoji).toBe('🥘');
        expect(dishArt('Té verde').emoji).toBe('🍵');
    });

    it('sin coincidencias falsas', () => {
        expect(dishArt('Americana').emoji).toBe('🍽️');
        expect(dishArt('Original').emoji).toBe('🍽️');
        expect(dishArt('Calabaza asada').emoji).not.toBe('🏖️');
    });

    it('si el plato no dice nada, mira el sitio', () => {
        expect(dishArt('La especial', 'Pizzería Napoli').emoji).toBe('🍕');
        expect(dishArt(null, 'Bar Uno').emoji).toBe('🍺');
        expect(dishArt('', undefined).emoji).toBe('🍽️');
    });
});

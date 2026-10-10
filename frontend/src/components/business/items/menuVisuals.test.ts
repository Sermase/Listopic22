import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

import {
    allergenHints,
    buildSectionName,
    cartaLevel,
    formatPriceInput,
    ingredientEmoji,
    itemCompletion,
    joinIngredients,
    sectionEmoji,
    sectionLabel,
    sectionNameTaken,
    splitIngredients,
    splitSectionName,
} from './menuVisuals';

describe('emoji de las secciones', () => {
    it('salen de palabras clave, sin tildes ni mayúsculas', () => {
        expect(sectionEmoji('Entrantes')).toBe('🥗');
        expect(sectionEmoji('Raciones para compartir')).toBe('🥗');
        expect(sectionEmoji('Tapas')).toBe('🫒');
        expect(sectionEmoji('Segundos')).toBe('🍝');
        expect(sectionEmoji('POSTRES caseros')).toBe('🍰');
        expect(sectionEmoji('Cócteles')).toBe('🍸');
        expect(sectionEmoji('Cafés e infusiones')).toBe('☕');
        expect(sectionEmoji('Menú del día')).toBe('📅');
        expect(sectionEmoji('Menú infantil')).toBe('🧒');
        expect(sectionEmoji('Fuera de carta')).toBe('⭐');
        expect(sectionEmoji('Lo que sea')).toBe('🍴');
    });

    it('el emoji elegido a mano va delante del nombre y manda', () => {
        const name = buildSectionName('🍩', 'Dulces');
        expect(splitSectionName(name)).toEqual({ icon: '🍩', label: 'Dulces' });
        expect(sectionEmoji(name)).toBe('🍩');
        expect(sectionLabel(name)).toBe('Dulces');
        expect(splitSectionName('Postres')).toEqual({ icon: '', label: 'Postres' });
    });

    it('una sección ya existe aunque cambie el emoji, las tildes o las mayúsculas', () => {
        expect(sectionNameTaken(['🍰 Postres', 'Cafés'], 'postres')).toBe('🍰 Postres');
        expect(sectionNameTaken(['Cafés'], 'cafes')).toBe('Cafés');
        expect(sectionNameTaken(['Cafés'], 'Cafés', 'Cafés')).toBeNull();
        expect(sectionNameTaken(['Cafés'], 'Vinos')).toBeNull();
    });
});

describe('ingredientes', () => {
    it('se guardan como texto con comas, sin repetidos', () => {
        expect(splitIngredients('queso, Tomate , ,tomate,pan')).toEqual(['queso', 'Tomate', 'pan']);
        expect(joinIngredients(['queso', 'pan'])).toBe('queso, pan');
    });

    it('cada uno con su dibujito (o 🔸)', () => {
        expect(ingredientEmoji('Queso de cabra')).toBe('🧀');
        expect(ingredientEmoji('tomates cherry')).toBe('🍅');
        expect(ingredientEmoji('Salmón ahumado')).toBe('🐟');
        expect(ingredientEmoji('panceta')).toBe('🥓');
        expect(ingredientEmoji('pan de masa madre')).toBe('🍞');
        expect(ingredientEmoji('ajos tiernos')).toBe('🧄');
        expect(ingredientEmoji('cardamomo')).toBe('🔸');
    });

    it('sugieren alérgenos sin marcarlos ni repetir los ya marcados', () => {
        expect(allergenHints(['queso', 'pan', 'mayonesa'], [])).toEqual(['gluten', 'huevo', 'lacteos']);
        expect(allergenHints(['queso', 'pan'], ['gluten'])).toEqual(['lacteos']);
        // «panceta» no es pan ni «manitas», maní.
        expect(allergenHints(['panceta', 'manitas de cerdo'], [])).toEqual([]);
        expect(allergenHints(['gambas al ajillo'], [])).toEqual(['crustaceos']);
    });
});

describe('progreso de un plato', () => {
    const base = { group: 'Postres', price: '5 €', description: 'Casera', allergens: ['lacteos'], ingredients: 'queso' };

    it('5 comprobaciones: sección (que exista), precio, descripción, alérgenos e ingredientes', () => {
        expect(itemCompletion(base, { sections: ['Postres'] })).toMatchObject({ percent: 100, done: 5, nextMissing: null });
        const orphan = itemCompletion(base, { sections: ['Entrantes'] });
        expect(orphan.checks.section).toBe(false);
        expect(orphan.nextMissing?.key).toBe('section');
        expect(itemCompletion({ ...base, allergens: [] }, { sections: ['Postres'] }).percent).toBe(80);
        // «✅ Revisado: sin alérgenos» cuenta (solo en este navegador).
        expect(itemCompletion({ ...base, allergens: [] }, { sections: ['Postres'], reviewedNoAllergens: true }).percent).toBe(100);
    });

    it('niveles de la carta', () => {
        expect(cartaLevel(0)).toBe('🌱 Empezando');
        expect(cartaLevel(25)).toBe('🌱 Empezando');
        expect(cartaLevel(26)).toBe('🍳 Cocinando');
        expect(cartaLevel(61)).toBe('👨‍🍳 Casi lista');
        expect(cartaLevel(91)).toBe('⭐ Carta de estrella');
    });
});

describe('precio', () => {
    it('normaliza como el servidor y deja el texto libre', () => {
        expect(formatPriceInput('6,5')).toBe('6,50 €');
        expect(formatPriceInput('6')).toBe('6,00 €');
        expect(formatPriceInput('12 €/kg')).toBe('12 €/kg');
        expect(formatPriceInput('')).toBe('');
    });
});

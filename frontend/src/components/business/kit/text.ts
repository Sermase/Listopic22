/**
 * Comparación de textos sin mayúsculas ni tildes, para casar lo guardado con
 * las opciones del catálogo:
 *
 *   foldText(' Catalán ') === foldText('catalan')  // true
 *   includesFolded(['Español'], 'español')         // true
 */

export const foldText = (value: string): string => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();

export const sameFolded = (a: string, b: string): boolean => foldText(a) === foldText(b);

export const includesFolded = (list: readonly string[], value: string): boolean => {
    const key = foldText(value);
    return list.some((item) => foldText(item) === key);
};

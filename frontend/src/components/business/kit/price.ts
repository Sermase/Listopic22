/**
 * Precio de un plato tal y como lo guarda el servidor:
 *
 *   formatPriceInput('6,5')          // '6,50 €'
 *   formatPriceInput('€1.2')         // '1,20 €'
 *   formatPriceInput('12 €/kg')      // '12 €/kg' (texto libre, máx. 40)
 *   formatPriceInput('')             // ''
 *
 * Espejo exacto de parseMenuPrice en functions/modules/lib/menu-price.js, para
 * que lo que se ve antes de guardar coincida con lo que queda guardado y no se
 * envíen cambios que el servidor dejaría igual.
 */

export const MAX_PRICE_TEXT = 40;
const MAX_INTEGER_DIGITS = 7;

const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const formatEuros = (cents: number): string => {
    const integer = String(Math.floor(cents / 100));
    const decimals = String(cents % 100).padStart(2, '0');
    return `${groupThousands(integer)},${decimals} €`;
};

const splitAmount = (text: string): { integer: string; decimals: string } | null => {
    if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return null;
    const lastDot = text.lastIndexOf('.');
    const lastComma = text.lastIndexOf(',');

    if (lastDot === -1 && lastComma === -1) return { integer: text, decimals: '' };

    if (lastDot !== -1 && lastComma !== -1) {
        const decimalSep = lastDot > lastComma ? '.' : ',';
        const thousandsSep = decimalSep === '.' ? ',' : '.';
        const [integerPart, decimals, ...rest] = text.split(decimalSep);
        if (rest.length > 0 || !/^\d{1,2}$/.test(decimals)) return null;
        const groups = integerPart.split(thousandsSep);
        if (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((group) => !/^\d{3}$/.test(group))) return null;
        return { integer: groups.join(''), decimals };
    }

    const sep = lastDot !== -1 ? '.' : ',';
    const parts = text.split(sep);
    if (parts.length === 2 && /^\d*$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1])) {
        return { integer: parts[0] || '0', decimals: parts[1] };
    }
    if (/^\d{1,3}$/.test(parts[0]) && parts.slice(1).every((group) => /^\d{3}$/.test(group))) {
        return { integer: parts.join(''), decimals: '' };
    }
    return null;
};

/** Precio normalizado + céntimos (null si es texto libre o está vacío). */
export const parseMenuPrice = (raw: unknown): { price: string; priceCents: number | null } => {
    const text = typeof raw === 'number' && Number.isFinite(raw)
        ? String(raw)
        : (typeof raw === 'string' ? raw.trim() : '');
    if (!text) return { price: '', priceCents: null };

    const compact = text
        .replace(/[\s\u00a0\u202f]+/g, '')
        .replace(/^(?:\u20ac|eur(?:os?)?)/i, '')
        .replace(/(?:\u20ac|eur(?:os?)?)$/i, '');
    const amount = splitAmount(compact);
    const integer = amount ? amount.integer.replace(/^0+(?=\d)/, '') : '';
    if (!amount || integer.length > MAX_INTEGER_DIGITS) {
        return { price: text.slice(0, MAX_PRICE_TEXT), priceCents: null };
    }
    const cents = (Number(integer) * 100) + Number(amount.decimals.padEnd(2, '0') || 0);
    return { price: formatEuros(cents), priceCents: cents };
};

export const formatPriceInput = (raw: string): string => parseMenuPrice(raw).price;

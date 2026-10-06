'use strict';

// functions/modules/lib/menu-price.js
//
// Precio de un plato de la carta Business Pro. El negocio lo escribe a mano
// ("1,2", "6.5€", "€1.2"...) y se guarda normalizado en formato español
// ("1,20 €") junto a los céntimos para poder ordenar o comparar. Lo que no es
// un número ("S/M", "Según mercado") se guarda tal cual, sin céntimos.

const MAX_PRICE_TEXT = 40;
const MAX_INTEGER_DIGITS = 7;

function groupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatEuros(cents) {
  const integer = String(Math.floor(cents / 100));
  const decimals = String(cents % 100).padStart(2, '0');
  return `${groupThousands(integer)},${decimals} €`;
}

// Devuelve { integer, decimals } (dígitos como texto) o null si no es un precio.
function splitAmount(text) {
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return null;
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');

  if (lastDot === -1 && lastComma === -1) return { integer: text, decimals: '' };

  if (lastDot !== -1 && lastComma !== -1) {
    // Los dos separadores: el último es el decimal ("1.234,5" o "1,234.5").
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    const [integerPart, decimals, ...rest] = text.split(decimalSep);
    if (rest.length > 0 || !/^\d{1,2}$/.test(decimals)) return null;
    const groups = integerPart.split(thousandsSep);
    if (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((group) => !/^\d{3}$/.test(group))) return null;
    return { integer: groups.join(''), decimals };
  }

  // Un solo tipo de separador.
  const sep = lastDot !== -1 ? '.' : ',';
  const parts = text.split(sep);
  if (parts.length === 2 && /^\d*$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1])) {
    return { integer: parts[0] || '0', decimals: parts[1] };
  }
  // "1.234" o "1,234,567": separador de miles.
  if (/^\d{1,3}$/.test(parts[0]) && parts.slice(1).every((group) => /^\d{3}$/.test(group))) {
    return { integer: parts.join(''), decimals: '' };
  }
  return null;
}

/**
 * '1,2' → { price: '1,20 €', priceCents: 120 }; '' → { price: '', priceCents: null };
 * 'Según mercado' → { price: 'Según mercado', priceCents: null }.
 */
function parseMenuPrice(raw) {
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
}

module.exports = { parseMenuPrice, formatEuros };

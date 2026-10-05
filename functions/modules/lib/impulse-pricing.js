// functions/modules/lib/impulse-pricing.js
//
// Impulsos de platos destacados. 1 impulso = 0,2 km de radio × 1 día × 1 papeleta.
// Una campaña cuesta tramos de radio × días × intensidad (papeletas en el sorteo
// del carrusel). El saldo de impulsos del negocio vive en places/{id}.spotlightCredits
// y se recarga con paquetes (con descuento) o comprando lo que falta a precio de lista.
// Todo es editable en Developer → Propuestas Pro (config/sponsoredPricing).
// Espejo en frontend/src/services/BusinessProService.ts.

const IMPULSE_RADIUS_STEP_KM = 0.2;
const MAX_IMPULSES_PER_PURCHASE = 1000000;
const STRIPE_MIN_CHARGE_EUR = 0.5;

const DEFAULT_IMPULSE_PRICING = Object.freeze({
  pricePerImpulseEur: 0.05,
  minRadiusKm: 0.2,
  maxRadiusKm: 20,
  maxIntensity: 10,
  maxDays: 60,
  minPurchaseImpulses: 100,
  packs: Object.freeze([
    Object.freeze({ impulses: 100, priceEur: 5 }),
    Object.freeze({ impulses: 500, priceEur: 22.5 }),
    Object.freeze({ impulses: 2000, priceEur: 80 }),
    Object.freeze({ impulses: 10000, priceEur: 350 }),
  ]),
});

const LIMITS = {
  pricePerImpulseEur: [0.001, 10],
  minRadiusKm: [IMPULSE_RADIUS_STEP_KM, 500],
  maxRadiusKm: [IMPULSE_RADIUS_STEP_KM, 500],
  maxIntensity: [1, 100],
  maxDays: [1, 365],
  minPurchaseImpulses: [1, MAX_IMPULSES_PER_PURCHASE],
};
const MAX_PACKS = 8;

const round2 = (value) => Math.round(value * 100) / 100;
const roundRadius = (value) => Number(value.toFixed(1));
const isPositiveNumber = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const isRadiusStep = (value) => Number.isFinite(value)
  && Math.abs((value / IMPULSE_RADIUS_STEP_KM) - Math.round(value / IMPULSE_RADIUS_STEP_KM)) < 1e-6;

function sanitizePacks(raw) {
  if (!Array.isArray(raw)) return null;
  const packs = raw
    .filter((pack) => pack && Number.isInteger(pack.impulses) && pack.impulses > 0
      && pack.impulses <= MAX_IMPULSES_PER_PURCHASE
      && isPositiveNumber(pack.priceEur) && pack.priceEur >= STRIPE_MIN_CHARGE_EUR)
    .map((pack) => ({ impulses: pack.impulses, priceEur: round2(pack.priceEur) }))
    .sort((a, b) => a.impulses - b.impulses)
    .slice(0, MAX_PACKS);
  return packs;
}

/**
 * Configuración vigente a partir de config/sponsoredPricing. Ignora la fórmula
 * antigua por semanas (pricePerRadiusStepPerWeek): el precio por impulso es
 * nuevo y, si no se ha guardado, vale el de por defecto.
 */
function normalizeImpulsePricing(data = {}) {
  const pricing = {
    pricePerImpulseEur: DEFAULT_IMPULSE_PRICING.pricePerImpulseEur,
    minRadiusKm: DEFAULT_IMPULSE_PRICING.minRadiusKm,
    maxRadiusKm: DEFAULT_IMPULSE_PRICING.maxRadiusKm,
    maxIntensity: DEFAULT_IMPULSE_PRICING.maxIntensity,
    maxDays: DEFAULT_IMPULSE_PRICING.maxDays,
    minPurchaseImpulses: DEFAULT_IMPULSE_PRICING.minPurchaseImpulses,
    packs: DEFAULT_IMPULSE_PRICING.packs.map((pack) => ({ ...pack })),
  };
  const source = data || {};
  for (const key of Object.keys(LIMITS)) {
    const [min, max] = LIMITS[key];
    if (isPositiveNumber(source[key]) && source[key] >= min && source[key] <= max) pricing[key] = source[key];
  }
  // Compatibilidad con la configuración anterior (impulsos = papeletas por semanas).
  if (!isPositiveNumber(source.maxIntensity) && Number.isInteger(source.maxUnitsPerCampaign)
      && source.maxUnitsPerCampaign >= 1 && source.maxUnitsPerCampaign <= LIMITS.maxIntensity[1]) {
    pricing.maxIntensity = source.maxUnitsPerCampaign;
  }
  if (!isPositiveNumber(source.maxDays) && Number.isInteger(source.maxWeeks)
      && source.maxWeeks >= 1 && source.maxWeeks * 7 <= LIMITS.maxDays[1]) {
    pricing.maxDays = source.maxWeeks * 7;
  }
  const packs = sanitizePacks(source.packs);
  if (packs) pricing.packs = packs;

  pricing.maxIntensity = Math.floor(pricing.maxIntensity);
  pricing.maxDays = Math.floor(pricing.maxDays);
  pricing.minPurchaseImpulses = Math.floor(pricing.minPurchaseImpulses);
  pricing.minRadiusKm = roundRadius(Math.ceil((pricing.minRadiusKm / IMPULSE_RADIUS_STEP_KM) - 1e-9) * IMPULSE_RADIUS_STEP_KM);
  pricing.maxRadiusKm = roundRadius(Math.floor((pricing.maxRadiusKm / IMPULSE_RADIUS_STEP_KM) + 1e-9) * IMPULSE_RADIUS_STEP_KM);
  if (pricing.maxRadiusKm < pricing.minRadiusKm) pricing.maxRadiusKm = pricing.minRadiusKm;
  return pricing;
}

/** Lee config/sponsoredPricing y devuelve la configuración normalizada. */
async function loadImpulsePricing(db) {
  const snap = await db.collection("config").doc("sponsoredPricing").get().catch(() => null);
  return normalizeImpulsePricing(snap?.exists ? snap.data() || {} : {});
}

/**
 * Valida lo que guarda un jefe desde Developer. Devuelve { pricing } o { error }.
 */
function validateImpulsePricingInput(input = {}) {
  const value = (key) => Number(input[key]);
  const price = value("pricePerImpulseEur");
  if (!Number.isFinite(price) || price < LIMITS.pricePerImpulseEur[0] || price > LIMITS.pricePerImpulseEur[1]) {
    return { error: "El precio por impulso debe estar entre 0,001 € y 10 €." };
  }
  const minRadiusKm = value("minRadiusKm");
  const maxRadiusKm = value("maxRadiusKm");
  if (!isRadiusStep(minRadiusKm) || minRadiusKm < IMPULSE_RADIUS_STEP_KM || minRadiusKm > LIMITS.minRadiusKm[1]) {
    return { error: "El radio mínimo debe ser un múltiplo de 0,2 km (hasta 500 km)." };
  }
  if (!isRadiusStep(maxRadiusKm) || maxRadiusKm < minRadiusKm || maxRadiusKm > LIMITS.maxRadiusKm[1]) {
    return { error: "El radio máximo debe ser un múltiplo de 0,2 km, no menor que el mínimo y hasta 500 km." };
  }
  const maxIntensity = value("maxIntensity");
  if (!Number.isInteger(maxIntensity) || maxIntensity < 1 || maxIntensity > LIMITS.maxIntensity[1]) {
    return { error: "La intensidad máxima debe ser un entero entre 1 y 100." };
  }
  const maxDays = value("maxDays");
  if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > LIMITS.maxDays[1]) {
    return { error: "La duración máxima debe ser un entero entre 1 y 365 días." };
  }
  const minPurchaseImpulses = value("minPurchaseImpulses");
  if (!Number.isInteger(minPurchaseImpulses) || minPurchaseImpulses < 1 || minPurchaseImpulses > MAX_IMPULSES_PER_PURCHASE) {
    return { error: "La compra mínima debe ser un entero de impulsos mayor que 0." };
  }
  if (round2(minPurchaseImpulses * price) < STRIPE_MIN_CHARGE_EUR) {
    return { error: "La compra mínima debe costar al menos 0,50 € (mínimo de Stripe)." };
  }
  if (!Array.isArray(input.packs) || input.packs.length > MAX_PACKS) {
    return { error: `Define entre 0 y ${MAX_PACKS} paquetes.` };
  }
  const rawPacks = input.packs.map((pack) => ({ impulses: Number(pack?.impulses), priceEur: Number(pack?.priceEur) }));
  const packs = sanitizePacks(rawPacks);
  if (packs.length !== rawPacks.length) {
    return { error: "Cada paquete necesita un número entero de impulsos y un precio de al menos 0,50 €." };
  }
  if (new Set(packs.map((pack) => pack.impulses)).size !== packs.length) {
    return { error: "No puede haber dos paquetes con los mismos impulsos." };
  }
  const savedPrice = Math.round(price * 10000) / 10000;
  const overpriced = packs.find((pack) => pack.priceEur > round2(pack.impulses * savedPrice) + 1e-9);
  if (overpriced) {
    return {
      error: `El paquete de ${overpriced.impulses} impulsos cuesta más que comprarlos sueltos (${round2(overpriced.impulses * savedPrice)} €). Bájalo o quítalo.`,
    };
  }
  return {
    pricing: {
      pricePerImpulseEur: savedPrice,
      minRadiusKm: roundRadius(minRadiusKm),
      maxRadiusKm: roundRadius(maxRadiusKm),
      maxIntensity,
      maxDays,
      minPurchaseImpulses,
      packs,
    },
  };
}

function radiusSteps(radiusKm, pricing) {
  const effectiveRadius = Math.max(pricing.minRadiusKm, radiusKm);
  return Math.ceil((effectiveRadius / IMPULSE_RADIUS_STEP_KM) - 1e-9);
}

/** Impulsos que consume una campaña: tramos de 0,2 km × días × intensidad. */
function campaignImpulses({ radiusKm, days, intensity }, pricing) {
  return radiusSteps(radiusKm, pricing) * days * intensity;
}

function impulsesPriceEur(impulses, pricing) {
  return round2(impulses * pricing.pricePerImpulseEur);
}

/**
 * Normaliza la petición de campaña. El formato anterior (units, weeks) se
 * rechaza en vez de traducirse: la web o la app antiguas enseñan otro precio.
 */
function normalizeCampaignRequest(data = {}, pricing) {
  if (data.days === undefined || data.intensity === undefined) {
    return {
      error: "El formulario de impulsos ha cambiado. Recarga la página o actualiza la app para ver el precio actual.",
      code: "failed-precondition",
    };
  }
  const intensity = Number(data.intensity);
  const days = Number(data.days);
  const radiusKm = Number(data.radiusKm);
  if (!Number.isInteger(intensity) || intensity < 1 || intensity > pricing.maxIntensity) {
    return { error: `La intensidad debe estar entre ×1 y ×${pricing.maxIntensity}.` };
  }
  if (!Number.isFinite(radiusKm) || radiusKm < pricing.minRadiusKm - 1e-9 || radiusKm > pricing.maxRadiusKm + 1e-9) {
    return { error: `El radio debe estar entre ${pricing.minRadiusKm} y ${pricing.maxRadiusKm} km.` };
  }
  if (!isRadiusStep(radiusKm)) return { error: "El radio debe avanzar en tramos de 0,2 km." };
  if (!Number.isInteger(days) || days < 1 || days > pricing.maxDays) {
    return { error: `La duración debe estar entre 1 y ${pricing.maxDays} días.` };
  }
  return { intensity, days, radiusKm: roundRadius(radiusKm) };
}

/**
 * Compra de impulsos: un paquete por índice o una cantidad suelta a precio de
 * lista (al menos minPurchaseImpulses). Devuelve { impulses, priceEur, packIndex } o { error }.
 */
function resolveImpulsePurchase(data = {}, pricing) {
  if (data.packIndex !== undefined && data.packIndex !== null) {
    const index = Number(data.packIndex);
    const pack = Number.isInteger(index) ? pricing.packs[index] : null;
    if (!pack) return { error: "Ese paquete ya no existe. Recarga la página." };
    return { impulses: pack.impulses, priceEur: pack.priceEur, packIndex: index };
  }
  const impulses = Number(data.impulses);
  if (!Number.isInteger(impulses) || impulses < 1 || impulses > MAX_IMPULSES_PER_PURCHASE) {
    return { error: "Indica cuántos impulsos quieres comprar." };
  }
  const billed = Math.max(impulses, pricing.minPurchaseImpulses);
  const priceEur = impulsesPriceEur(billed, pricing);
  if (priceEur < STRIPE_MIN_CHARGE_EUR) return { error: "La compra mínima es de 0,50 €." };
  return { impulses: billed, priceEur, packIndex: null };
}

module.exports = {
  IMPULSE_RADIUS_STEP_KM,
  DEFAULT_IMPULSE_PRICING,
  normalizeImpulsePricing,
  loadImpulsePricing,
  validateImpulsePricingInput,
  radiusSteps,
  campaignImpulses,
  impulsesPriceEur,
  normalizeCampaignRequest,
  resolveImpulsePurchase,
};

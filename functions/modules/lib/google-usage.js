'use strict';

// Uso de Google Places/Geocoding por SKU y mes (Mejoras/google-places-skus.md).
// Precios y cupos gratis publicados por Google el 30/09/2026: revisarlos antes de una tanda grande.
// El mes de los cupos es el de facturación de Google (hora del Pacífico).

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions/v2');

const GOOGLE_SKUS = Object.freeze({
  legacy_details: { label: 'Places Details (heredada)', freePerMonth: 5000, usdPer1000: 17 },
  legacy_basic: { label: 'Basic Data (heredada)', freePerMonth: null, usdPer1000: 0 },
  legacy_contact: { label: 'Contact Data (heredada)', freePerMonth: 1000, usdPer1000: 3 },
  legacy_atmosphere: { label: 'Atmosphere Data (heredada)', freePerMonth: 1000, usdPer1000: 5 },
  legacy_text_search: { label: 'Text Search (heredada)', freePerMonth: 5000, usdPer1000: 32 },
  legacy_nearby_search: { label: 'Nearby Search (heredada)', freePerMonth: 5000, usdPer1000: 32 },
  geocoding: { label: 'Geocoding', freePerMonth: 10000, usdPer1000: 5 },
  details_ids_only: { label: 'Place Details Essentials (IDs Only)', freePerMonth: null, usdPer1000: 0 },
  details_essentials: { label: 'Place Details Essentials', freePerMonth: 10000, usdPer1000: 5 },
  details_enterprise_atmosphere: { label: 'Place Details Enterprise + Atmosphere', freePerMonth: 1000, usdPer1000: 25 },
  details_photos: { label: 'Place Details Photos', freePerMonth: 1000, usdPer1000: 7 },
});

// SKUs que consume cada acción registrada con logApiUsage (una vez por llamada).
// Búsquedas heredadas: Google devuelve todos los campos «y factura en consecuencia»;
// contamos también Contact y Atmosphere (cota superior, sin desglose oficial).
const LEGACY_DETAILS_FULL = ['legacy_details', 'legacy_basic', 'legacy_contact', 'legacy_atmosphere'];
const ACTION_SKUS = Object.freeze({
  place_details_google: [...LEGACY_DETAILS_FULL, 'details_enterprise_atmosphere'],
  admin_update_place_google: [...LEGACY_DETAILS_FULL, 'details_enterprise_atmosphere'],
  admin_refresh_place_location: ['details_essentials'],
  sync_place_status_google: ['legacy_details', 'legacy_basic'],
  nearby_search_google: ['legacy_nearby_search', 'legacy_contact', 'legacy_atmosphere'],
  text_search_google: ['legacy_text_search', 'legacy_contact', 'legacy_atmosphere'],
  reverse_geocode: ['geocoding'],
});

const BILLING_TIME_ZONE = 'America/Los_Angeles';

/** 'YYYY-MM' del mes de facturación de Google. */
function billingMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: BILLING_TIME_ZONE, year: 'numeric', month: '2-digit' }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}`;
}

/** Filas para Developer: usadas, gratis, restantes y coste estimado por SKU. */
function usageRows(skuCounts = {}) {
  return Object.entries(GOOGLE_SKUS).map(([sku, info]) => {
    const used = Number(skuCounts[sku]) || 0;
    const free = info.freePerMonth;
    const billable = free === null ? 0 : Math.max(0, used - free);
    return {
      sku,
      label: info.label,
      used,
      free,
      remaining: free === null ? null : Math.max(0, free - used),
      usdPer1000: info.usdPer1000,
      estimatedUsd: Math.round(billable * info.usdPer1000 * 100 / 1000) / 100,
    };
  });
}

/** Suma las SKUs al contador del mes (googleUsage/{YYYY-MM}). No lanza: solo registra el error. */
async function recordGoogleSkus(skus, { action = null, count = 1 } = {}) {
  const valid = (skus || []).filter((sku) => GOOGLE_SKUS[sku]);
  if (valid.length === 0 || !(count > 0)) return;
  const month = billingMonth();
  const payload = { month, skus: {}, updatedAt: FieldValue.serverTimestamp() };
  valid.forEach((sku) => { payload.skus[sku] = FieldValue.increment(count); });
  if (action) payload.actions = { [action]: FieldValue.increment(count) };
  try {
    await getFirestore().collection('googleUsage').doc(month).set(payload, { merge: true });
  } catch (error) {
    logger.warn('google-usage: no se pudo registrar el consumo', { action, error: error.message });
  }
}

/** Campos del sitio que dejan constancia del último refresco desde Google. */
function refreshStamp(type, skus) {
  return {
    lastGoogleRefreshAt: FieldValue.serverTimestamp(),
    lastGoogleRefreshType: type,
    lastGoogleRefreshSkus: (skus || []).filter((sku) => GOOGLE_SKUS[sku]),
  };
}

module.exports = { GOOGLE_SKUS, ACTION_SKUS, billingMonth, usageRows, recordGoogleSkus, refreshStamp };
